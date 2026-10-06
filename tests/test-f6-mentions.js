'use strict';

// F6: Mentions – Autocomplete, Token-Einsetzung, allowed_mentions, @everyone-Schutz.
const test = require('node:test');
const assert = require('node:assert/strict');
const { tokenizeMentions, applyMentionTokens, buildAllowedMentions, findMentionQuery, containsMassMention } = require('../src/shared/mentions');
const { readyService, GUILD_ID } = require('./helpers/fake-discord');

const U = '555555555555555555';
const R = '333333333333333301';
const C = '444444444444444401';

test('Tokenizer erkennt User/Rolle/Kanal/@everyone/@here', () => {
  assert.deepEqual(tokenizeMentions(`Hi <@${U}> und <@!${U}>, <@&${R}> in <#${C}> @everyone @here!`), [
    { type: 'text', value: 'Hi ' },
    { type: 'user', id: U },
    { type: 'text', value: ' und ' },
    { type: 'user', id: U },
    { type: 'text', value: ', ' },
    { type: 'role', id: R },
    { type: 'text', value: ' in ' },
    { type: 'channel', id: C },
    { type: 'text', value: ' ' },
    { type: 'everyone' },
    { type: 'text', value: ' ' },
    { type: 'here' },
    { type: 'text', value: '!' },
  ]);
  assert.deepEqual(tokenizeMentions('kein <@123> token'), [{ type: 'text', value: 'kein <@123> token' }]);
});

test('Lesbare Platzhalter werden in Discord-Tokens umgewandelt + ID-Listen gesammelt', () => {
  const r = applyMentionTokens('Hey @Anna B und @Anna, siehe #allgemein – @Moderatoren', [
    { display: '@Anna', kind: 'user', id: '555555555555555551' },
    { display: '@Anna B', kind: 'user', id: '555555555555555552' },
    { display: '#allgemein', kind: 'channel', id: C },
    { display: '@Moderatoren', kind: 'role', id: R },
  ]);
  assert.equal(r.content, `Hey <@555555555555555552> und <@555555555555555551>, siehe <#${C}> – <@&${R}>`);
  assert.deepEqual(r.users.sort(), ['555555555555555551', '555555555555555552']);
  assert.deepEqual(r.roles, [R]);
  assert.equal(r.massMention, false);
});

test('Gelöschter/veränderter Platzhalter wird NICHT zur Mention', () => {
  const r = applyMentionTokens('Hey @Ann', [{ display: '@Anna', kind: 'user', id: U }]);
  assert.equal(r.content, 'Hey @Ann');
  assert.deepEqual(r.users, []);
});

test('allowed_mentions: parse ist leer, außer @everyone wurde bestätigt', () => {
  assert.deepEqual(buildAllowedMentions({ users: [U], roles: [R] }), { parse: [], users: [U], roles: [R], repliedUser: false });
  assert.deepEqual(buildAllowedMentions({ everyone: true }).parse, ['everyone']);
  const many = Array.from({ length: 150 }, (_, i) => String(100000000000000000n + BigInt(i)));
  assert.equal(buildAllowedMentions({ users: many }).users.length, 100, 'Discord erlaubt max. 100 IDs');
});

test('@everyone/@here werden erkannt (für den Bestätigungsdialog)', () => {
  assert.equal(containsMassMention('Achtung @everyone'), true);
  assert.equal(containsMassMention('@here jetzt'), true);
  assert.equal(containsMassMention('mail@everyonex.de'), false);
});

test('Autocomplete-Trigger: "@an" vor dem Cursor, nicht mitten in E-Mails', () => {
  assert.deepEqual(findMentionQuery('Hallo @an', 9), { trigger: '@', query: 'an', start: 6 });
  assert.deepEqual(findMentionQuery('#allg', 5), { trigger: '#', query: 'allg', start: 0 });
  assert.deepEqual(findMentionQuery('@', 1), { trigger: '@', query: '', start: 0 });
  assert.equal(findMentionQuery('mail@test', 9), null);
  assert.equal(findMentionQuery('Hallo @an du', 12), null);
});

test('Senden mit Mentions: explizite IDs landen in allowed_mentions', async () => {
  const { service, world } = await readyService();
  await service.sendMessage({ channelId: world.channels.allgemein.id, content: `<@${U}> <@&${R}>`, mentions: { users: [U], roles: [R], everyone: false } });
  assert.deepEqual(world.channels.allgemein.sent[0].allowedMentions, { parse: [], users: [U], roles: [R], repliedUser: false });
});

test('@everyone ohne MENTION_EVERYONE-Recht → abgelehnt; mit Recht → parse everyone', async () => {
  const { service, world } = await readyService();
  await assert.rejects(service.sendMessage({ channelId: world.channels.allgemein.id, content: '@everyone', mentions: { users: [], roles: [], everyone: true } }), {
    code: 'MISSING_PERMISSION',
  });
  assert.equal(world.channels.allgemein.sent.length, 0);
  await service.sendMessage({ channelId: world.channels.ankuendigungen.id, content: '@everyone Release!', mentions: { users: [], roles: [], everyone: true } });
  assert.deepEqual(world.channels.ankuendigungen.sent[0].allowedMentions.parse, ['everyone']);
});

test('Mention-Suche: Mitglieder per Search-Endpoint, Rollen ohne @everyone-Rolle, Spezial-Einträge', async () => {
  const { service, world } = await readyService();
  world.addMember(U, 'Anna');
  world.addMember('555555555555555556', 'Bernd');
  const res = await service.searchMentionables({ guildId: GUILD_ID, query: 'an' });
  assert.deepEqual(world.guild.members.searchCalls, [{ query: 'an', limit: 8 }]);
  assert.deepEqual(res.map((r) => `${r.kind}:${r.display}`), ['user:Anna']);
  const roles = await service.searchMentionables({ guildId: GUILD_ID, query: 'mod' });
  assert.deepEqual(roles.map((r) => `${r.kind}:${r.display}:${r.pingable}`), ['role:Moderatoren:true', 'role:Mods-Geheim:false']);
  const ev = await service.searchMentionables({ guildId: GUILD_ID, query: 'e' });
  assert.ok(ev.some((r) => r.kind === 'everyone'));
  assert.ok(!ev.some((r) => r.display === '@everyone'), 'die @everyone-Rolle selbst wird nicht als Rolle angeboten');
});

test('Mention-Suche fällt auf den Cache zurück, wenn der Endpoint scheitert', async () => {
  const { service, world } = await readyService();
  world.addMember(U, 'Anna');
  world.guild.members.searchShouldFail = true;
  const res = await service.searchMentionables({ guildId: GUILD_ID, query: 'ann' });
  assert.deepEqual(res.filter((r) => r.kind === 'user').map((r) => r.display), ['Anna']);
});
