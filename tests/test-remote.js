'use strict';

// Fernzugang im WLAN (Issue #46/#50): Verschlüsselung, Einmal-Code, Passwort, Bestätigung am PC, Wiederholungsschutz,
// Sperre, Geräte entfernen, nur private Netze. Echter HTTP-Server auf 127.0.0.1.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const nacl = require('tweetnacl');
const { createRemote, seal, unseal, isPrivateIp } = require('../src/main/remote');
const { validators } = require('../src/main/validate');

function setup({ approve = true, requireApproval = false, hostName = '127.0.0.1' } = {}) {
  const data = { remote: { port: 0, requireApproval } };
  const store = { get: () => ({ ...data }), set: (k, v) => (data[k] = v) };
  let vaultRaw = null;
  const vault = { get: () => vaultRaw, set: (v) => (vaultRaw = v), clear: () => (vaultRaw = null) };
  const sent = [];
  const service = {
    listGuilds: () => [{ id: '222222222222222222', name: 'Testserver' }],
    listChannels: async () => [{ category: null, channels: [{ id: '444444444444444401', name: 'allgemein', type: 'text', canSend: true }] }],
    listDMs: async () => [],
    getMessages: async () => ({ messages: [{ id: '1', content: 'Hallo', author: { name: 'Anna' }, createdTimestamp: 1 }] }),
    sendMessage: async (p) => (sent.push(p), { id: '2', content: p.content }),
    getStatus: () => ({ bot: { displayName: 'PK' } }),
  };
  const events = [];
  const remote = createRemote({
    service,
    validators,
    store,
    vault,
    emit: (t, p) => {
      events.push({ t, p });
      // „Bestätigung am PC“ automatisch
      if (t === 'remote:pending' && !p.done) setImmediate(() => remote.decide({ id: p.id, allow: approve }));
    },
    webDir: path.join(__dirname, '..', 'src', 'remote-web'),
    naclPath: require.resolve('tweetnacl/nacl-fast.min.js'),
    lanAddresses: () => ['127.0.0.1'],
    hostName,
  });
  return { remote, store, sent, events, vault: () => vaultRaw };
}

const post = async (url, body) => (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
const keyFromUrl = (u) => {
  const h = new URLSearchParams(new URL(u).hash.slice(1));
  return { pairId: h.get('p'), key: new Uint8Array(Buffer.from(h.get('k'), 'base64url')), base: u.split('#')[0] };
};

async function pairDevice(ctx, password = 'geheim12345') {
  const { url } = ctx.remote.createPairing();
  const { pairId, key, base } = keyFromUrl(url);
  const res = await post(`${base}api/pair`, { p: pairId, ...seal({ password, name: 'Handy', t: Date.now() }, key) });
  return { res: res.n ? unseal(res, key) : res, base, pairId, key };
}

test('Ab Werk aus; Einschalten nur mit Passwort (mind. 8 Zeichen)', async () => {
  const { remote } = setup();
  assert.equal(remote.status().enabled, false);
  await assert.rejects(remote.setEnabled({ on: true }), /Passwort/);
  assert.throws(() => remote.setPassword({ password: 'kurz' }), /8 Zeichen/);
  remote.setPassword({ password: 'geheim12345' });
  const st = await remote.setEnabled({ on: true });
  assert.equal(st.running, true);
  await remote.setEnabled({ on: false });
  assert.equal(remote.status().running, false);
});

test('Koppeln: Einmal-Code + Passwort + Bestätigung → Gerät; Code danach verbraucht; Schlüssel im Tresor', async () => {
  const ctx = setup();
  ctx.remote.setPassword({ password: 'geheim12345' });
  await ctx.remote.setEnabled({ on: true });
  const { res, base, pairId, key } = await pairDevice(ctx);
  assert.ok(res.deviceId && res.deviceKey);
  assert.equal(ctx.remote.status().devices.length, 1);
  assert.ok(!('key' in ctx.remote.status().devices[0])); // Schlüssel nie an die Oberfläche
  assert.match(ctx.vault(), /deviceKey|key/);
  assert.ok(!JSON.stringify(ctx.store.get()).includes(res.deviceKey)); // nicht in settings.json
  // gleicher Code nochmal → abgelehnt
  const again = await post(`${base}api/pair`, { p: pairId, ...seal({ password: 'geheim12345', name: 'X', t: Date.now() }, key) });
  assert.match(again.error, /abgelaufen oder schon benutzt/);
  await ctx.remote.stop();
});

test('Falsches Passwort und Ablehnung am PC → kein Gerät', async () => {
  const ctx = setup({ approve: false });
  ctx.remote.setPassword({ password: 'geheim12345' });
  await ctx.remote.setEnabled({ on: true });
  assert.match((await pairDevice(ctx, 'falsch')).res.error, /Falsches Passwort/);
  assert.match((await pairDevice(ctx)).res.error, /abgelehnt/);
  assert.equal(ctx.remote.status().devices.length, 0);
  await ctx.remote.stop();
});

test('Sitzung: Passwort nötig, dann lesen + senden (als Bot, ohne Pings); Wiederholung abgewiesen', async () => {
  const ctx = setup();
  ctx.remote.setPassword({ password: 'geheim12345' });
  await ctx.remote.setEnabled({ on: true });
  const { res, base } = await pairDevice(ctx);
  const key = new Uint8Array(Buffer.from(res.deviceKey, 'base64'));
  const call = async (op, args, session, t = Date.now()) => {
    const body = { d: res.deviceId, ...seal({ op, args, session, t }, key) };
    const r = await post(`${base}api`, body);
    return { body, out: r.n ? unseal(r, key) : r };
  };
  assert.match((await call('guilds')).out.error, /neu anmelden/); // ohne Sitzung nichts
  assert.match((await call('login', { password: 'nein' })).out.error, /Falsches Passwort/);
  const { out: login } = await call('login', { password: 'geheim12345' });
  assert.ok(login.session);
  assert.equal((await call('guilds', null, login.session)).out.data[0].name, 'Testserver');
  const { body, out } = await call('send', { channelId: '444444444444444401', content: 'Hi @everyone' }, login.session);
  assert.equal(out.data.content, 'Hi @everyone');
  assert.deepEqual(ctx.sent[0].mentions, { users: [], roles: [], everyone: false });
  // exakt gleiche Anfrage nochmal (Wiederholungsangriff) → abgewiesen
  const replay = await post(`${base}api`, body);
  assert.match(replay.error, /Ungültige Anfrage/);
  // alter Zeitstempel → abgewiesen
  assert.match((await call('guilds', null, login.session, Date.now() - 10 * 60 * 1000)).out.error, /Ungültige Anfrage/);
  // Aktivität wird protokolliert
  assert.ok(ctx.remote.status().activity.some((a) => a.action === 'Nachricht gesendet' && a.device === 'Handy'));
  await ctx.remote.stop();
});

test('Jede Nachricht am PC bestätigen (optional); Gerät entfernen sperrt sofort', async () => {
  const ctx = setup({ approve: false, requireApproval: true });
  ctx.remote.setPassword({ password: 'geheim12345' });
  await ctx.remote.setEnabled({ on: true });
  // Kopplung braucht hier eine Zusage → kurz auf „zulassen“ stellen
  const allow = ctx.remote.decide;
  let mode = true;
  ctx.remote.decide = (x) => allow({ ...x, allow: mode });
  const ev = ctx.events;
  const { res, base } = await (async () => {
    const r = ctx.remote.createPairing();
    const { pairId, key, base: b } = keyFromUrl(r.url);
    const p = post(`${b}api/pair`, { p: pairId, ...seal({ password: 'geheim12345', name: 'Tablet', t: Date.now() }, key) });
    await new Promise((s) => setTimeout(s, 50));
    const pend = ev.filter((e) => e.t === 'remote:pending' && !e.p.done).at(-1);
    allow({ id: pend.p.id, allow: true });
    const out = await p;
    return { res: unseal(out, key), base: b };
  })();
  const key = new Uint8Array(Buffer.from(res.deviceKey, 'base64'));
  const call = async (op, args, session) => {
    const r = await post(`${base}api`, { d: res.deviceId, ...seal({ op, args, session, t: Date.now() }, key) });
    return r.n ? unseal(r, key) : r;
  };
  const login = await call('login', { password: 'geheim12345' });
  mode = false;
  assert.match((await call('send', { channelId: '444444444444444401', content: 'x' }, login.session)).error, /abgelehnt/);
  assert.equal(ctx.sent.length, 0);
  ctx.remote.removeDevice({ id: res.deviceId });
  const gone = await post(`${base}api`, { d: res.deviceId, ...seal({ op: 'guilds', session: login.session, t: Date.now() }, key) });
  assert.equal(gone.unpaired, true);
  await ctx.remote.stop();
});

test('Nur private Netze; Web-Oberfläche mit strenger CSP', async () => {
  assert.equal(isPrivateIp('192.168.178.20'), true);
  assert.equal(isPrivateIp('10.0.0.3'), true);
  assert.equal(isPrivateIp('127.0.0.1'), true);
  assert.equal(isPrivateIp('8.8.8.8'), false);
  assert.equal(isPrivateIp('172.32.0.1'), false);
  const ctx = setup();
  ctx.remote.setPassword({ password: 'geheim12345' });
  await ctx.remote.setEnabled({ on: true });
  const port = ctx.remote.status().running && new URL(ctx.remote.createPairing().url).port;
  const r = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(await r.text(), /Fernzugang/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/nacl.js`)).status, 200);
  await ctx.remote.stop();
});

test('Verschlüsselung: falscher Schlüssel oder veränderte Daten → nicht lesbar', () => {
  const k1 = nacl.randomBytes(32);
  const k2 = nacl.randomBytes(32);
  const s = seal({ a: 1 }, k1);
  assert.deepEqual(unseal(s, k1), { a: 1 });
  assert.equal(unseal(s, k2), null);
  const broken = { ...s, c: Buffer.from(Buffer.from(s.c, 'base64').map((b, i) => (i === 3 ? b ^ 1 : b))).toString('base64') };
  assert.equal(unseal(broken, k1), null);
});

test('Issue #53/#50: Link enthält nur den PC-Namen, nie eine IP; ohne PC-Namen kein Link', async () => {
  const ctx = setup({ hostName: 'morni.local' });
  ctx.remote.setPassword({ password: 'geheim12345' });
  await ctx.remote.setEnabled({ on: true });
  const r = ctx.remote.createPairing();
  assert.equal(new URL(r.url).hostname, 'morni.local');
  assert.doesNotMatch(r.url.split('#')[0], /\d+\.\d+\.\d+\.\d+/);
  assert.equal('fallbackUrl' in r, false);
  assert.equal(ctx.remote.status().host, 'morni.local');
  await ctx.remote.stop();
  const none = setup({ hostName: null });
  none.remote.setPassword({ password: 'geheim12345' });
  await none.remote.setEnabled({ on: true });
  assert.throws(() => none.remote.createPairing(), /Name dieses PCs/);
  await none.remote.stop();
});
