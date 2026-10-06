'use strict';

// Issue #1 "Nullbehandlungen und Nullprüfungen": unvollständige Discord-Objekte dürfen nichts abstürzen lassen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, Events } = require('./helpers/fake-discord');
const { createMessageStore } = require('../src/shared/message-store');

test('Nachricht ohne Autor/Anhänge/Mentions/Embeds wird sicher serialisiert', async () => {
  const { service, world } = await readyService();
  const m = service.serializeMessage({ id: '1000000000000000001', channelId: world.channels.allgemein.id, guildId: world.guild.id });
  assert.equal(m.author.name, 'Unbekannt');
  assert.equal(m.author.avatarUrl, null);
  assert.deepEqual(m.attachments, []);
  assert.equal(m.embedsCount, 0);
  assert.deepEqual(m.mentions, { users: [], roles: [], channels: [], everyone: false });
  assert.equal(m.content, '');
  assert.equal(m.isOwn, false);
  assert.ok(Number.isFinite(m.createdTimestamp));
});

test('Avatar-Funktion, die wirft, und kaputte Mention-Collections → kein Absturz', async () => {
  const { service } = await readyService();
  const m = service.serializeMessage({
    id: '1000000000000000002',
    author: {
      id: '5',
      username: 'x',
      displayAvatarURL: () => {
        throw new Error('kaputt');
      },
    },
    attachments: new Map([['a', null]]),
    embeds: 'kein Array',
    mentions: { users: null, roles: undefined, channels: 42 },
  });
  assert.equal(m.author.avatarUrl, null);
  assert.deepEqual(m.attachments, []);
  assert.equal(m.embedsCount, 0);
  assert.deepEqual(m.mentions.users, []);
});

test('Gateway-Events mit fehlenden Feldern werden ignoriert statt abzustürzen', async () => {
  const { world, events } = await readyService();
  const before = events.length;
  assert.doesNotThrow(() => {
    world.client.emit(Events.MessageCreate, null);
    world.client.emit(Events.MessageDelete, {});
    world.client.emit(Events.TypingStart, { guild: world.guild, channel: null, user: null });
    world.client.emit(Events.VoiceStateUpdate, null, null);
    world.client.emit(Events.MessageUpdate, null, null);
  });
  assert.equal(events.length, before);
});

test('Nachrichtenspeicher: Nachrichten ohne Kanal/ID und leere Löschungen werden ignoriert', async () => {
  const store = createMessageStore({ getMessages: async () => ({ messages: [], hasMore: false }) });
  assert.equal(store.upsertConfirmed(null), false);
  assert.equal(store.upsertConfirmed({ id: '1' }), false);
  assert.doesNotThrow(() => store.remove());
  assert.doesNotThrow(() => store.remove({ id: null, channelId: null }));
});
