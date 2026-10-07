'use strict';

// Text markieren → Formatierung (Issue #1)
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyFormat } = require('../src/shared/format-text');

const sel = (text, word) => [text.indexOf(word), text.indexOf(word) + word.length];

test('Fett, Kursiv, Unterstrichen, Durchgestrichen, Spoiler, Code um die Markierung', () => {
  const t = 'Hallo Welt!';
  const [s, e] = sel(t, 'Welt');
  assert.equal(applyFormat(t, s, e, 'bold').text, 'Hallo **Welt**!');
  assert.equal(applyFormat(t, s, e, 'italic').text, 'Hallo *Welt*!');
  assert.equal(applyFormat(t, s, e, 'underline').text, 'Hallo __Welt__!');
  assert.equal(applyFormat(t, s, e, 'strike').text, 'Hallo ~~Welt~~!');
  assert.equal(applyFormat(t, s, e, 'spoiler').text, 'Hallo ||Welt||!');
  assert.equal(applyFormat(t, s, e, 'code').text, 'Hallo `Welt`!');
});

test('Markierung bleibt auf dem Wort, zweiter Klick nimmt die Formatierung wieder weg', () => {
  const t = 'Hallo Welt!';
  const [s, e] = sel(t, 'Welt');
  const a = applyFormat(t, s, e, 'bold');
  assert.equal(a.text.slice(a.start, a.end), 'Welt');
  const b = applyFormat(a.text, a.start, a.end, 'bold');
  assert.equal(b.text, t);
  // auch wenn die Marker mit markiert sind
  const c = applyFormat('**Welt**', 0, 8, 'bold');
  assert.equal(c.text, 'Welt');
});

test('Mehrzeiliger Code wird zum Codeblock, Zitat für jede Zeile', () => {
  const t = 'a\nb';
  assert.equal(applyFormat(t, 0, 3, 'code').text, '```\na\nb\n```');
  assert.equal(applyFormat(t, 0, 3, 'quote').text, '> a\n> b');
  assert.equal(applyFormat('> a\n> b', 0, 7, 'quote').text, 'a\nb');
  assert.equal(applyFormat('Text davor\nZeile', 13, 15, 'quote').text, 'Text davor\n> Zeile');
});

test('Erwähnungen bleiben erhalten (Text drumherum unverändert)', () => {
  const t = 'Hey @Anna schau mal';
  const [s, e] = sel(t, 'schau mal');
  assert.equal(applyFormat(t, s, e, 'bold').text, 'Hey @Anna **schau mal**');
});

test('Spoiler-Inhalt erscheint in Vorschauen nie im Klartext (Issue #35)', () => {
  const { maskSpoilers, FORMAT_BUTTONS } = require('../src/shared/format-text');
  assert.equal(maskSpoilers('Das Ende: ||Er war es|| lol'), 'Das Ende: ▒▒▒▒ lol');
  assert.equal(maskSpoilers('||a|| und ||b||'), '▒▒▒▒ und ▒▒▒▒');
  assert.equal(maskSpoilers('kein | Spoiler'), 'kein | Spoiler');
  // Formatier-Menü: jeder Knopf hat einen sichtbaren Namen
  assert.ok(FORMAT_BUTTONS.every((b) => b.name && b.name.length <= 12));
});
