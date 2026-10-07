'use strict';

// Smiley-Auswahl (Issue #1: „mehr Smileys“)
const test = require('node:test');
const assert = require('node:assert/strict');
const { CATEGORIES, searchEmojis, EMOJI_COUNT } = require('../src/shared/emoji-data');

test('Viele Smileys in Kategorien, keine doppelten', () => {
  assert.ok(EMOJI_COUNT >= 300, `nur ${EMOJI_COUNT}`);
  assert.equal(CATEGORIES.length, 8);
  const all = CATEGORIES.flatMap((c) => c.items.map(([e]) => e));
  assert.equal(new Set(all).size, all.length, 'doppelte Smileys');
  for (const c of CATEGORIES) for (const [e, words] of c.items) assert.ok(e && words.trim(), `${c.id}: Eintrag ohne Suchwort`);
});

test('Suche mit deutschen Wörtern', () => {
  assert.ok(searchEmojis('herz').includes('❤️'));
  assert.ok(searchEmojis('lachen').includes('😂'));
  assert.deepEqual(searchEmojis('pizza'), ['🍕']);
  assert.ok(searchEmojis('daumen').includes('👍'));
  assert.deepEqual(searchEmojis(''), []);
  assert.deepEqual(searchEmojis('xyzgibtsnicht'), []);
});
