'use strict';

// Umfragen (Wunsch JoniMoni, Issue #1): erstellen, Limits, Stimmen live, eigene Umfrage beenden.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, P, Events, makeMessage } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');

const NONE = { users: [], roles: [], everyone: false };
const POLL = { question: 'Wann treffen wir uns?', answers: ['Freitag', 'Samstag'], durationHours: 24, allowMultiselect: false };

function grant(channel, ...flags) {
  const before = channel.permissionsFor;
  channel.permissionsFor = (me) => ({ has: (f) => flags.includes(f) || before(me).has(f) });
}

test('Umfrage senden: Recht "Umfragen erstellen", Discord-Format, ohne Text erlaubt', async () => {
  const { service, world } = await readyService();
  const ch = world.channels.allgemein;
  const v = validators.sendMessage({ channelId: ch.id, content: '', poll: POLL });
  await assert.rejects(service.sendMessage({ ...v, mentions: NONE }), { code: 'MISSING_PERMISSION' });
  grant(ch, P.SendPolls);
  const msg = await service.sendMessage({ ...v, mentions: NONE });
  assert.deepEqual(ch.sent.at(-1).poll, { question: { text: 'Wann treffen wir uns?' }, answers: [{ text: 'Freitag' }, { text: 'Samstag' }], duration: 24, allowMultiselect: false });
  assert.equal(msg.poll.question, 'Wann treffen wir uns?');
  assert.deepEqual(msg.poll.answers.map((a) => [a.text, a.count]), [['Freitag', 0], ['Samstag', 0]]);
  assert.equal(msg.poll.finalized, false);
});

test('Umfrage-Limits wie bei Discord', () => {
  const base = { channelId: '444444444444444401', content: '' };
  const bad = [
    [{ ...POLL, question: '' }, /1–300/],
    [{ ...POLL, question: 'x'.repeat(301) }, /1–300/],
    [{ ...POLL, answers: [] }, /1–10/],
    [{ ...POLL, answers: Array.from({ length: 11 }, (_, i) => `A${i}`) }, /1–10/],
    [{ ...POLL, answers: ['x'.repeat(56)] }, /1–55/],
    [{ ...POLL, answers: ['Ja', 'ja'] }, /doppelt/],
    [{ ...POLL, durationHours: 0 }, /32 Tagen/],
    [{ ...POLL, durationHours: 769 }, /32 Tagen/],
    [{ ...POLL, durationHours: 1.5 }, /32 Tagen/],
  ];
  for (const [poll, re] of bad) assert.throws(() => validators.sendMessage({ ...base, poll }), re);
  assert.equal(validators.sendMessage({ ...base, poll: { ...POLL, durationHours: 768, allowMultiselect: true } }).poll.allowMultiselect, true);
});

test('Stimmen live: Vote-Event aktualisiert die Ergebnisse in der Oberfläche', async () => {
  const { service, world, events } = await readyService();
  const ch = world.channels.allgemein;
  grant(ch, P.SendPolls);
  const sent = await service.sendMessage({ ...validators.sendMessage({ channelId: ch.id, content: '', poll: POLL }), mentions: NONE });
  const m = ch.store.find((x) => x.id === sent.id);
  const answer = m.poll.answers.get(2);
  answer.voteCount += 1;
  world.client.emit(Events.MessagePollVoteAdd, answer, '555555555555555555');
  await new Promise((r) => setImmediate(r));
  const upd = events.filter((e) => e.type === 'message:update').at(-1);
  assert.deepEqual(upd.payload.poll.answers.map((a) => a.count), [0, 1]);
  assert.equal(upd.payload.poll.total, 1);
  world.client.emit(Events.MessagePollVoteAdd, null, 'x'); // Null-Fall
});

test('Eigene Umfrage beenden; fremde oder ohne Umfrage → Fehler', async () => {
  const { service, world } = await readyService();
  const ch = world.channels.allgemein;
  grant(ch, P.SendPolls);
  const sent = await service.sendMessage({ ...validators.sendMessage({ channelId: ch.id, content: '', poll: POLL }), mentions: NONE });
  const ended = await service.endPoll({ channelId: ch.id, messageId: sent.id });
  assert.equal(ended.poll.finalized, true);
  const foreign = makeMessage({ id: '1000000000000000777', channel: ch, author: world.makeUser('555555555555555555', 'anna'), content: 'x' });
  ch.store.push(foreign);
  await assert.rejects(service.endPoll({ channelId: ch.id, messageId: foreign.id }), { code: 'NOT_FOUND' });
  foreign.poll = { answers: new Map(), end: async () => {} };
  await assert.rejects(service.endPoll({ channelId: ch.id, messageId: foreign.id }), { code: 'MISSING_PERMISSION' });
});
