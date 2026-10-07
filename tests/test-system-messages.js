'use strict';

// Systemnachrichten erkennen (Wunsch JoniMoni, Issue #1): Beitritt, Boost, Pin, Thread, Umfrage-Ergebnis …
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, makeMessage } = require('./helpers/fake-discord');
const { systemInfo, isSystemType } = require('../src/shared/system-messages');
const { buildRows } = require('../src/shared/grouping');

const anna = { name: 'Anna' };

test('Normale Nachrichten sind keine Systemnachrichten', () => {
  for (const t of [0, 19, 20, 23]) assert.equal(systemInfo({ type: t, author: anna, content: 'x' }), null);
  assert.equal(isSystemType(undefined), false);
});

test('Typische Systemnachrichten werden verständlich (auch ohne Text von Discord)', () => {
  const t = (type, extra = {}) => systemInfo({ type, author: anna, content: '', ...extra }).text;
  assert.match(t(7), /Anna ist dem Server beigetreten/);
  assert.match(t(6), /Anna hat eine Nachricht angeheftet/);
  assert.match(t(8), /Anna hat den Server geboostet/);
  assert.match(t(8, { content: '3' }), /3× geboostet/);
  assert.match(t(10), /Stufe 2/);
  assert.match(t(18, { content: 'Ideen' }), /Thread „Ideen“ gestartet/);
  assert.match(t(24), /AutoMod/);
  assert.match(t(1, { mentions: { users: [{ name: 'Bernd' }] } }), /Anna hat Bernd hinzugefügt/);
  assert.match(t(999), /Systemnachricht/); // unbekannter, neuer Typ → trotzdem kein leerer Eintrag
});

test('Umfrage-Ergebnis: Frage und Gewinner aus den Discord-Feldern', () => {
  const embeds = [{ fields: [
    { name: 'poll_question_text', value: 'Pizza?' },
    { name: 'victor_answer_text', value: 'Ja' },
    { name: 'victor_answer_votes', value: '3' },
    { name: 'total_votes', value: '4' },
  ] }];
  assert.equal(systemInfo({ type: 46, author: anna, embeds }).text, 'Umfrage „Pizza?“ ist beendet – Gewinner: Ja (3 Stimmen).');
  assert.match(systemInfo({ type: 46, author: anna, embeds: [{ fields: [{ name: 'poll_question_text', value: 'Pizza?' }] }] }).text, /ohne Gewinner/);
});

test('Serialisierung + Chat-Vorschau: Beitritt erscheint als Satz, nicht leer', async () => {
  const { service, world } = await readyService();
  const ch = world.channels.allgemein;
  const user = world.makeUser('555555555555555555', 'anna');
  const join = makeMessage({ id: '1000000000000000001', channel: ch, author: user, content: '', type: 7 });
  ch.store.push(join);
  ch.lastMessageId = join.id;
  const s = service.serializeMessage(join);
  assert.equal(s.type, 7);
  assert.equal(s.system, true);
  const previews = await service.getPreviews({ guildId: world.guild.id });
  assert.match(previews[ch.id].text, /👋 anna ist dem Server beigetreten/);
  assert.equal(previews[ch.id].system, true);
});

test('Gruppierung: Systemnachricht trennt Nachrichten desselben Autors', () => {
  const base = { author: { id: '1' }, createdTimestamp: 1000 };
  const rows = buildRows([
    { ...base, id: 'a' },
    { ...base, id: 'b', system: true, type: 7, createdTimestamp: 2000 },
    { ...base, id: 'c', createdTimestamp: 3000 },
  ]).filter((r) => r.kind === 'message');
  assert.deepEqual(rows.map((r) => r.grouped), [false, false, false]);
});

test('Chat-Vorschau: Umfrage und Embed ohne Text zeigen Frage bzw. Titel statt „…“', async () => {
  const { service, world } = await readyService();
  const ch = world.channels.allgemein;
  const poll = makeMessage({ id: '1000000000000000002', channel: ch, author: world.client.user, content: '' });
  poll.poll = { question: { text: 'Pizza heute?' }, answers: new Map() };
  ch.store.push(poll);
  ch.lastMessageId = poll.id;
  assert.equal((await service.getPreviews({ guildId: world.guild.id }))[ch.id].text, '📊 Pizza heute?');
  const emb = makeMessage({ id: '1000000000000000003', channel: ch, author: world.client.user, content: '', embeds: [{ title: 'Release 0.4' }] });
  ch.store.push(emb);
  ch.lastMessageId = emb.id;
  assert.equal((await service.getPreviews({ guildId: world.guild.id }))[ch.id].text, '▤ Release 0.4');
});
