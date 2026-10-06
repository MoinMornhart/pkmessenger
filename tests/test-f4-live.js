'use strict';

// F4: Live-Nachrichten über das Gateway + Tipp-Anzeige.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, makeMessage, Events, BOT_ID } = require('./helpers/fake-discord');

test('messageCreate im Server → Event "message:create" mit serialisierter Nachricht', async () => {
  const { world, events } = await readyService();
  const ch = world.channels.allgemein;
  world.client.emit(Events.MessageCreate, makeMessage({ id: '1000000000000000001', channel: ch, author: world.makeUser('555555555555555555', 'anna'), content: 'Hallo' }));
  const ev = events.find((e) => e.type === 'message:create');
  assert.ok(ev);
  assert.equal(ev.payload.content, 'Hallo');
  assert.equal(ev.payload.channelId, ch.id);
});

test('Eigene Bot-Nachricht wird als isOwn markiert', async () => {
  const { world, events } = await readyService();
  world.client.emit(Events.MessageCreate, makeMessage({ id: '1000000000000000002', channel: world.channels.allgemein, author: world.client.user, content: 'ich' }));
  assert.equal(events.find((e) => e.type === 'message:create').payload.isOwn, true);
});

test('DMs werden ignoriert (nicht Teil des Produkts)', async () => {
  const { world, events } = await readyService();
  const dm = makeMessage({ id: '1000000000000000003', channel: world.channels.allgemein, author: world.makeUser('555555555555555555', 'anna') });
  dm.guildId = null;
  world.client.emit(Events.MessageCreate, dm);
  assert.equal(events.filter((e) => e.type === 'message:create').length, 0);
});

test('Bearbeiten/Löschen werden live weitergereicht', async () => {
  const { world, events } = await readyService();
  const m = makeMessage({ id: '1000000000000000004', channel: world.channels.allgemein, author: world.makeUser('555555555555555555', 'anna'), content: 'neu' });
  world.client.emit(Events.MessageUpdate, null, m);
  world.client.emit(Events.MessageDelete, m);
  assert.equal(events.find((e) => e.type === 'message:update').payload.content, 'neu');
  assert.deepEqual(events.find((e) => e.type === 'message:delete').payload, { id: m.id, channelId: m.channelId });
});

test('Tipp-Anzeige: fremde Nutzer ja, der Bot selbst nein', async () => {
  const { world, events } = await readyService();
  const ch = world.channels.allgemein;
  world.client.emit(Events.TypingStart, { guild: world.guild, channel: ch, user: { id: '555555555555555555', username: 'anna' }, member: { displayName: 'Anna' } });
  world.client.emit(Events.TypingStart, { guild: world.guild, channel: ch, user: { id: BOT_ID, username: 'PKBot' } });
  const typing = events.filter((e) => e.type === 'typing');
  assert.equal(typing.length, 1);
  assert.deepEqual(typing[0].payload, { channelId: ch.id, userId: '555555555555555555', name: 'Anna' });
});

test('sendTyping wird gedrosselt (max. 1× pro 8 s je Kanal) und nur mit Schreibrecht', async () => {
  const { service, world } = await readyService();
  assert.equal(await service.sendTyping({ channelId: world.channels.allgemein.id }), true);
  assert.equal(await service.sendTyping({ channelId: world.channels.allgemein.id }), false);
  assert.equal(world.channels.allgemein.typingCalls, 1);
  assert.equal(await service.sendTyping({ channelId: world.channels.nurLesen.id }), false);
  assert.equal(world.channels.nurLesen.typingCalls, 0);
});

test('Kanal-/Server-Änderungen lösen Neuladen-Events aus', async () => {
  const { world, events } = await readyService();
  world.client.emit(Events.ChannelCreate, { guildId: world.guild.id });
  world.client.emit(Events.GuildDelete, world.guild);
  assert.ok(events.some((e) => e.type === 'channels:changed' && e.payload.guildId === world.guild.id));
  assert.ok(events.some((e) => e.type === 'guilds:changed'));
});
