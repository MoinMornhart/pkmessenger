'use strict';

// Bildschirmschutz (Wunsch JoniMoni, Issue #1): Einstellung wird gespeichert und sofort aufs Fenster angewendet.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHandlers } = require('../src/main/ipc');

function setup() {
  const data = {};
  const store = { get: () => ({ ...data }), set: (k, v) => (data[k] = v) };
  const calls = [];
  const h = buildHandlers({ service: {}, store, setScreenProtection: (on) => calls.push(on) });
  return { h, data, calls };
}

test('Bildschirmschutz an/aus: speichert und wendet sofort an', async () => {
  const { h, data, calls } = setup();
  assert.equal(await h['pk:set-screen-protection']({ on: true }), true);
  assert.equal(data.screenProtection, true);
  assert.equal(await h['pk:set-screen-protection']({ on: false }), false);
  assert.deepEqual(calls, [true, false]);
  assert.equal(h['pk:get-settings']().screenProtection, false);
});

test('Bildschirmschutz: nur echte Wahrheitswerte', () => {
  const { h, calls } = setup();
  for (const bad of [undefined, { on: 'ja' }, { on: 1 }, 'true']) assert.throws(() => h['pk:set-screen-protection'](bad), /Ungültig/);
  assert.equal(calls.length, 0);
});
