'use strict';

// Moderation per Rechtsklick (Issue #1): Rollen, Timeout, Kick, Bann – nur mit Bot-Rechten.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, P } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');

const ANNA = '555555555555555501';
const MODS = '333333333333333301'; // Position 2 (unter der Bot-Rolle 3)

async function setup(perms = []) {
  const ctx = await readyService();
  ctx.world.addMember(ANNA, 'Anna');
  for (const p of perms) ctx.world.guild.members.me.permFlags.add(p);
  ctx.ref = { guildId: ctx.world.guild.id, userId: ANNA };
  ctx.member = () => ctx.world.guild.members.cache.get(ANNA);
  return ctx;
}

test('Infos: ohne Rechte ist nichts erlaubt, Rollen nur unterhalb der Bot-Rolle bearbeitbar', async () => {
  const { service, ref } = await setup();
  const info = await service.getMemberInfo(ref);
  assert.equal(info.name, 'Anna');
  assert.deepEqual(info.can, { roles: false, timeout: false, kick: false, ban: false });
  const withPerms = await setup([P.ManageRoles, P.ModerateMembers, P.KickMembers, P.BanMembers]);
  const i2 = await withPerms.service.getMemberInfo(withPerms.ref);
  assert.deepEqual(i2.can, { roles: true, timeout: true, kick: true, ban: true });
  assert.deepEqual(i2.roles.map((r) => [r.name, r.editable]), [['Moderatoren', true], ['Mods-Geheim', true]]);
  withPerms.world.guild.members.me.roles.highest.position = 2; // Bot-Rolle unter „Moderatoren“
  const i3 = await withPerms.service.getMemberInfo(withPerms.ref);
  assert.equal(i3.roles.find((r) => r.name === 'Moderatoren').editable, false);
});

test('Rolle geben/nehmen mit Grund im Audit-Log; Rolle über dem Bot wird abgelehnt', async () => {
  const { service, ref, member, world } = await setup([P.ManageRoles]);
  const info = await service.setMemberRole(validators.memberRole({ ...ref, roleId: MODS, add: true, reason: 'hilft viel' }));
  assert.equal(info.roles.find((r) => r.id === MODS).has, true);
  assert.deepEqual(member().modCalls[0], ['role+', MODS, 'PKMessenger: hilft viel']);
  await service.setMemberRole(validators.memberRole({ ...ref, roleId: MODS, add: false }));
  assert.equal((await service.getMemberInfo(ref)).roles.find((r) => r.id === MODS).has, false);
  world.guild.members.me.roles.highest.position = 1;
  await assert.rejects(service.setMemberRole(validators.memberRole({ ...ref, roleId: MODS, add: true })), { code: 'MISSING_PERMISSION', message: /über der Bot-Rolle/ });
});

test('Timeout setzen und aufheben', async () => {
  const { service, ref, member } = await setup([P.ModerateMembers]);
  const info = await service.timeoutMember(validators.memberTimeout({ ...ref, minutes: 60, reason: 'Spam' }));
  assert.ok(info.timeoutUntil > Date.now());
  assert.deepEqual(member().modCalls[0], ['timeout', 3600000, 'PKMessenger: Spam']);
  const off = await service.timeoutMember(validators.memberTimeout({ ...ref, minutes: 0 }));
  assert.equal(off.timeoutUntil, null);
});

test('Kick und Bann nur mit Recht und wenn Discord es erlaubt (z. B. nicht der Besitzer)', async () => {
  const none = await setup();
  await assert.rejects(none.service.kickMember(validators.memberKick(none.ref)), { code: 'MISSING_PERMISSION' });
  const k = await setup([P.KickMembers]);
  k.member().kickable = false; // z. B. höhere Rolle als der Bot
  await assert.rejects(k.service.kickMember(validators.memberKick(k.ref)), /nicht kicken/);
  k.member().kickable = true;
  assert.deepEqual(await k.service.kickMember(validators.memberKick({ ...k.ref, reason: 'Regeln' })), { userId: ANNA, kicked: true });
  const b = await setup([P.BanMembers]);
  await b.service.banMember(validators.memberBan({ ...b.ref, reason: 'Raid', deleteMessageSeconds: 86400 }));
  assert.deepEqual(b.world.guild.bans[0], { id: ANNA, reason: 'PKMessenger: Raid', deleteMessageSeconds: 86400 });
});

test('Unbekannte Person, Validierung', async () => {
  const { service, world } = await setup([P.KickMembers]);
  await assert.rejects(service.getMemberInfo({ guildId: world.guild.id, userId: '123456789012345678' }), { code: 'NOT_FOUND' });
  const ref = { guildId: '111111111111111111', userId: ANNA };
  assert.throws(() => validators.memberTimeout({ ...ref, minutes: 40321 }), /28 Tage/);
  assert.throws(() => validators.memberTimeout({ ...ref, minutes: 1.5 }), /28 Tage/);
  assert.throws(() => validators.memberBan({ ...ref, deleteMessageSeconds: 604801 }), /7 Tage/);
  assert.throws(() => validators.memberKick({ ...ref, reason: 'x'.repeat(401) }), /400/);
  assert.throws(() => validators.memberRole({ ...ref, roleId: 'abc', add: true }), /Ungültige ID/);
  assert.throws(() => validators.copyText({ text: 'x'.repeat(4001) }), /Ungültiger Text/);
});
