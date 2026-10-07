'use strict';

// Kanäle verwalten per Rechtsklick (Issue #1): umbenennen, verschieben – nur mit „Kanäle verwalten“
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, P } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');
const { sanitizeWallpapers, wallpaperFor } = require('../src/shared/wallpapers');

function grant(ch, ...flags) {
  const before = ch.permissionsFor;
  ch.permissionsFor = (me) => ({ has: (f) => flags.includes(f) || before(me).has(f) });
}

test('Ohne „Kanäle verwalten“: abgelehnt; Kanalliste meldet canManage', async () => {
  const { service, world } = await readyService();
  const ch = world.channels.allgemein;
  await assert.rejects(service.renameChannel(validators.channelRename({ channelId: ch.id, name: 'neu' })), { code: 'MISSING_PERMISSION' });
  assert.equal(service.listChannels({ guildId: world.guild.id }).flatMap((g) => g.channels).find((c) => c.id === ch.id).canManage, false);
  grant(ch, P.ManageChannels);
  assert.equal(service.listChannels({ guildId: world.guild.id }).flatMap((g) => g.channels).find((c) => c.id === ch.id).canManage, true);
});

test('Umbenennen und verschieben mit Recht; Liste wird neu geladen', async () => {
  const { service, world, events } = await readyService();
  const ch = world.channels.allgemein;
  grant(ch, P.ManageChannels);
  await service.renameChannel(validators.channelRename({ channelId: ch.id, name: '  plaudern  ' }));
  assert.equal(ch.name, 'plaudern');
  const pos = ch.position;
  await service.moveChannel(validators.channelMove({ channelId: ch.id, direction: 'down' }));
  assert.equal(ch.position, pos + 1);
  assert.deepEqual(ch.manageCalls[1], ['position', 1, { relative: true, reason: 'PKMessenger' }]);
  assert.ok(events.some((e) => e.type === 'channels:changed'));
  assert.throws(() => validators.channelRename({ channelId: ch.id, name: '' }), /1–100/);
  assert.throws(() => validators.channelMove({ channelId: ch.id, direction: 'links' }), /Richtung/);
});

test('Chat-Hintergründe: Chat vor Server vor Standard, Unsinn wird verworfen', () => {
  const map = sanitizeWallpapers({ default: 'sterne', '111111111111111111': 'aurora', '444444444444444401': 'raster', kaputt: 'aurora', '222222222222222222': 'gibtsnicht' });
  assert.deepEqual(Object.keys(map).sort(), ['111111111111111111', '444444444444444401', 'default']);
  assert.equal(wallpaperFor(map, { channelId: '444444444444444401', guildId: '111111111111111111' }), 'raster');
  assert.equal(wallpaperFor(map, { channelId: '444444444444444402', guildId: '111111111111111111' }), 'aurora');
  assert.equal(wallpaperFor(map, { channelId: '1', guildId: '2' }), 'sterne');
  assert.equal(wallpaperFor({}, {}), 'punkte');
});
