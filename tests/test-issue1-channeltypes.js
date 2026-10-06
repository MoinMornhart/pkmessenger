'use strict';

// Issue #1 „Alle Kanäle, die geladen werden können, sollen erkannt werden“:
// Forum/Medien/Stage erscheinen als "noch nicht unterstützt" statt zu fehlen; Threads werden gezählt.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, GUILD_ID } = require('./helpers/fake-discord');

test('Forum- und Stage-Kanäle werden erkannt und als nicht unterstützt markiert', async () => {
  const { service } = await readyService({ withExtraTypes: true });
  const flat = service.listChannels({ guildId: GUILD_ID }).flatMap((g) => g.channels);
  const forum = flat.find((c) => c.name === 'ideen-forum');
  const stage = flat.find((c) => c.name === 'bühne');
  assert.equal(forum.type, 'forum');
  assert.equal(forum.unsupported, true);
  assert.equal(forum.canSend, false, 'nicht bedienbar → kein Schreiben anbieten');
  assert.equal(stage.type, 'stage');
  assert.equal(stage.unsupported, true);
  assert.ok(!flat.some((c) => c.name === 'ein-thread'), 'Threads stehen nicht als eigener Chat in der Liste');
  assert.equal(flat.find((c) => c.name === 'allgemein').unsupported, false);
});

test('Kanalzugriff zählt nicht unterstützte Kanäle und aktive Threads', async () => {
  const { service } = await readyService({ withExtraTypes: true });
  const a = service.getChannelAccess({ guildId: GUILD_ID });
  assert.deepEqual(a.unsupported.map((c) => `${c.type}:${c.name}`), ['forum:ideen-forum', 'stage:bühne']);
  assert.equal(a.threads, 1);
});

test('Nicht unterstützte Kanäle lassen sich nicht als Text-Chat öffnen (klare Fehlermeldung)', async () => {
  const { service, world } = await readyService({ withExtraTypes: true });
  await assert.rejects(service.getMessages({ channelId: world.channels.forum.id, limit: 50 }), { code: 'NOT_FOUND' });
});
