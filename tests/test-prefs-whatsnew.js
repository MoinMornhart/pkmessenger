'use strict';

// Issue #44 (Joni, 08.10.2026): „Das ist neu“ kam nach Updates nie. Ursache: kaputtes Muster in prefs.js
// (/^d+.d+.d+$/ statt /^\d+\.\d+\.\d+$/) → die gemerkte Version wurde verworfen, jeder Start galt als „erster Start“.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule(file, globals = {}) {
  const out = esbuild.buildSync({ entryPoints: [path.join(__dirname, '..', file)], bundle: true, format: 'cjs', platform: 'neutral', write: false, jsx: 'automatic', logLevel: 'silent' });
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', ...Object.keys(globals), out.outputFiles[0].text);
  fn(mod, mod.exports, ...Object.values(globals));
  return mod.exports;
}

function fakeStorage(init = {}) {
  const data = { ...init };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => (data[k] = String(v)), removeItem: (k) => delete data[k], data };
}

test('Gemerkte Version bleibt erhalten (sonst kommt „Das ist neu“ nie)', () => {
  const localStorage = fakeStorage({ 'pk.prefs.v1': JSON.stringify({ lastSeenVersion: '0.12.2', showWhatsNew: true }) });
  const { prefs } = loadModule('src/renderer/prefs.js', { localStorage, window: { addEventListener() {} } });
  assert.equal(prefs.get().lastSeenVersion, '0.12.2');
  assert.equal(prefs.get().showWhatsNew, true);
  prefs.set({ lastSeenVersion: '0.13.1' });
  assert.equal(prefs.get().lastSeenVersion, '0.13.1');
});

test('Unsinn als Version wird verworfen', () => {
  const localStorage = fakeStorage({ 'pk.prefs.v1': JSON.stringify({ lastSeenVersion: '1.2' }) });
  const { prefs } = loadModule('src/renderer/prefs.js', { localStorage, window: { addEventListener() {} } });
  assert.equal(prefs.get().lastSeenVersion, '');
});

test('Nur neuere Versionen bis zur aktuellen werden gezeigt', () => {
  const { releasesSince } = loadModule('src/renderer/components/WhatsNew.jsx', { window: { addEventListener() {}, removeEventListener() {} }, localStorage: fakeStorage() });
  const rel = ['v0.13.1', 'v0.13.0', 'v0.12.2', 'v0.12.1'].map((tag) => ({ tag }));
  assert.deepEqual(releasesSince(rel, '0.12.2', '0.13.1').map((r) => r.tag), ['v0.13.1', 'v0.13.0']);
});
