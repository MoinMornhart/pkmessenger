'use strict';

// F7 Antworten · F8 Reaktionen · F9 Bearbeiten/Löschen · F10 Dateien · F11 Embeds · F12 Threads · F13 Pins · F14 Suche · F15 Slash-Befehle
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, makeMessage, P, Events, GUILD_ID, BOT_ID } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');

const NONE = { users: [], roles: [], everyone: false };
const ANNA = '555555555555555555';

function seed(world, { own = false, content = 'Hallo' } = {}) {
  const ch = world.channels.allgemein;
  const author = own ? world.client.user : world.makeUser(ANNA, 'anna');
  const m = makeMessage({ id: String(1000000000000000000n + BigInt(ch.store.length + 1)), channel: ch, author, content });
  ch.store.push(m);
  return { ch, m };
}

function grant(channel, ...flags) {
  const before = channel.permissionsFor;
  channel.permissionsFor = (me) => ({ has: (f) => flags.includes(f) || before(me).has(f) });
}

// ---------- F7 ----------
test('F7 Antworten: message_reference, Antwort-Ping nur auf Wunsch, Vorschau der Originalnachricht', async () => {
  const { service, world } = await readyService();
  const { ch, m } = seed(world, { content: 'Wer kommt heute?' });
  await service.sendMessage({ channelId: ch.id, content: 'Ich!', mentions: NONE, replyTo: m.id, pingReply: false, files: [], embeds: [] });
  const sent = ch.sent.at(-1);
  assert.deepEqual(sent.reply, { messageReference: m.id, failIfNotExists: false });
  assert.equal(sent.allowedMentions.repliedUser, false);
  await service.sendMessage({ channelId: ch.id, content: 'Ich auch', mentions: NONE, replyTo: m.id, pingReply: true, files: [], embeds: [] });
  assert.equal(ch.sent.at(-1).allowedMentions.repliedUser, true);

  const reply = makeMessage({ id: '1000000000000000099', channel: ch, author: world.makeUser(ANNA, 'anna'), content: 'Antwort' });
  reply.reference = { messageId: m.id, channelId: ch.id };
  const s = service.serializeMessage(reply);
  assert.deepEqual(s.reference, { messageId: m.id, channelId: ch.id, authorName: 'anna', text: 'Wer kommt heute?' });
});

// ---------- F8 ----------
test('F8 Reaktionen: hinzufügen, entfernen, Recht für neue Reaktion, Serialisierung', async () => {
  const { service, world } = await readyService();
  const { ch, m } = seed(world);
  await assert.rejects(service.react({ channelId: ch.id, messageId: m.id, emoji: '👍', add: true }), { code: 'MISSING_PERMISSION' });
  grant(ch, P.AddReactions);
  let s = await service.react({ channelId: ch.id, messageId: m.id, emoji: '👍', add: true });
  assert.deepEqual(s.reactions.map((r) => [r.key, r.count, r.me]), [['👍', 1, true]]);
  s = await service.react({ channelId: ch.id, messageId: m.id, emoji: '👍', add: false });
  assert.deepEqual(s.reactions, []);
});

test('F8 Reaktion live: Event aktualisiert die Nachricht in der Oberfläche', async () => {
  const { world, events } = await readyService();
  const { m } = seed(world);
  await m.react('🎉');
  world.client.emit(Events.MessageReactionAdd, { partial: false, message: m });
  await new Promise((r) => setImmediate(r));
  const upd = events.filter((e) => e.type === 'message:update').at(-1);
  assert.equal(upd.payload.reactions[0].key, '🎉');
});

test('F8 Emoji-Prüfung: Unicode und Server-Emojis ok, Unsinn abgelehnt', () => {
  const base = { channelId: '444444444444444401', messageId: '1000000000000000001', add: true };
  for (const ok of ['👍', '❤️', '🇩🇪', '👋🏽', 'pepe:123456789012345678']) assert.equal(validators.react({ ...base, emoji: ok }).emoji, ok);
  for (const bad of ['', 'abc', '<script>', 'a'.repeat(70), '👍 👍', 'x:1']) assert.throws(() => validators.react({ ...base, emoji: bad }), { code: 'VALIDATION' });
});

// ---------- F9 ----------
test('F9 Bearbeiten: nur eigene Nachrichten; Ergebnis als bearbeitet markiert', async () => {
  const { service, world } = await readyService();
  const own = seed(world, { own: true, content: 'Tippfeler' });
  const s = await service.editMessage({ channelId: own.ch.id, messageId: own.m.id, content: 'Tippfehler', mentions: NONE });
  assert.equal(s.content, 'Tippfehler');
  assert.ok(s.editedTimestamp);
  assert.equal(s.canEdit, true);
  const foreign = seed(world);
  await assert.rejects(service.editMessage({ channelId: foreign.ch.id, messageId: foreign.m.id, content: 'x', mentions: NONE }), { code: 'MISSING_PERMISSION' });
});

test('F9 Löschen: eigene ja; fremde nur mit "Nachrichten verwalten"', async () => {
  const { service, world } = await readyService();
  const own = seed(world, { own: true });
  assert.deepEqual(await service.deleteMessage({ channelId: own.ch.id, messageId: own.m.id }), { id: own.m.id, channelId: own.ch.id });
  assert.equal(own.m.deleted, true);
  const foreign = seed(world);
  assert.equal(service.serializeMessage(foreign.m).canDelete, false);
  await assert.rejects(service.deleteMessage({ channelId: foreign.ch.id, messageId: foreign.m.id }), { code: 'MISSING_PERMISSION' });
  grant(foreign.ch, P.ManageMessages);
  assert.equal(service.serializeMessage(foreign.m).canDelete, true);
  await service.deleteMessage({ channelId: foreign.ch.id, messageId: foreign.m.id });
  assert.equal(foreign.m.deleted, true);
  await assert.rejects(service.deleteMessage({ channelId: foreign.ch.id, messageId: '1000000000000009999' }), { code: 'NOT_FOUND' });
});

// ---------- F10 ----------
test('F10 Dateien: Recht "Dateien anhängen", Name bereinigt, 25-MiB-Grenze, max. 10 Dateien', async () => {
  const { service, world } = await readyService();
  const ch = world.channels.allgemein;
  const file = { name: '../../böse:datei.txt', data: new Uint8Array([104, 105]) };
  const v = validators.sendMessage({ channelId: ch.id, content: '', files: [file] });
  assert.equal(v.files[0].name, '.._.._böse_datei.txt'.replace(/^\.+/, '_'));
  await assert.rejects(service.sendMessage({ ...v, mentions: NONE }), { code: 'MISSING_PERMISSION' });
  grant(ch, P.AttachFiles);
  await service.sendMessage({ ...v, mentions: NONE });
  assert.equal(ch.sent.at(-1).files[0].attachment.toString(), 'hi');
  assert.equal(ch.sent.at(-1).content, undefined, 'leerer Text wird nicht mitgeschickt');
  const big = new Uint8Array(25 * 1024 * 1024 + 1);
  assert.throws(() => validators.sendMessage({ channelId: ch.id, content: '', files: [{ name: 'gross.bin', data: big }] }), /25 MiB/);
  const many = Array.from({ length: 11 }, (_, i) => ({ name: `f${i}`, data: new Uint8Array([1]) }));
  assert.throws(() => validators.sendMessage({ channelId: ch.id, content: '', files: many }), /10 Dateien/);
  assert.throws(() => validators.sendMessage({ channelId: ch.id, content: '', files: [{ name: 'x', data: 'kein Uint8Array' }] }), { code: 'VALIDATION' });
});

// ---------- F11 ----------
test('F11 Embeds: Baukasten-Prüfung, Discord-Format, Anzeige-Serialisierung', async () => {
  const { service, world } = await readyService();
  const ch = world.channels.allgemein;
  const v = validators.sendMessage({ channelId: ch.id, content: '', embeds: [{ title: 'Release', description: 'Neu!', color: '#2dd4bf', url: 'https://example.com' }] });
  grant(ch, P.EmbedLinks);
  await service.sendMessage({ ...v, mentions: NONE });
  assert.deepEqual(ch.sent.at(-1).embeds[0], { title: 'Release', description: 'Neu!', url: 'https://example.com/', color: 0x2dd4bf });
  assert.throws(() => validators.sendMessage({ channelId: ch.id, content: '', embeds: [{ color: '#fff' }] }), { code: 'VALIDATION' });
  assert.throws(() => validators.sendMessage({ channelId: ch.id, content: '', embeds: [{ title: 'x', url: 'javascript:alert(1)' }] }), /Link/);
  assert.throws(() => validators.sendMessage({ channelId: ch.id, content: '', embeds: [{ title: 'x'.repeat(257) }] }), /zu lang/);
  const m = seed(world).m;
  m.embeds = [{ title: 'T', description: 'D', color: 0xff8800, fields: [{ name: 'A', value: 'B', inline: true }], footer: { text: 'F' } }];
  const e = service.serializeMessage(m).embeds[0];
  assert.deepEqual([e.title, e.color, e.fields[0].inline, e.footer], ['T', '#ff8800', true, 'F']);
});

// ---------- F12 ----------
test('F12 Threads: aus Nachricht, frei, auflisten, als Chat öffnen; Senden braucht "in Threads senden"', async () => {
  const { service, world } = await readyService();
  const ch = world.channels.allgemein;
  await assert.rejects(service.createThread({ channelId: ch.id, name: 'Planung' }), { code: 'MISSING_PERMISSION' });
  grant(ch, P.CreatePublicThreads);
  const t = await service.createThread({ channelId: ch.id, name: 'Planung' });
  assert.equal(t.name, 'Planung');
  const { m } = seed(world);
  const t2 = await service.createThread({ channelId: ch.id, name: 'Zu dieser Nachricht', messageId: m.id });
  assert.deepEqual(m.actions.at(-1), ['startThread', 'Zu dieser Nachricht']);
  assert.equal(t2.parentId, ch.id);
  const list = await service.listThreads({ channelId: ch.id });
  assert.deepEqual(list.map((x) => x.name), ['Planung']);
  // Thread als Chat: Senden geht nur mit "Nachrichten in Threads senden"
  world.client.channels.cache.set(t.id, ch.threads.list[0]);
  ch.threads.list[0].send = async (o) => ({ ...makeMessage({ id: '1000000000000000500', channel: ch, author: world.client.user, content: o.content }) });
  await assert.rejects(service.sendMessage({ channelId: t.id, content: 'hi', mentions: NONE }), { code: 'MISSING_PERMISSION' });
  grant(ch, P.SendMessagesInThreads);
  const sent = await service.sendMessage({ channelId: t.id, content: 'hi', mentions: NONE });
  assert.equal(sent.content, 'hi');
});

test('F12 Forum-Beitrag braucht eine erste Nachricht', async () => {
  const { service, world } = await readyService({ withExtraTypes: true });
  const forum = world.channels.forum;
  await assert.rejects(service.createThread({ channelId: forum.id, name: 'Idee' }), { code: 'VALIDATION' });
  const t = await service.createThread({ channelId: forum.id, name: 'Idee', content: 'Dunkles Design?' });
  assert.equal(t.name, 'Idee');
  assert.deepEqual(forum.threads.created[0].message.content, 'Dunkles Design?');
});

// ---------- F13 ----------
test('F13 Pins: Recht "Nachrichten anheften", anheften, lösen, Liste', async () => {
  const { service, world } = await readyService();
  const { ch, m } = seed(world);
  await assert.rejects(service.setPinned({ channelId: ch.id, messageId: m.id, pin: true }), { code: 'MISSING_PERMISSION' });
  grant(ch, P.PinMessages);
  assert.equal((await service.setPinned({ channelId: ch.id, messageId: m.id, pin: true })).pinned, true);
  const pins = await service.listPins({ channelId: ch.id });
  assert.deepEqual(pins.items.map((p) => p.message.id), [m.id]);
  assert.equal((await service.setPinned({ channelId: ch.id, messageId: m.id, pin: false })).pinned, false);
});

// ---------- F14 ----------
test('F14 Serversuche: offizieller Endpoint, Filter, nur sichtbare Kanäle, Indizierung läuft', async () => {
  const { service, world } = await readyService();
  const calls = [];
  world.client.rest.get = async (route, { query }) => {
    calls.push([route, query.toString()]);
    return {
      total_results: 2,
      messages: [
        [{ id: '1', channel_id: world.channels.allgemein.id, author: { username: 'anna', global_name: 'Anna' }, content: 'Release morgen <@&333333333333333301> in <#444444444444444401>', timestamp: '2026-10-06T10:00:00Z', attachments: [] }],
        [{ id: '2', channel_id: world.channels.geheim.id, author: { username: 'x' }, content: 'geheim', timestamp: '2026-10-06T10:00:00Z' }],
      ],
    };
  };
  const res = await service.searchMessages({ guildId: GUILD_ID, content: 'release', pinned: undefined, offset: 0 });
  assert.match(calls[0][0], /\/guilds\/222222222222222222\/messages\/search/);
  assert.equal(calls[0][1], 'content=release&limit=25');
  assert.deepEqual(res.results.map((r) => [r.authorName, r.channelName]), [['Anna', 'allgemein']], 'Treffer aus unsichtbaren Kanälen werden ausgefiltert');
  assert.equal(res.results[0].content, 'Release morgen @Moderatoren in #allgemein', 'rohe Mention-Codes werden lesbar');
  world.client.rest.get = async () => ({ retry_after: 2.5 });
  assert.deepEqual(await service.searchMessages({ guildId: GUILD_ID, content: 'x' }), { pending: true, retryAfterMs: 2500, total: 0, results: [] });
  assert.throws(() => validators.search({ guildId: GUILD_ID }), /Suchbegriff/);
  assert.throws(() => validators.search({ guildId: GUILD_ID, content: 'x'.repeat(1025) }), /1024/);
});

// ---------- F15 ----------
test('F15 Slash-Befehle: werden registriert und innerhalb der Frist beantwortet (nur für den Aufrufer sichtbar)', async () => {
  const { service, world } = await readyService();
  const set = [];
  world.client.application.commands = { set: async (cmds) => set.push(cmds) };
  world.client.ws = { ping: 42 };
  await service.connect(); // registriert erneut
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(set.at(-1).map((c) => c.name), ['ping', 'pkmessenger']);
  assert.deepEqual(service.getCommandsState().commands, ['/ping', '/pkmessenger']);
  const replies = [];
  const interaction = { isChatInputCommand: () => true, commandName: 'ping', user: { username: 'anna' }, guildId: GUILD_ID, reply: async (o) => replies.push(o) };
  world.client.emit(Events.InteractionCreate, interaction);
  await new Promise((r) => setImmediate(r));
  assert.match(replies[0].content, /Pong! .*42 ms/);
  assert.equal(replies[0].flags, 64, 'ephemeral');
  assert.deepEqual(replies[0].allowedMentions, { parse: [] });
  world.client.emit(Events.InteractionCreate, { isChatInputCommand: () => false });
  world.client.emit(Events.InteractionCreate, null);
  assert.equal(replies.length, 1);
  assert.equal(BOT_ID.length > 0, true);
});
