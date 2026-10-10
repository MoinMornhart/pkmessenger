'use strict';

// #112: Warteschlange für Erwähnungen, neuer Versuch bei leerer Antwort, Gedächtnis weiterer Erwähnter, längere Anweisungen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, BOT_ID } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');
const { createAiManager } = require('../src/main/ai');

const ALLG = '444444444444444401';

function setup({ replies = ['Antwort'], responder = {}, memory = null } = {}) {
  return readyService().then(({ service, world }) => {
    const data = {};
    const store = { get: () => ({ ...data }), set: (k, v) => (data[k] = v) };
    let key = null;
    const secret = { has: () => Boolean(key), get: () => key, set: (v) => (key = v), clear: () => (key = null) };
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(JSON.parse(init.body));
      const content = replies[Math.min(calls.length - 1, replies.length - 1)];
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
    };
    const timers = [];
    let t = 1_000_000;
    const ai = createAiManager({
      store,
      secret,
      service,
      fetchImpl,
      now: () => t,
      memory,
      setTimeoutImpl: (fn, ms) => {
        const x = { fn, ms, unref() {} };
        timers.push(x);
        return x;
      },
    });
    ai.setConfig({ enabled: true, provider: 'openai', baseUrl: 'https://api.example.com/v1', model: 'm1' });
    ai.setResponder(validators.aiResponder({ enabled: true, channelIds: [ALLG], dms: false, allowUsers: [], blockUsers: [], instructions: '', context: false, notify: false, ...responder }));
    let n = 0;
    const msg = (over = {}) => ({
      id: String(3000000000000000000n + BigInt(++n)),
      channelId: ALLG,
      guildId: world.guild.id,
      content: `<@${BOT_ID}> Frage ${n}`,
      author: { id: '555555555555555501', name: 'Anna', bot: false },
      mentions: { users: [{ id: BOT_ID, name: 'PKBot' }], roles: [], channels: [], everyone: false },
      isOwn: false,
      system: false,
      ...over,
    });
    const sent = () => world.channels.allgemein.sent;
    return { ai, calls, timers, msg, sent, advance: (ms) => (t += ms) };
  });
}

test('Erwähnungen während der Wartezeit landen in der Warteschlange und werden nacheinander beantwortet', async () => {
  const { ai, timers, msg, sent, advance } = await setup();
  assert.equal((await ai.onMessage(msg())).ok, true);
  const q1 = await ai.onMessage(msg());
  const q2 = await ai.onMessage(msg());
  assert.deepEqual([q1.queued, q1.position, q2.position], [true, 1, 2]);
  assert.equal(timers.length, 1); // ein Timer pro Kanal
  assert.ok(timers[0].ms >= 15000 - 1000 && timers[0].ms <= 15000 + 5000); // Rest-Wartezeit (+ Pause je weiterer Nachricht)
  advance(16000);
  await timers[0].fn();
  assert.equal(sent().length, 2);
  // nächster Timer wurde geplant, die Pause wächst nicht ins Unendliche
  assert.equal(timers.length, 2);
  advance(16000);
  await timers[1].fn();
  assert.equal(sent().length, 3);
});

test('Warteschlange ist begrenzt (5 pro Kanal) – danach „Warteschlange voll"', async () => {
  const { ai, msg } = await setup();
  await ai.onMessage(msg());
  for (let i = 0; i < 5; i++) assert.equal((await ai.onMessage(msg())).queued, true);
  assert.equal((await ai.onMessage(msg())).skipped, 'warteschlange-voll');
});

test('Leere Antwort (z. B. nur Gedanken) → ein neuer Versuch; zweimal leer → Fehler statt leerer Nachricht', async () => {
  const a = await setup({ replies: ['<think>hmm…</think>', 'Jetzt richtig!'] });
  const r = await a.ai.onMessage(a.msg());
  assert.equal(r.ok, true);
  assert.equal(a.calls.length, 2);
  assert.match(a.calls[1].messages.at(-1).content, /previous answer was empty/);
  assert.equal(a.sent().at(-1).content, 'Jetzt richtig!');
  const b = await setup({ replies: ['<think>…</think>', '   '] });
  const r2 = await b.ai.onMessage(b.msg());
  assert.equal(r2.ok, false);
  assert.match(r2.answer, /zweimal leer/);
  assert.equal(b.sent().length, 0);
});

test('Weitere angepingte Personen: deren Gedächtnis kommt als Kontext dazu (nur mit Gedächtnis an)', async () => {
  const memory = {
    context: (id) => (id === '555555555555555502' ? 'Bernd mag Pizza.' : ''),
    remember() {},
    compact: async () => ({}),
  };
  const { ai, calls, msg } = await setup({ memory, responder: { memory: true, memoryAuto: false } });
  await ai.onMessage(msg({ mentions: { users: [{ id: BOT_ID, name: 'PKBot' }, { id: '555555555555555502', name: 'Bernd' }], roles: [], channels: [], everyone: false } }));
  const userMsg = calls[0].messages.at(-1).content;
  assert.match(userMsg, /Earlier conversation with Bernd \(also mentioned\):\nBernd mag Pizza\./);
});

test('Anweisungen und Modus-Anweisungen bis 8000 Zeichen', () => {
  const base = { enabled: true, channelIds: [], dms: false, allowUsers: [], blockUsers: [], context: false, notify: false };
  assert.equal(validators.aiResponder({ ...base, instructions: 'x'.repeat(8000) }).instructions.length, 8000);
  assert.throws(() => validators.aiResponder({ ...base, instructions: 'x'.repeat(8001) }), /8000/);
  assert.throws(() => validators.aiResponder({ ...base, instructions: '', modes: [{ id: 'mode-a', name: 'A', instructions: 'x'.repeat(8001) }] }), /8000/);
});
