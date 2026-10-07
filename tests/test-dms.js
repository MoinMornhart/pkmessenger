'use strict';

// Privatnachrichten mit dem Bot (Wunsch JoniMoni, Issue #1) – offizieller Bot-Weg, kein User-Account.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, Events, ChannelType, P, makeMessage } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');

const NONE = { users: [], roles: [], everyone: false };

function withDmStore(opts = {}) {
  const saved = [];
  return { saved, dmStore: { list: () => saved, add: (e) => saved.unshift(e) }, ...opts };
}

test('Privatchat öffnen: wird gemerkt und erscheint in der Liste', async () => {
  const { service, world, events } = await readyService();
  const anna = world.addMember('555555555555555501', 'Anna');
  const dm = await service.openDM({ userId: anna.id });
  assert.equal(dm.type, 'dm');
  assert.equal(dm.name, 'anna');
  assert.equal(dm.canSend, true);
  assert.equal(dm.canMentionEveryone, false);
  assert.ok(events.some((e) => e.type === 'dms:changed'));
  const list = await service.listDMs();
  assert.deepEqual(list.map((d) => d.id), [dm.id]);
  // Kanalliste des Servers bleibt unverändert (DM ist kein Serverkanal)
  assert.ok(!service.listChannels({ guildId: world.guild.id }).some((g) => g.channels.some((c) => c.id === dm.id)));
});

test('Senden, Verlauf, Reaktion und Umfrage im Privatchat (keine Rollen nötig)', async () => {
  const { service, world } = await readyService();
  const anna = world.addMember('555555555555555501', 'Anna');
  const dm = await service.openDM({ userId: anna.id });
  const sent = await service.sendMessage({ ...validators.sendMessage({ channelId: dm.id, content: 'Hallo Anna' }), mentions: NONE });
  assert.equal(sent.content, 'Hallo Anna');
  assert.equal(sent.guildId, null);
  const hist = await service.getMessages({ channelId: dm.id, limit: 50 });
  assert.equal(hist.messages.length, 1);
  await service.react({ channelId: dm.id, messageId: sent.id, emoji: '👍', add: true });
  await service.sendMessage({ ...validators.sendMessage({ channelId: dm.id, content: '', poll: { question: 'Pizza?', answers: ['Ja', 'Nein'], durationHours: 1 } }), mentions: NONE });
  // @everyone ergibt im Privatchat keinen Sinn → abgelehnt
  await assert.rejects(service.sendMessage({ ...validators.sendMessage({ channelId: dm.id, content: 'x' }), mentions: { ...NONE, everyone: true } }), { code: 'MISSING_PERMISSION' });
});

test('Eingehende Privatnachricht: live weitergereicht und Chat gemerkt', async () => {
  const ctx = withDmStore();
  const { world, events } = await readyService(ctx);
  const anna = world.addMember('555555555555555501', 'Anna');
  const dm = world.makeDM(anna);
  world.client.emit(Events.MessageCreate, makeMessage({ id: '1000000000000000099', channel: dm, author: anna, content: 'Hi Bot' }));
  const created = events.filter((e) => e.type === 'message:create');
  assert.equal(created.length, 1);
  assert.equal(created[0].payload.channelId, dm.id);
  assert.deepEqual(ctx.saved, [{ channelId: dm.id, userId: anna.id }]);
  // zweite Nachricht: nicht erneut gemerkt
  world.client.emit(Events.MessageCreate, makeMessage({ id: '1000000000000000100', channel: dm, author: anna, content: 'noch da?' }));
  assert.equal(ctx.saved.length, 1);
  assert.equal(events.filter((e) => e.type === 'dms:changed').length, 1);
});

test('Nach Neustart: gemerkte Privatchats werden von Discord nachgeladen', async () => {
  const ctx = withDmStore();
  const { service, world } = await readyService(ctx);
  const anna = world.addMember('555555555555555501', 'Anna');
  const dm = world.makeDM(anna, { cached: false });
  ctx.saved.push({ channelId: dm.id, userId: anna.id }, { channelId: '999999999999999999', userId: anna.id });
  const list = await service.listDMs();
  assert.deepEqual(list.map((d) => d.id), [dm.id]); // gelöschter/unbekannter Chat wird still übersprungen
  assert.ok(world.client.channels.fetchCalls.includes(dm.id));
});

test('Privatchat öffnen: Fehlerfälle', async () => {
  const { service, world } = await readyService();
  await assert.rejects(service.openDM({ userId: world.client.user.id }), /selbst/);
  await assert.rejects(service.openDM({ userId: '123456789012345678' }), { code: 'NOT_FOUND' });
  assert.throws(() => validators.userRef({ userId: 'abc' }), /Ungültige ID/);
  assert.equal(ChannelType.DM, 1);
  assert.ok(P.SendMessages);
});
