'use strict';

// App-Sperre mit Passwort (Issue #1): nur Hash gespeichert, gesperrt = alle Kanäle zu, Fehlversuch-Bremse.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppLock, MAX_FAILS } = require('../src/main/app-lock');
const { buildHandlers, wrap } = require('../src/main/ipc');

function memStore(init = {}) {
  const data = { ...init };
  return { get: () => ({ ...data }), set: (k, v) => (data[k] = v), data };
}

test('Passwort setzen: nur salziger Hash gespeichert, nie das Passwort', () => {
  const store = memStore();
  const lock = createAppLock({ store });
  assert.deepEqual(lock.status(), { enabled: false, locked: false, idleMinutes: 0, hello: false, blockedUntil: null });
  lock.set({ password: 'geheim123', idleMinutes: 15 });
  assert.ok(!JSON.stringify(store.data).includes('geheim123'));
  assert.match(store.data.appLock.hash, /^[0-9a-f]{64}$/);
  assert.equal(lock.status().idleMinutes, 15);
  assert.throws(() => lock.set({ password: 'abc', current: 'geheim123' }), /mindestens 4/);
});

test('Neustart mit Passwort → gesperrt; richtiges Passwort entsperrt, falsches nicht', () => {
  const store = memStore();
  createAppLock({ store }).set({ password: 'geheim123' });
  const lock = createAppLock({ store }); // wie nach einem Neustart
  assert.equal(lock.isLocked(), true);
  assert.throws(() => lock.verify('falsch'), /Falsches Passwort/);
  assert.equal(lock.isLocked(), true);
  lock.verify('geheim123');
  assert.equal(lock.isLocked(), false);
});

test('Nach 5 Fehlversuchen 30 Sekunden Pause', () => {
  let t = 1000;
  const store = memStore();
  createAppLock({ store }).set({ password: 'geheim123' });
  const lock = createAppLock({ store, now: () => t });
  for (let i = 0; i < MAX_FAILS; i++) assert.throws(() => lock.verify('x'), /Falsches/);
  assert.throws(() => lock.verify('geheim123'), /Zu viele Fehlversuche/);
  t += 30001;
  lock.verify('geheim123');
  assert.equal(lock.isLocked(), false);
});

test('Ändern/Entfernen nur mit altem Passwort; automatische Sperre bei Inaktivität', () => {
  const store = memStore();
  const lock = createAppLock({ store });
  lock.set({ password: 'geheim123', idleMinutes: 5 });
  assert.throws(() => lock.set({ password: 'neu12345', current: 'falsch' }), /bisherige Passwort/);
  lock.idleTick(4 * 60);
  assert.equal(lock.isLocked(), false);
  lock.idleTick(5 * 60);
  assert.equal(lock.isLocked(), true);
  lock.verify('geheim123');
  assert.throws(() => lock.clear({ current: 'falsch' }), /stimmt nicht/);
  lock.clear({ current: 'geheim123' });
  assert.equal(store.data.appLock, null);
});

test('Gesperrt: alle Kanäle abgelehnt außer Entsperren; Hash kommt nie in die Oberfläche', async () => {
  const store = memStore();
  const lock = createAppLock({ store });
  lock.set({ password: 'geheim123' });
  lock.lock();
  const h = buildHandlers({ service: { listGuilds: () => ['x'], getStatus: () => ({ state: 'ready' }) }, store, appLock: lock });
  const call = (ch, p) => wrap(h[ch], () => true, ch, () => lock.isLocked())({}, p);
  assert.equal((await call('pk:list-guilds')).error.code, 'LOCKED');
  assert.equal((await call('pk:get-settings')).error.code, 'LOCKED');
  assert.equal((await call('pk:lock-verify', { password: 'x' })).ok, false);
  assert.equal((await call('pk:lock-verify', { password: 'geheim123' })).ok, true);
  assert.deepEqual((await call('pk:list-guilds')).data, ['x']);
  const settings = (await call('pk:get-settings')).data;
  assert.equal(settings.appLock, undefined);
});
