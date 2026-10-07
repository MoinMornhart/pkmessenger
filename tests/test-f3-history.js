'use strict';

// F3: Nachrichtenverlauf per REST, 100er-Seiten mit before=, ältere nachladen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, makeMessage } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');

function fill(world, count) {
  const ch = world.channels.allgemein;
  const author = world.makeUser('555555555555555555', 'anna');
  const base = 1000000000000000000n;
  for (let i = 0; i < count; i++) ch.store.push(makeMessage({ id: String(base + BigInt(i)), channel: ch, author, content: `Nachricht ${i}`, createdTimestamp: 1700000000000 + i * 1000 }));
  return ch;
}

test('Erste Seite: neueste 100, aufsteigend sortiert, hasMore=true', async () => {
  const { service, world } = await readyService();
  const ch = fill(world, 250);
  const page = await service.getMessages({ channelId: ch.id, limit: 100 });
  assert.equal(page.messages.length, 100);
  assert.equal(page.hasMore, true);
  assert.equal(page.messages[0].content, 'Nachricht 150');
  assert.equal(page.messages[99].content, 'Nachricht 249');
});

test('Paginierung mit before= lädt lückenlos alle älteren Nachrichten', async () => {
  const { service, world } = await readyService();
  const ch = fill(world, 250);
  const seen = [];
  let before;
  let hasMore = true;
  let requests = 0;
  while (hasMore) {
    const page = await service.getMessages({ channelId: ch.id, before, limit: 100 });
    requests++;
    seen.unshift(...page.messages);
    hasMore = page.hasMore && page.messages.length > 0;
    before = page.messages[0]?.id;
  }
  assert.equal(seen.length, 250);
  assert.equal(new Set(seen.map((m) => m.id)).size, 250, 'keine Duplikate');
  assert.equal(requests, 3);
  assert.deepEqual(ch.messages.fetchCalls[1], { limit: 100, before: seen[150].id });
});

test('Serialisierte Nachricht enthält nur benötigte Felder (Datensparsamkeit)', async () => {
  const { service, world } = await readyService();
  const ch = fill(world, 1);
  const [m] = (await service.getMessages({ channelId: ch.id, limit: 50 })).messages;
  // Felder seit F7–F15: reactions, embeds, pinned, thread, canEdit, canDelete; seit Umfragen: poll (alles für die Anzeige nötig, nichts gespeichert)
  assert.deepEqual(Object.keys(m).sort(), ['attachments', 'author', 'canDelete', 'canEdit', 'channelId', 'content', 'createdTimestamp', 'editedTimestamp', 'embeds', 'embedsCount', 'guildId', 'id', 'isOwn', 'mentions', 'nonce', 'pinned', 'poll', 'reactions', 'reference', 'system', 'thread', 'type'].sort());
  assert.equal(m.author.name, 'anna');
  assert.equal(m.isOwn, false);
});

test('Kanal ohne "Nachrichtenverlauf lesen" → deutsche Fehlermeldung mit Hinweis', async () => {
  const { service, world } = await readyService();
  await assert.rejects(service.getMessages({ channelId: world.channels.blindHistory.id, limit: 50 }), (err) => {
    assert.equal(err.code, 'MISSING_PERMISSION');
    assert.match(err.hint, /Nachrichtenverlauf lesen/);
    return true;
  });
});

test('Validierung: limit 1–100, IDs müssen Snowflakes sein', () => {
  assert.equal(validators.getMessages({ channelId: '444444444444444401' }).limit, 50);
  assert.throws(() => validators.getMessages({ channelId: '444444444444444401', limit: 101 }), { code: 'VALIDATION' });
  assert.throws(() => validators.getMessages({ channelId: '444444444444444401', limit: 0 }), { code: 'VALIDATION' });
  assert.throws(() => validators.getMessages({ channelId: '123' }), { code: 'VALIDATION' });
  assert.throws(() => validators.getMessages({ channelId: '444444444444444401', before: 'abc' }), { code: 'VALIDATION' });
});
