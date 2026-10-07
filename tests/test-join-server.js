'use strict';

// "Server beitreten": Einladungslink erkennen, Vorschau über die offizielle API, Bot-Einladung mit vorausgewähltem Server.
// Der Beitritt selbst passiert in der offiziellen Discord-App mit dem eigenen Account (kein Self-Bot).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseInviteCode, inviteJoinUrl } = require('../src/shared/invites');
const { validators } = require('../src/main/validate');
const { readyService, GUILD_ID } = require('./helpers/fake-discord');

test('Einladungslinks in allen üblichen Formen werden erkannt', () => {
  assert.equal(parseInviteCode('https://discord.gg/abc123'), 'abc123');
  assert.equal(parseInviteCode('discord.gg/Moin-Club'), 'Moin-Club');
  assert.equal(parseInviteCode('https://discord.com/invite/abc123'), 'abc123');
  assert.equal(parseInviteCode('https://discordapp.com/invite/abc123/'), 'abc123');
  assert.equal(parseInviteCode('https://ptb.discord.com/invite/abc123?event=1'), 'abc123');
  assert.equal(parseInviteCode('  abc123  '), 'abc123');
});

test('Unsinn und fremde Links werden abgelehnt', () => {
  for (const bad of ['', '   ', 'https://evil.example/invite/abc', 'discord.gg/', 'a', 'abc 123', 'javascript:alert(1)', null, 42, 'x'.repeat(300)]) {
    assert.equal(parseInviteCode(bad), null, `sollte abgelehnt werden: ${String(bad).slice(0, 30)}`);
  }
  assert.throws(() => validators.inviteInput({ invite: 'https://evil.example/x' }), { code: 'VALIDATION' });
  assert.deepEqual(validators.inviteInput({ invite: 'discord.gg/abc123' }), { code: 'abc123' });
});

test('Beitritts-Link zeigt immer auf discord.com', () => {
  assert.equal(inviteJoinUrl('abc123'), 'https://discord.com/invite/abc123');
});

test('Vorschau liefert Servername, Mitglieder, Online-Zahl; Bot tritt NICHT bei', async () => {
  const { service, world } = await readyService();
  const calls = [];
  world.client.fetchInvite = async (code) => {
    calls.push(code);
    return {
      code,
      guild: { id: '777777777777777777', name: 'Moin Club', iconURL: () => 'https://cdn.discordapp.com/icons/x.png' },
      memberCount: 120,
      presenceCount: 33,
      channel: { name: 'willkommen' },
      expiresTimestamp: null,
    };
  };
  const p = await service.previewInvite({ code: 'abc123' });
  assert.deepEqual(calls, ['abc123']);
  assert.equal(p.guild.name, 'Moin Club');
  assert.equal(p.memberCount, 120);
  assert.equal(p.onlineCount, 33);
  assert.equal(p.botAlreadyThere, false);
  assert.equal(world.client.guilds.cache.has('777777777777777777'), false, 'Bot ist nicht beigetreten');
});

test('Vorschau erkennt, wenn der Bot schon auf dem Server ist; Gruppen-DM-Einladung → klare Meldung', async () => {
  const { service, world } = await readyService();
  world.client.fetchInvite = async (code) => ({ code, guild: { id: GUILD_ID, name: 'Testserver' } });
  assert.equal((await service.previewInvite({ code: 'abc123' })).botAlreadyThere, true);
  world.client.fetchInvite = async (code) => ({ code, guild: null });
  await assert.rejects(service.previewInvite({ code: 'abc123' }), { code: 'NOT_FOUND' });
});

test('Bot-Einladung: mit Server-ID vorausgewählt und fixiert, ohne ID wie bisher', async () => {
  const { service } = await readyService();
  const plain = service.getInviteUrl();
  assert.ok(!plain.includes('guild_id'));
  const pre = service.getInviteUrl({ guildId: '777777777777777777' });
  assert.match(pre, /&guild_id=777777777777777777&disable_guild_select=true$/);
  assert.match(pre, /^https:\/\/discord\.com\/oauth2\/authorize\?client_id=\d+&scope=bot\+applications\.commands&permissions=\d+/);
});
