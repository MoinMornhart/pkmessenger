'use strict';

// vibeworks #219 / #120: Standard-Relay des Morni-Teams als Fallback, eigener Server oder aus.
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveRelay, relaySetting, DEFAULT_RELAY } = require('../src/shared/relay-config');
const { validators } = require('../src/main/validate');

test('Ohne Einstellung: Fernhilfe nutzt den Standard-Server (nichts installieren)', () => {
  const r = resolveRelay({});
  assert.equal(r.wss, DEFAULT_RELAY);
  assert.equal(r.mode, 'standard');
  assert.equal(r.httpBase, 'https://relay.morncloud.de');
});

test('Fernzugang nutzt einen Relay nur nach bewusster Wahl', () => {
  assert.equal(resolveRelay({}, { forRemote: true }), null); // niemand landet ungefragt auf dem Server
  assert.equal(resolveRelay({ relayMode: 'standard' }, { forRemote: true }).wss, DEFAULT_RELAY);
  assert.equal(resolveRelay({ helpRelay: 'wss://mein.example/ws' }, { forRemote: true }).wss, 'wss://mein.example/ws'); // alte Nutzer
});

test('Eigener Server, aus, Demo und kaputte Werte', () => {
  assert.deepEqual(resolveRelay({ relayMode: 'own', helpRelay: 'wss://mein.example/ws' }), { wss: 'wss://mein.example/ws', httpBase: 'https://mein.example', mode: 'own' });
  assert.equal(resolveRelay({ relayMode: 'own', helpRelay: '' }), null); // eigener gewählt, aber noch keine Adresse → nur WLAN
  assert.equal(resolveRelay({ relayMode: 'off', helpRelay: 'wss://mein.example/ws' }), null);
  assert.equal(resolveRelay({}, { demo: true }), null); // Demo/Screenshots fragen keinen echten Server an
  assert.equal(resolveRelay({ relayMode: 'quatsch', helpRelay: 'http://unsicher' }).mode, 'standard');
  assert.deepEqual(relaySetting({ helpRelay: 'wss://alt.example/ws' }), { mode: 'own', own: 'wss://alt.example/ws', chosen: true, standard: DEFAULT_RELAY });
  assert.equal(relaySetting(null).mode, 'standard');
});

test('Validierung: Modus allein, Adresse + Modus, falsche Werte', () => {
  assert.deepEqual(validators.helpRelay({ mode: 'off' }), { mode: 'off' });
  assert.deepEqual(validators.helpRelay({ url: 'wss://a.example/ws', mode: 'own' }), { url: 'wss://a.example/ws', mode: 'own' });
  assert.deepEqual(validators.helpRelay({ url: '' }), { url: '' });
  assert.throws(() => validators.helpRelay({ mode: 'hack' }), /Unbekannte/);
  assert.throws(() => validators.helpRelay({ url: 'http://unsicher.example' }), /wss/);
});
