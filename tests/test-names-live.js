'use strict';

// JoniMoni #56/#53: Erwähnungen im Privatchat zeigen echte Namen (nicht „@Unbekannt“); Namensänderungen wandern
// live überall mit (Nachrichten, Erwähnungen), ohne Neuladen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, makeMessage, Events } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');
const { createMessageStore } = require('../src/shared/message-store');

test('Privatchat: <@id> einer Person, die nicht im Chat ist, wird trotzdem mit Namen aufgelöst', async () => {
  const { world, events } = await readyService();
  const anna = world.addMember('555555555555555501', 'Anna');
  const simpell = world.addMember('555555555555555502', 'SimPell');
  const dm = world.makeDM(anna);
  world.client.emit(Events.MessageCreate, makeMessage({ id: '1000000000000000201', channel: dm, author: world.client.user, content: `<@${simpell.id}> sagte mal was` }));
  const msg = events.find((e) => e.type === 'message:create').payload;
  assert.deepEqual(msg.mentions.users, [{ id: simpell.id, name: 'SimPell' }]);
});

test('Namensänderung einer Person → Ereignis user:renamed', async () => {
  const { world, events } = await readyService();
  const anna = world.addMember('555555555555555501', 'Anna');
  world.client.emit(Events.UserUpdate, { id: anna.id, username: 'anna', globalName: 'Anna' }, { id: anna.id, username: 'anna', globalName: 'Anni' });
  assert.deepEqual(events.find((e) => e.type === 'user:renamed').payload, { userId: anna.id, guildId: null, oldName: 'Anna', name: 'Anni' });
});

test('Bot-Name im Profil geändert → sofort user:renamed (nicht erst nach Neuladen)', async () => {
  const { service, events, world } = await readyService();
  await service.updateProfile(validators.profileUpdate({ username: 'NeuerBot' }));
  const ev = events.find((e) => e.type === 'user:renamed');
  assert.equal(ev.payload.userId, world.client.user.id);
  assert.equal(ev.payload.name, 'NeuerBot');
});

test('Nachrichtenspeicher: neuer Name in Autor und Erwähnungen, andere Spitznamen bleiben', async () => {
  const msgs = [
    { id: '10', channelId: 'c1', guildId: 'g1', author: { id: 'u1', name: 'Anna' }, mentions: { users: [] } },
    { id: '11', channelId: 'c1', guildId: 'g1', author: { id: 'u2', name: 'Bernd' }, mentions: { users: [{ id: 'u1', name: 'Anna' }] } },
    { id: '12', channelId: 'c1', guildId: 'g1', author: { id: 'u1', name: 'Annchen (Spitzname)' }, mentions: { users: [] } },
  ];
  const store = createMessageStore({ getMessages: async () => ({ messages: msgs, hasMore: false }) });
  await store.loadInitial('c1');
  assert.equal(store.renameUser({ userId: 'u1', oldName: 'Anna', name: 'Anni' }), 1);
  const after = store.get('c1').messages;
  assert.equal(after[0].author.name, 'Anni');
  assert.equal(after[1].mentions.users[0].name, 'Anni');
  assert.equal(after[2].author.name, 'Annchen (Spitzname)');
  // Spitzname nur auf einem anderen Server → hier nichts ändern
  assert.equal(store.renameUser({ userId: 'u2', oldName: 'Bernd', name: 'B.', guildId: 'g2' }), 0);
});
