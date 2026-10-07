'use strict';

// Issue #1 (15:38): Online-Status – freiwillig, vorher geprüft, Sicherheitsnetz bei Ablehnung durch Discord
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, createTestService, GUILD_ID } = require('./helpers/fake-discord');

const flagStore = (initial = false) => {
  let on = initial;
  return { get: () => on, set: (v) => (on = v) };
};

test('Einschalten nur, wenn „Presence Intent“ im Portal an ist', async () => {
  const presence = flagStore();
  const { service, world } = await readyService({ presence });
  world.client.application.flags = { has: () => false };
  await assert.rejects(service.setPresence({ on: true }), /Presence Intent/);
  assert.equal(presence.get(), false);
  world.client.application.flags = { has: (f) => f === 'GatewayPresenceLimited' };
  assert.deepEqual(await service.setPresence({ on: true }), { on: true });
  assert.equal(presence.get(), true);
});

test('Status nur, wenn eingeschaltet', async () => {
  const presence = flagStore(false);
  const { service, world } = await readyService({ presence });
  world.addMember('555555555555555551', 'Anna');
  world.guild.members.cache.get('555555555555555551').presence = { status: 'idle', activities: [{ name: 'Minecraft', type: 0 }] };
  let p = await service.getUserProfile({ userId: '555555555555555551', guildId: GUILD_ID });
  assert.equal(p.status, null);
  presence.set(true);
  p = await service.getUserProfile({ userId: '555555555555555551', guildId: GUILD_ID });
  assert.equal(p.status, 'idle');
  assert.equal(p.activity, 'Minecraft');
  const res = await service.searchMentionables({ guildId: GUILD_ID, query: 'ann' });
  assert.equal(res.find((r) => r.kind === 'user').status, 'idle');
});

test('Discord lehnt ab (4014) → Online-Status automatisch aus, Neuverbindung', async () => {
  const presence = flagStore(true);
  const { service, events } = createTestService({ loginBehavior: 'disallowed-intents', presence });
  const st = await service.connect();
  assert.equal(st.state, 'error');
  assert.equal(presence.get(), false);
  assert.ok(events.some((e) => e.type === 'log' && /Presence intent rejected/.test(e.payload.message)));
});
