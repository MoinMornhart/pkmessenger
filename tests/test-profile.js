'use strict';

// Bot-Profil (Wunsch JoniMoni, Issue #1): Name, Bild, Beschreibung, Spitzname je Server.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, P } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1]);

test('Profil lesen: Name, Bild, Beschreibung und Server-Spitzname', async () => {
  const { service, world } = await readyService();
  const p = await service.getProfile({});
  assert.equal(p.username, 'PKBot');
  assert.equal(p.description, 'Testbot');
  assert.equal(p.server, null);
  const s = await service.getProfile({ guildId: world.guild.id });
  assert.deepEqual(s.server, { guildId: world.guild.id, guildName: 'Testserver', nick: '', canChangeNick: false });
});

test('Profil ändern: offizielle Endpunkte, Status bekommt neuen Namen', async () => {
  const { service, world } = await readyService();
  const v = validators.profileUpdate({ username: '  Neuer Bot ', avatar: PNG, description: ' Hallo! ' });
  assert.equal(v.username, 'Neuer Bot');
  assert.match(v.avatar, /^data:image\/png;base64,/);
  const res = await service.updateProfile(v);
  assert.deepEqual(res.changed, ['username', 'avatar', 'description']);
  assert.deepEqual(world.client.profileCalls.map((c) => c[0]), ['user', 'app']);
  assert.equal(world.client.profileCalls[1][1].description, 'Hallo!');
  assert.equal(service.getStatus().bot.username, 'Neuer Bot');
  assert.equal(res.profile.description, 'Hallo!');
});

test('Unveränderter Name wird nicht erneut gesendet (Discord erlaubt nur 2 Änderungen pro Stunde)', async () => {
  const { service, world } = await readyService();
  const res = await service.updateProfile(validators.profileUpdate({ username: 'PKBot' }));
  assert.deepEqual(res.changed, []);
  assert.equal(world.client.profileCalls.length, 0);
});

test('Spitzname je Server braucht "Nickname ändern"; leer = zurücksetzen', async () => {
  const { service, world } = await readyService();
  const gid = world.guild.id;
  await assert.rejects(service.updateProfile(validators.profileUpdate({ guildId: gid, nick: 'Hilfsbot' })), { code: 'MISSING_PERMISSION' });
  world.guild.members.me.permFlags.add(P.ChangeNickname);
  await service.updateProfile(validators.profileUpdate({ guildId: gid, nick: 'Hilfsbot' }));
  assert.equal(world.guild.members.me.nickname, 'Hilfsbot');
  await service.updateProfile(validators.profileUpdate({ guildId: gid, nick: '' }));
  assert.equal(world.guild.members.me.nickname, null);
  assert.equal((await service.getProfile({ guildId: gid })).server.canChangeNick, true);
});

test('Profil-Validierung: Discord-Regeln für Namen, Bildformat, Längen', () => {
  const bad = [
    [{ username: 'a' }, /2–32/],
    [{ username: 'x'.repeat(33) }, /2–32/],
    [{ username: 'Mein@Bot' }, /nicht @/],
    [{ username: 'DiscordHelper' }, /discord/],
    [{ username: 'here' }, /nicht @/],
    [{ avatar: new Uint8Array(20) }, /PNG, JPG, GIF oder WebP/],
    [{ avatar: 'https://example.com/a.png' }, /Ungültiges Bild/],
    [{ avatar: new Uint8Array(8 * 1024 * 1024 + 1) }, /8 MiB/],
    [{ description: 'x'.repeat(401) }, /400/],
    [{ nick: 'x', guildId: '111111111111111111' }, null],
    [{ nick: 'x'.repeat(33), guildId: '111111111111111111' }, /32/],
    [{ nick: 'x' }, /Server/],
    [{}, /Nichts zu ändern/],
    ['kaputt', /kein Objekt/],
  ];
  for (const [p, re] of bad) {
    if (re) assert.throws(() => validators.profileUpdate(p), re, JSON.stringify(p).slice(0, 60));
    else assert.doesNotThrow(() => validators.profileUpdate(p));
  }
  assert.match(validators.profileUpdate({ avatar: WEBP }).avatar, /^data:image\/webp;base64,/);
  assert.equal(validators.profileUpdate({ avatar: null }).avatar, null);
  assert.equal(validators.profileUpdate({ description: '' }).description, '');
});

test('Abgelehnter Name von Discord → verständliche Meldung', async () => {
  const { service, world } = await readyService();
  world.client.user.edit = async () => {
    const e = new Error('Invalid Form Body\nusername[USERNAME_TOO_MANY_USERS]');
    e.code = 50035;
    throw e;
  };
  await assert.rejects(service.updateProfile(validators.profileUpdate({ username: 'Belegt' })), (e) => e.code === 'VALIDATION' && /abgelehnt/.test(e.message) && /2× pro Stunde/.test(e.hint));
});

test('Nach dem Speichern bleibt der Server-Bereich erhalten, wenn die Server-ID mitkommt', async () => {
  const { service, world } = await readyService();
  const res = await service.updateProfile(validators.profileUpdate({ guildId: world.guild.id, description: 'Neu' }));
  assert.deepEqual(res.changed, ['description']);
  assert.equal(res.profile.server.guildName, 'Testserver');
});
