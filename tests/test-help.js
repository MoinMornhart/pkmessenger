'use strict';

// Fernhilfe (Issue #79): Kopplung per Einmal-Code + Bestätigung, geschwärzte Sicht, nur erlaubte Aktionen,
// nur ein Helfer, Beenden schließt sofort. Echter HTTP-Server auf 127.0.0.1.
const test = require('node:test');
const assert = require('node:assert/strict');
const nacl = require('tweetnacl');
const { createHelp, isPrivateIp } = require('../src/main/help');

const b64 = (u8) => Buffer.from(u8).toString('base64');
const seal = (obj, key) => {
  const n = nacl.randomBytes(nacl.secretbox.nonceLength);
  return { n: b64(n), c: b64(nacl.secretbox(Buffer.from(JSON.stringify(obj)), n, key)) };
};
const unseal = (msg, key) => {
  if (!msg?.c) return msg;
  const plain = nacl.secretbox.open(new Uint8Array(Buffer.from(msg.c, 'base64')), new Uint8Array(Buffer.from(msg.n, 'base64')), key);
  return plain ? JSON.parse(Buffer.from(plain).toString('utf8')) : null;
};
const post = async (base, path, body) => (await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
// Schlüssel steckt im Link hinter „#c=“ (wie im echten Fluss der Helfer ihn aus dem QR bekommt)
const keyFromUrl = (url) => new Uint8Array(Buffer.from(new URL(url).hash.replace('#c=', ''), 'base64'));

function setup({ approve = true, view = { screen: 'setup', fields: [{ id: 'wizard-next', label: 'Weiter' }, { id: 'token-input', label: 'Bot-Token', secret: true }] } } = {}) {
  const events = [];
  const applied = [];
  let current = view;
  const help = createHelp({
    emit: (t, p) => {
      events.push({ t, p });
      if (t === 'help:pending' && !p.done) setImmediate(() => help.decide({ id: p.id, allow: approve }));
    },
    getView: () => current,
    applyAction: (a) => applied.push(a),
    lanAddresses: () => ['127.0.0.1'],
    hostName: 'test.local',
    port: 0,
  });
  return { help, events, applied, setView: (v) => (current = v) };
}

async function start(ctx) {
  const info = await ctx.help.request();
  const key = keyFromUrl(info.url);
  const base = `http://127.0.0.1:${info.port}`;
  return { ...info, key, base };
}
async function pairOk(ctx, s, name = 'Annas Helfer') {
  const res = await post(s.base, '/pair', { code: s.code, ...seal({ name, t: Date.now() }, s.key) });
  return unseal(res, s.key);
}

test('Nur private Netze', () => {
  assert.equal(isPrivateIp('192.168.1.5'), true);
  assert.equal(isPrivateIp('127.0.0.1'), true);
  assert.equal(isPrivateIp('8.8.8.8'), false);
});

test('Ab Werk aus; „Hilfe anfordern“ startet Server + Einmal-Code ohne IP im Link', async () => {
  const ctx = setup();
  assert.equal(ctx.help.status().running, false);
  const s = await start(ctx);
  assert.match(s.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(ctx.help.status().waitingForHelper, true);
  assert.match(s.url, /^http:\/\/test\.local:\d+\/help\//);
  assert.doesNotMatch(s.url.split('#')[0], /\d+\.\d+\.\d+\.\d+/);
  ctx.help.stop();
  assert.equal(ctx.help.status().running, false);
});

test('Koppeln: Code + Bestätigung → verbunden; falscher Code abgelehnt', async () => {
  const ctx = setup();
  const s = await start(ctx);
  assert.match((await post(s.base, '/pair', { code: 'WRONG1', ...seal({ name: 'X', t: Date.now() }, s.key) })).error, /Falscher Code/);
  const ok = await pairOk(ctx, s);
  assert.equal(ok.ok, true);
  assert.equal(ctx.help.status().connected, true);
  // Code ist verbraucht → zweite Kopplung scheitert
  assert.match((await post(s.base, '/pair', { code: s.code, ...seal({ name: 'Y', t: Date.now() }, s.key) })).error, /abgelaufen|bereits/);
  ctx.help.stop();
});

test('Ablehnung am PC → keine Verbindung', async () => {
  const ctx = setup({ approve: false });
  const s = await start(ctx);
  assert.match((await pairOk(ctx, s)).error, /abgelehnt|keine Antwort/);
  assert.equal(ctx.help.status().connected, false);
  ctx.help.stop();
});

test('Verbundener Helfer: geschwärzte Sicht, erlaubte Aktion, Geheimnis-Feld & Chat gesperrt, Wiederholung abgewiesen', async () => {
  const ctx = setup();
  const s = await start(ctx);
  await pairOk(ctx, s);
  const call = async (path, payload) => {
    const body = seal({ ...payload, t: Date.now() }, s.key);
    const r = await post(s.base, path, body);
    return { body, out: unseal(r, s.key) };
  };
  // Sicht: Einrichtung sichtbar, Token-Feld als geheim markiert
  const { out: view } = await call('/view', {});
  assert.equal(view.view.hidden, false);
  assert.equal(view.view.fields.find((f) => f.id === 'token-input').secret, true);
  // erlaubte Aktion kommt an
  const { body, out: act } = await call('/act', { action: { type: 'click', target: 'wizard-next' } });
  assert.equal(act.ok, true);
  assert.deepEqual(ctx.applied.at(-1), { type: 'click', target: 'wizard-next' });
  // Token-Feld: abgelehnt, nichts angewandt
  assert.match((await call('/act', { action: { type: 'click', target: 'token-input' } })).out.rejected, /Sicherheits|erlaubt/);
  assert.equal(ctx.applied.length, 1);
  // exakt gleiche Anfrage nochmal (Wiederholung) → abgewiesen
  assert.match((await post(s.base, '/act', body)).error, /Wiederhol|Ungültig/);
  // Nutzer wechselt in den Chat → Helfer sieht nichts, Aktionen gesperrt
  ctx.setView({ screen: 'workspace', fields: [] });
  assert.equal((await call('/view', {})).out.view.hidden, true);
  assert.match((await call('/act', { action: { type: 'click', target: 'wizard-next' } })).out.rejected, /Chat/);
  ctx.help.stop();
});

test('Nur Zusehen: Mitsteuern gesperrt', async () => {
  const ctx = setup();
  const s = await start(ctx);
  await pairOk(ctx, s);
  ctx.help.setControl({ on: false });
  const call = (path, payload) => post(s.base, path, seal({ ...payload, t: Date.now() }, s.key)).then((r) => unseal(r, s.key));
  assert.match((await call('/act', { action: { type: 'click', target: 'wizard-next' } })).rejected, /Zusehen/);
  assert.equal(ctx.applied.length, 0);
  ctx.help.stop();
});

test('Beenden schließt den Server sofort', async () => {
  const ctx = setup();
  const s = await start(ctx);
  await pairOk(ctx, s);
  ctx.help.stop();
  assert.equal(ctx.help.status().running, false);
  await assert.rejects(fetch(`${s.base}/view`, { method: 'POST', body: '{}' }));
});
