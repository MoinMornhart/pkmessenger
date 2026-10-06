'use strict';

// Issue #1 ("wird nicht aktualisiert", "alle Kanäle"): Aktualisieren per REST, Rechte-Events, gesperrte Kanäle erklären.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, GUILD_ID, Events, BOT_ID } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');

test('Aktualisieren holt Bot-Rollen, Rollenrechte und Kanäle frisch und meldet Änderungen', async () => {
  const { service, world, events } = await readyService();
  const res = await service.refresh({ guildId: GUILD_ID });
  assert.deepEqual(res, { refreshed: 1, failed: [] });
  assert.deepEqual(world.guild.refreshCalls, ['fetchMe', 'roles', 'channels']);
  assert.ok(events.some((e) => e.type === 'channels:changed' && e.payload.guildId === GUILD_ID));
  assert.ok(events.some((e) => e.type === 'guilds:changed'));
});

test('Aktualisieren ohne Server-Angabe = alle Server; ein Fehler bricht nicht ab', async () => {
  const { service, world } = await readyService();
  world.guild.refreshShouldFail = true;
  const res = await service.refresh();
  assert.deepEqual(res, { refreshed: 0, failed: ['Testserver'] });
});

test('Rechte-Änderung am Bot selbst löst Neuladen aus, an anderen Mitgliedern nicht', async () => {
  const { world, events } = await readyService();
  const before = events.length;
  world.client.emit(Events.GuildMemberUpdate, {}, { id: '555555555555555555', guild: world.guild });
  assert.equal(events.length, before, 'fremdes Mitglied → nichts');
  world.client.emit(Events.GuildMemberUpdate, {}, { id: BOT_ID, guild: world.guild });
  world.client.emit(Events.GuildRoleCreate, { guild: world.guild });
  world.client.emit(Events.GuildRoleDelete, null); // Null-Fall darf nicht abstürzen
  assert.equal(events.filter((e) => e.type === 'channels:changed').length, 3);
});

test('Kanalzugriff: gesperrte und nur-lesbare Kanäle werden benannt', async () => {
  const { service } = await readyService();
  const access = service.getChannelAccess({ guildId: GUILD_ID });
  assert.deepEqual(access.hidden.map((c) => c.name), ['geheim']);
  assert.deepEqual(access.readOnly.map((c) => c.name), ['nur-lesen']);
  assert.equal(access.total, 7);
  assert.equal(access.hidden[0].type, 'text');
});

test('Validierung: refresh ohne/mit guildId, kaputte ID abgelehnt', () => {
  assert.deepEqual(validators.optionalGuildRef(undefined), {});
  assert.deepEqual(validators.optionalGuildRef({}), {});
  assert.deepEqual(validators.optionalGuildRef({ guildId: GUILD_ID }), { guildId: GUILD_ID });
  assert.throws(() => validators.optionalGuildRef({ guildId: 'x' }), { code: 'VALIDATION' });
});
