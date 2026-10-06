'use strict';

// IPC-Sicherheit: nur eigene Fenster, jede Eingabe validiert, Fehler als { ok:false } statt Exception.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHandlers, wrap, registerIpc } = require('../src/main/ipc');
const { validators } = require('../src/main/validate');

const trusted = () => true;

function deps(overrides = {}) {
  const calls = [];
  const service = new Proxy({}, { get: (_t, name) => (arg) => (calls.push({ name, arg }), overrides[name] ? overrides[name](arg) : { called: name }) });
  const store = { get: () => ({ readMarkers: {} }), set: (k, v) => calls.push({ name: 'store.set', arg: [k, v] }), setReadMarker: (c, m) => calls.push({ name: 'store.mark', arg: [c, m] }) };
  return { calls, deps: { service, store, openEnvFile: () => ({ opened: true }), openExternal: (u) => calls.push({ name: 'openExternal', arg: u }) } };
}

test('Alle Kanäle sind registriert (pk:-Präfix)', () => {
  const registered = [];
  const ipcMain = { handle: (ch) => registered.push(ch) };
  registerIpc(ipcMain, deps().deps, trusted);
  assert.ok(registered.length >= 14);
  assert.ok(registered.every((c) => c.startsWith('pk:')));
});

test('Gültiger Aufruf → { ok: true, data }', async () => {
  const { deps: d, calls } = deps();
  const h = buildHandlers(d);
  const res = await wrap(h['pk:list-channels'], trusted)({}, { guildId: '222222222222222222' });
  assert.deepEqual(res, { ok: true, data: { called: 'listChannels' } });
  assert.deepEqual(calls[0], { name: 'listChannels', arg: { guildId: '222222222222222222' } });
});

test('Kaputte Payloads werden abgelehnt und erreichen den Service NIE', async () => {
  const { deps: d, calls } = deps();
  const h = buildHandlers(d);
  const bad = [
    ['pk:list-channels', null],
    ['pk:list-channels', 'x'],
    ['pk:list-channels', { guildId: 123 }],
    ['pk:list-channels', { guildId: '1; DROP' }],
    ['pk:get-messages', { channelId: '444444444444444401', limit: 1e9 }],
    ['pk:send-message', { channelId: '444444444444444401', content: '' }],
    ['pk:send-message', { channelId: '444444444444444401', content: 'x', mentions: { users: ['abc'] } }],
    ['pk:send-message', { channelId: '444444444444444401', content: 'x', mentions: { everyone: 'yes' } }],
    ['pk:send-message', JSON.parse('{"__proto__":{"x":1},"channelId":"1"}')],
    ['pk:search-mentionables', { guildId: '222222222222222222', query: 'x'.repeat(100) }],
    ['pk:open-external', { url: 'file:///C:/Windows/System32/calc.exe' }],
    ['pk:open-external', { url: 'javascript:alert(1)' }],
    ['pk:set-read-marker', { channelId: '444444444444444401', messageId: 'nope' }],
  ];
  for (const [ch, payload] of bad) {
    const res = await wrap(h[ch], trusted)({}, payload);
    assert.equal(res.ok, false, `${ch} ${JSON.stringify(payload)} hätte abgelehnt werden müssen`);
    assert.equal(res.error.code, 'VALIDATION');
    assert.ok(res.error.message.length > 0);
  }
  assert.deepEqual(calls, []);
});

test('Anfrage aus fremder Quelle → FORBIDDEN', async () => {
  const { deps: d, calls } = deps();
  const res = await wrap(buildHandlers(d)['pk:list-guilds'], () => false)({}, undefined);
  assert.equal(res.error.code, 'FORBIDDEN');
  assert.deepEqual(calls, []);
});

test('Exception im Service → { ok:false } mit deutscher Meldung, kein Absturz', async () => {
  const { deps: d } = deps({
    listGuilds: () => {
      const e = new Error('x');
      e.code = 'NOT_READY';
      throw e;
    },
  });
  const res = await wrap(buildHandlers(d)['pk:list-guilds'], trusted)({}, undefined);
  assert.deepEqual(res.ok, false);
  assert.equal(res.error.code, 'NOT_READY');
  assert.match(res.error.message, /Nicht mit Discord verbunden/);
});

test('Externe Links: nur http/https', () => {
  assert.equal(validators.externalUrl({ url: 'https://discord.com/developers/applications' }).url, 'https://discord.com/developers/applications');
});
