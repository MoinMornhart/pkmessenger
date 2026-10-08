'use strict';

// Neue Gruppe (Issue #1 „Gruppe erstellen“): Text-/Sprachkanal anlegen, optional privat nur für ausgewählte Personen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, P, ChannelType } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');

const create = (service, p) => service.createChannel(validators.channelCreate(p));

test('Ohne „Kanäle verwalten“: abgelehnt; Serverliste meldet canCreateChannels', async () => {
  const { service, world } = await readyService();
  assert.equal(service.listGuilds()[0].canCreateChannels, false);
  await assert.rejects(create(service, { guildId: world.guild.id, name: 'team', kind: 'text' }), { code: 'MISSING_PERMISSION' });
  assert.equal(world.guild.channels.created.length, 0);
  world.guild.members.me.permFlags.add(P.ManageChannels);
  assert.equal(service.listGuilds()[0].canCreateChannels, true);
});

test('Öffentlicher Textkanal in Kategorie; Liste wird neu geladen und zeigt ihn', async () => {
  const { service, world, events } = await readyService();
  world.guild.members.me.permFlags.add(P.ManageChannels);
  const res = await create(service, { guildId: world.guild.id, name: '  Team Chat ', kind: 'text', parentId: world.category.id });
  const opts = world.guild.channels.created[0];
  assert.equal(opts.name, 'Team Chat');
  assert.equal(opts.type, ChannelType.GuildText);
  assert.equal(opts.parent, world.category.id);
  assert.equal(opts.permissionOverwrites, undefined); // öffentlich: Rechte erbt er von der Kategorie
  assert.match(opts.reason, /PKMessenger/);
  assert.equal(res.type, 'text');
  assert.ok(events.some((e) => e.type === 'channels:changed'));
  assert.ok(service.listChannels({ guildId: world.guild.id }).flatMap((g) => g.channels).some((c) => c.id === res.id));
  // falsche Kategorie
  await assert.rejects(create(service, { guildId: world.guild.id, name: 'x', kind: 'text', parentId: world.channels.allgemein.id }), { code: 'NOT_FOUND' });
});

test('Private Gruppe: @everyone gesperrt, Bot + ausgewählte Personen dürfen rein; nur Rechte, die der Bot hat', async () => {
  const { service, world } = await readyService();
  const me = world.guild.members.me;
  for (const f of [P.ManageChannels, P.ViewChannel, P.Connect]) me.permFlags.add(f); // „Sprechen“ fehlt dem Bot
  world.addMember('555555555555555501', 'Anna');
  await create(service, { guildId: world.guild.id, name: 'Runde', kind: 'voice', isPrivate: true, memberIds: ['555555555555555501'] });
  const opts = world.guild.channels.created[0];
  assert.equal(opts.type, ChannelType.GuildVoice);
  const ow = Object.fromEntries(opts.permissionOverwrites.map((o) => [o.id, o]));
  assert.deepEqual(ow[world.guild.id].deny, [P.ViewChannel]);
  assert.deepEqual(ow[world.client.user.id].allow, [P.ViewChannel, P.Connect]);
  assert.deepEqual(ow['555555555555555501'].allow, [P.ViewChannel, P.Connect]);
  // Person nicht auf dem Server → abgelehnt, nichts angelegt
  await assert.rejects(create(service, { guildId: world.guild.id, name: 'y', kind: 'text', isPrivate: true, memberIds: ['555555555555555599'] }), { code: 'NOT_FOUND' });
  assert.equal(world.guild.channels.created.length, 1);
});

test('Eingaben werden geprüft', () => {
  const g = '222222222222222222';
  assert.throws(() => validators.channelCreate({ guildId: g, name: '', kind: 'text' }), /1–100/);
  assert.throws(() => validators.channelCreate({ guildId: g, name: 'a'.repeat(101), kind: 'text' }), /1–100/);
  assert.throws(() => validators.channelCreate({ guildId: g, name: 'a', kind: 'forum' }), /Art/);
  assert.throws(() => validators.channelCreate({ guildId: g, name: 'a', kind: 'text', isPrivate: true, memberIds: Array(26).fill(g) }), /25/);
  assert.throws(() => validators.channelCreate({ guildId: g, name: 'a', kind: 'text', isPrivate: true, memberIds: ['abc'] }));
  // nicht privat → Personenliste wird ignoriert
  assert.deepEqual(validators.channelCreate({ guildId: g, name: 'a', kind: 'text', memberIds: [g] }).memberIds, []);
  assert.deepEqual(validators.channelCreate({ guildId: g, name: 'a', kind: 'text', isPrivate: true, memberIds: [g, g] }).memberIds, [g]);
});
