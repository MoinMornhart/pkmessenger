'use strict';

// Settings-Store: kein Token, atomare Speicherung, Lese-Markierungen bleiben erhalten.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/main/store');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pk-store-')), 'settings.json');
}

test('Store verweigert Schlüssel wie "token"', () => {
  const s = createStore(tmpFile());
  assert.throws(() => s.set('discordToken', 'x'), /Geheimnisse/);
});

test('Werte und Lese-Markierungen überleben einen Neustart', () => {
  const file = tmpFile();
  const s = createStore(file);
  s.set('lastChannelId', '444444444444444401');
  s.setReadMarker('444444444444444401', '1000000000000000009');
  s.flush();
  const again = createStore(file).get();
  assert.equal(again.lastChannelId, '444444444444444401');
  assert.equal(again.readMarkers['444444444444444401'], '1000000000000000009');
  assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test('Kaputte Settings-Datei → Standardwerte statt Absturz', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{kaputt');
  assert.deepEqual(createStore(file).get(), { lastGuildId: null, lastChannelId: null, readMarkers: {} });
});
