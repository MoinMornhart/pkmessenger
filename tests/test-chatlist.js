'use strict';

// Messenger-Chat-Liste: Vorschau der letzten Nachricht je Kanal + Zeitformat.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, makeMessage, GUILD_ID } = require('./helpers/fake-discord');
const { formatListTime, formatDayPill } = require('../src/shared/format');

test('Vorschau: letzte Nachricht je sichtbarem Kanal mit Verlaufs-Recht', async () => {
  const { service, world } = await readyService();
  const anna = world.makeUser('555555555555555555', 'anna');
  const ch = world.channels.allgemein;
  const m = makeMessage({ id: '1000000000000000010', channel: ch, author: anna, content: 'Hallo   zusammen\nwie gehts?' });
  ch.store.push(m);
  ch.lastMessageId = m.id;
  // Kanal ohne Verlauf-Recht und unsichtbarer Kanal dürfen NICHT abgefragt werden
  world.channels.blindHistory.lastMessageId = '1000000000000000011';
  world.channels.geheim.lastMessageId = '1000000000000000012';

  const previews = await service.getPreviews({ guildId: GUILD_ID });
  assert.deepEqual(Object.keys(previews), [ch.id]);
  assert.equal(previews[ch.id].text, 'Hallo zusammen wie gehts?');
  assert.equal(previews[ch.id].authorName, 'anna');
  assert.equal(previews[ch.id].isOwn, false);
  assert.equal(world.channels.blindHistory.messages.fetchCalls.length, 0);
  assert.equal(world.channels.geheim.messages.fetchCalls.length, 0);
  assert.deepEqual(ch.messages.fetchCalls, [{ limit: 1 }], 'genau 1 Nachricht pro Kanal');
});

test('Vorschau: Fehler in einem Kanal bricht die Liste nicht ab', async () => {
  const { service, world } = await readyService();
  const ch = world.channels.allgemein;
  ch.lastMessageId = '1000000000000000010';
  ch.messages.fetch = async () => {
    throw new Error('Missing Access');
  };
  assert.deepEqual(await service.getPreviews({ guildId: GUILD_ID }), {});
});

test('Listen-Zeit wie in Messengern (de-DE)', () => {
  const now = new Date(2026, 9, 6, 15, 0).getTime(); // Dienstag
  assert.equal(formatListTime(new Date(2026, 9, 6, 9, 5).getTime(), now), '09:05');
  assert.equal(formatListTime(new Date(2026, 9, 5, 22, 0).getTime(), now), 'Gestern');
  assert.equal(formatListTime(new Date(2026, 9, 3, 12, 0).getTime(), now), 'Samstag');
  assert.equal(formatListTime(new Date(2026, 8, 20, 12, 0).getTime(), now), '20.09.26');
  assert.equal(formatDayPill(new Date(2026, 9, 6, 1, 0).getTime(), now), 'Heute');
  assert.equal(formatDayPill(new Date(2026, 9, 5, 1, 0).getTime(), now), 'Gestern');
  assert.equal(formatDayPill(new Date(2026, 9, 3, 1, 0).getTime(), now), 'Samstag, 3. Oktober 2026');
});
