'use strict';

// Issue #1 (Kommentare 14:44–15:38): Rolle/Antwort als Erwähnung, still wenn Chat offen, Protokoll, „PK schreibt“ durchgehend,
// Thinking-Modelle, Auto-Verbindung, LM Studio im Heimnetz
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAiManager, stripThinking, callModel } = require('../src/main/ai');
const { validators } = require('../src/main/validate');

function setup({ reply = 'Klar!', slowMs = 0 } = {}) {
  const data = {};
  const store = { get: () => ({ ...data }), set: (k, v) => (data[k] = v) };
  const secret = { has: () => false, get: () => null, set() {}, clear() {} };
  const sent = [];
  const typing = [];
  const service = {
    getStatus: () => ({ bot: { id: '900000000000000001', displayName: 'PK' } }),
    sendTyping: async (p) => typing.push(p.channelId),
    sendMessage: async (p) => sent.push(p),
    getMessages: async () => ({ messages: [] }),
  };
  const events = [];
  const fetchImpl = async (_u, init) => {
    if (slowMs) await new Promise((r) => setTimeout(r, slowMs));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: typeof reply === 'function' ? reply(JSON.parse(init.body)) : reply } }] }) };
  };
  const ai = createAiManager({ store, secret, service, fetchImpl, emit: (t, p) => events.push({ t, p }) });
  ai.setConfig({ enabled: true, provider: 'openai', baseUrl: 'http://192.168.178.61:1234/v1', model: 'qwen3' });
  ai.setResponder(validators.aiResponder({ enabled: true, channelIds: ['300000000000000001'], dms: true, allowUsers: [], blockUsers: [], instructions: '', context: false, notify: false }));
  const msg = (over = {}) => ({ id: String(Date.now()), channelId: '300000000000000001', guildId: '400000000000000001', content: 'Hallo Bot', author: { id: '500000000000000001', name: 'SimPell', bot: false }, mentions: { users: [], roles: [] }, toBot: true, ...over });
  return { ai, sent, typing, events, msg };
}

test('LM Studio im Heimnetz (http://192.168.…) ist erlaubt, fremde http-Adressen nicht', () => {
  assert.equal(validators.aiConfig({ enabled: true, provider: 'openai', baseUrl: 'http://192.168.178.61:1234/v1', model: 'qwen' }).baseUrl, 'http://192.168.178.61:1234/v1');
  assert.throws(() => validators.aiConfig({ enabled: true, provider: 'openai', baseUrl: 'http://example.com/v1', model: 'qwen' }), /https/);
});

test('Erwähnung über Rolle oder Antwort zählt (toBot), ohne Erwähnung nicht', async () => {
  const { ai, sent, msg } = setup();
  assert.equal((await ai.onMessage(msg({ toBot: false }))).skipped, 'kein-ping');
  const r = await ai.onMessage(msg({ toBot: true }));
  assert.equal(r.ok, true);
  assert.equal(sent.length, 1);
});

test('Hat der Mensch den Chat gerade offen, antwortet die KI dort nicht (abschaltbar)', async () => {
  const { ai, sent, msg } = setup();
  ai.setActiveChat({ channelId: '300000000000000001', focused: true });
  assert.equal((await ai.onMessage(msg())).skipped, 'chat-offen');
  ai.setActiveChat({ channelId: '300000000000000001', focused: false }); // Fenster nicht im Vordergrund → KI darf
  assert.equal((await ai.onMessage(msg({ id: '2' }))).ok, true);
  assert.equal(sent.length, 1);
});

test('Protokoll: warum nicht geantwortet wurde – nur für Nachrichten an den Bot', async () => {
  const { ai, msg } = setup();
  ai.setResponder(validators.aiResponder({ enabled: true, channelIds: [], dms: false, allowUsers: [{ id: '500000000000000009', name: 'Joni' }], blockUsers: [], instructions: '', context: false, notify: false }));
  await ai.onMessage(msg({ toBot: false })); // nicht an den Bot → kein Eintrag
  await ai.onMessage(msg()); // Kanal nicht ausgewählt
  await ai.onMessage(msg({ guildId: null, channelId: '300000000000000002' })); // Privatchat, aber aus
  const skips = ai.getConfig().skips;
  assert.equal(skips.length, 2);
  assert.match(skips[1].text, /Kanal ist nicht ausgewählt/);
  assert.equal(skips[0].userName, 'SimPell');
});

test('„PK schreibt …“ bleibt, solange die KI arbeitet; Hinweis „KI schreibt“ an/aus', async () => {
  const { ai, typing, events, msg } = setup({ slowMs: 50 });
  const p = ai.onMessage(msg());
  await new Promise((r) => setImmediate(r));
  assert.equal(ai.getConfig().busy[0].userName, 'SimPell');
  await p;
  assert.ok(typing.length >= 1);
  assert.deepEqual(
    events.filter((e) => e.t === 'ai:busy').map((e) => e.p.on),
    [true, false],
  );
  assert.equal(ai.getConfig().busy.length, 0);
});

test('Thinking: Gedanken werden entfernt, nur „gedacht“ ohne Antwort gibt einen klaren Hinweis', async () => {
  assert.equal(stripThinking('<think>hmm, also…</think>\nHallo!'), 'Hallo!');
  assert.equal(stripThinking('hmm, ich denke</think>Hallo!'), 'Hallo!');
  assert.equal(stripThinking('Hallo! <think>abgeschnitten'), 'Hallo!');
  const f = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '<think>nur denken …' } }] }) });
  await assert.rejects(callModel({ provider: 'openai', baseUrl: 'http://localhost:1234/v1', model: 'q', system: 'S', user: 'U', fetchImpl: f }), (e) => /nur nachgedacht/.test(e.message) && /Thinking/.test(e.hint));
  // Mit Thinking-Option: mehr Platz für Tokens
  let body;
  const g = async (_u, init) => ((body = JSON.parse(init.body)), { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) });
  await callModel({ provider: 'openai', baseUrl: 'http://localhost:1234/v1', model: 'q', system: 'S', user: 'U', maxTokens: 800, fetchImpl: g, thinking: true });
  assert.equal(body.max_tokens, 4800);
});

test('Auto-Verbindung: Status wird gemerkt (verbunden / Fehler)', async () => {
  const { ai } = setup({ reply: 'OK – Verbindung steht.' });
  ai.setOptions(validators.aiOptions({ autoConnect: true, thinking: true }));
  const cfg = ai.getConfig();
  assert.deepEqual(cfg.options, { thinking: true, autoConnect: true });
  await ai.connect();
  assert.equal(ai.getConfig().conn.ok, true);
  assert.throws(() => validators.aiOptions({ thinking: 'ja' }), /Schalter/);
  assert.deepEqual(validators.activeChat({ channelId: null, focused: false }), { channelId: null, focused: false });
});
