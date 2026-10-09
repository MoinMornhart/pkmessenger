'use strict';

// #93: Spoiler, die eine Erwähnung umschließen (||<@123>||), wurden nicht als Spoiler erkannt – der rohe ||…||-Text
// erschien. Hier wird geprüft, dass solche Spoiler als Abschnitt markiert werden und normale Fälle unverändert bleiben.
const test = require('node:test');
const assert = require('node:assert/strict');
const { splitSpoilerParts } = require('../src/shared/spoiler');

test('Spoiler mit Benutzer-Erwähnung wird erkannt (ohne ||-Zeichen im Inhalt)', () => {
  const parts = splitSpoilerParts('|| <@123456789012345678> ||');
  assert.equal(parts.length, 1);
  assert.equal(parts[0].spoiler, true);
  assert.equal(parts[0].text, ' <@123456789012345678> ');
});

test('Text + Spoiler-mit-Erwähnung + Text werden getrennt', () => {
  const parts = splitSpoilerParts('Hallo ||<@123456789012345678>|| tschüss');
  assert.deepEqual(parts.map((p) => [p.text, Boolean(p.spoiler)]), [
    ['Hallo ', false],
    ['<@123456789012345678>', true],
    [' tschüss', false],
  ]);
});

test('Rollen-, Kanal- und @everyone-Spoiler werden erkannt', () => {
  assert.equal(splitSpoilerParts('||<@&111111111111111111>||')[0].spoiler, true);
  assert.equal(splitSpoilerParts('||<#222222222222222222>||')[0].spoiler, true);
  assert.equal(splitSpoilerParts('||@everyone||')[0].spoiler, true);
});

test('Spoiler OHNE Erwähnung bleibt normaler Text (Inline-Darstellung übernimmt)', () => {
  const parts = splitSpoilerParts('||geheim||');
  assert.equal(parts.length, 1);
  assert.equal(parts[0].spoiler, undefined);
  assert.equal(parts[0].text, '||geheim||');
});

test('Kein Spoiler → genau ein Text-Abschnitt; leerer Text → ein leerer Abschnitt', () => {
  assert.deepEqual(splitSpoilerParts('nur text'), [{ text: 'nur text', start: 0 }]);
  assert.deepEqual(splitSpoilerParts(''), [{ text: '', start: 0 }]);
  assert.deepEqual(splitSpoilerParts(null), [{ text: '', start: 0 }]);
});

test('Erwähnung ohne Spoiler bleibt unberührt', () => {
  const parts = splitSpoilerParts('hi <@123456789012345678>');
  assert.equal(parts.length, 1);
  assert.equal(parts[0].spoiler, undefined);
});
