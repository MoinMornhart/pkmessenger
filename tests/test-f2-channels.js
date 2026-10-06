'use strict';

// F2: Server- und Kanalliste – nur Kanäle, die der Bot wirklich sehen darf.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, GUILD_ID } = require('./helpers/fake-discord');

test('Serverliste enthält ID, Name, Kürzel', async () => {
  const { service } = await readyService();
  assert.deepEqual(service.listGuilds(), [{ id: GUILD_ID, name: 'Testserver', acronym: 'T', iconUrl: null }]);
});

test('Kanalliste: unsichtbare Kanäle und Sprachkanäle fehlen, Kategorien gruppiert', async () => {
  const { service } = await readyService();
  const groups = service.listChannels({ guildId: GUILD_ID });
  const names = groups.flatMap((g) => g.channels.map((c) => c.name));
  assert.ok(!names.includes('geheim'), 'unsichtbarer Kanal darf nicht erscheinen');
  assert.ok(!names.includes('Sprache'), 'Sprachkanal darf nicht erscheinen');
  assert.equal(groups[0].category, null, 'Kanäle ohne Kategorie stehen oben');
  assert.deepEqual(groups[0].channels.map((c) => c.name), ['allgemein', 'nur-lesen', 'ankuendigungen', 'ohne-verlauf']);
  assert.deepEqual(groups[1].category, { id: '444444444444444400', name: 'Projekte' });
  assert.deepEqual(groups[1].channels.map((c) => c.name), ['projekt-a']);
});

test('Kanal-Rechte werden korrekt gemeldet (Schreiben, Verlauf, @everyone)', async () => {
  const { service } = await readyService();
  const flat = Object.fromEntries(service.listChannels({ guildId: GUILD_ID }).flatMap((g) => g.channels).map((c) => [c.name, c]));
  assert.equal(flat['allgemein'].canSend, true);
  assert.equal(flat['nur-lesen'].canSend, false);
  assert.equal(flat['ohne-verlauf'].canReadHistory, false);
  assert.equal(flat['ankuendigungen'].canMentionEveryone, true);
  assert.equal(flat['ankuendigungen'].type, 'announcement');
});

test('Unbekannter Server → NOT_FOUND', async () => {
  const { service } = await readyService();
  assert.throws(() => service.listChannels({ guildId: '999999999999999999' }), { code: 'NOT_FOUND' });
});

test('Bot in einem Kanal, den er nicht sehen darf → NOT_FOUND bei jedem Zugriff', async () => {
  const { service, world } = await readyService();
  const id = world.channels.geheim.id;
  await assert.rejects(service.getMessages({ channelId: id, limit: 50 }), { code: 'NOT_FOUND' });
  await assert.rejects(service.sendMessage({ channelId: id, content: 'x', mentions: { users: [], roles: [], everyone: false } }), { code: 'NOT_FOUND' });
  assert.equal(world.channels.geheim.sent.length, 0);
});
