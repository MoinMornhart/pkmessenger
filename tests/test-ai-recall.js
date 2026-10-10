'use strict';

// vibeworks #218 / #124: „@Leon hat mal gesagt …“ – die KI darf Erinnerungen anderer nachschlagen,
// aber nur Gespräche von DEMSELBEN Server, nie aus Privatchats oder anderen Servern.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemory } = require('../src/main/ai-memory');
const { createAiManager } = require('../src/main/ai');
const { validators } = require('../src/main/validate');

const G1 = '100000000000000001';
const G2 = '100000000000000002';
const CH = '300000000000000001';
const BOT = '900000000000000001';
const LEON = '500000000000000002';
const ANNA = '500000000000000001';

function vault() {
  let raw = null;
  return { get: () => raw, set: (v) => (raw = v), clear: () => (raw = null) };
}

function filledMemory() {
  const mem = createMemory({ vault: vault() });
  mem.remember(LEON, 'Leon', 'Auf dem Server: ich spiele gern Minecraft', 'Cool!', { guildId: G1 });
  mem.remember(LEON, 'Leon', 'Privat: mein Passwort-Hinweis ist Hund', 'Okay', { guildId: null });
  mem.remember(LEON, 'Leon', 'Anderer Server: ich mag Katzen', 'Schön', { guildId: G2 });
  return mem;
}

test('Gedächtnis merkt sich den Ort; fremde Erinnerungen nur vom selben Server, nie aus Privatchats', () => {
  const mem = filledMemory();
  const hit = mem.recall('leon', { guildId: G1 });
  assert.equal(hit.length, 1);
  const text = hit[0].turns.map((t) => t.text).join('\n');
  assert.match(text, /Minecraft/);
  assert.doesNotMatch(text, /Passwort|Katzen/);
  assert.deepEqual(mem.recall('Leon', { guildId: null }), []); // im Privatchat: gar nichts von anderen
  assert.deepEqual(mem.recall('Leon', { guildId: G1, excludeUserId: LEON }), []);
  // angepingte Person: nur Server-Wortwechsel, keine Zusammenfassung
  mem.setSummary(LEON, 'Leon hat privat Geheimnisse erzählt');
  const other = mem.context(LEON, { guildId: G1, own: false });
  assert.match(other, /Minecraft/);
  assert.doesNotMatch(other, /Passwort|Katzen|Geheimnisse/);
  assert.equal(mem.context(LEON, { guildId: null, own: false }), '');
  // eigene Erinnerung: im Privatchat alles, auf einem Server keine Privatchat-Wortwechsel
  assert.match(mem.context(LEON), /Passwort/);
  assert.doesNotMatch(mem.context(LEON, { guildId: G1 }), /Passwort|Katzen/);
});

function setup(steps) {
  const data = {};
  const store = { get: () => ({ ...data }), set: (k, v) => (data[k] = v) };
  const bodies = [];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => steps[Math.min(bodies.length - 1, steps.length - 1)] };
  };
  const sent = [];
  const service = { getStatus: () => ({ bot: { id: BOT, displayName: 'PK' } }), sendTyping: async () => {}, sendMessage: async (p) => sent.push(p), getMessages: async () => ({ messages: [] }) };
  const memory = filledMemory();
  const ai = createAiManager({ store, secret: { has: () => false, get: () => null }, service, fetchImpl, memory });
  ai.setConfig({ enabled: true, provider: 'openai', baseUrl: 'http://localhost:1234/v1', model: 'm' });
  ai.setResponder(validators.aiResponder({ enabled: true, channelIds: [CH], dms: true, allowUsers: [], blockUsers: [], instructions: '', context: false, notify: false, memory: true }));
  const msg = (over = {}) => ({ id: String(Math.random()), channelId: CH, guildId: G1, toBot: true, content: 'Was hat Leon mal gesagt?', author: { id: ANNA, name: 'Anna', bot: false }, mentions: { users: [] }, attachments: [], ...over });
  return { ai, bodies, msg, sent, memory };
}

const oaCall = (name, args) => ({ choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] });
const oaText = (content) => ({ choices: [{ message: { content } }] });

test('Server: KI ruft recall_memory auf und bekommt nur Leons Gespräche von diesem Server', async () => {
  const { ai, bodies, msg, sent, memory } = setup([oaCall('recall_memory', { name: 'Leon' }), oaText('Leon spielt gern Minecraft.')]);
  await ai.onMessage(msg());
  assert.ok(bodies[0].tools.some((t) => t.function.name === 'recall_memory'));
  assert.ok(!bodies[0].tools.some((t) => t.function.name === 'web_search')); // Websuche ist aus
  const result = bodies[1].messages.at(-1).content;
  assert.match(result, /<memory about="Leon">[\s\S]*Minecraft/);
  assert.doesNotMatch(result, /Passwort|Katzen/);
  assert.match(sent[0].content, /Minecraft/);
  assert.equal(ai.getConfig().toolLog[0].tool, 'recall_memory');
  // der neue Wortwechsel merkt sich den Server
  assert.match(memory.context(ANNA, { guildId: G1, own: false }), /Was hat Leon/);
  assert.equal(memory.context(ANNA, { guildId: G2, own: false }), '');
});

test('Privatchat: kein recall_memory-Werkzeug und keine Erinnerungen angepingter Personen', async () => {
  const { ai, bodies, msg } = setup([oaText('Weiß ich nicht.')]);
  await ai.onMessage(msg({ guildId: null, channelId: '300000000000000009', toBot: undefined, mentions: { users: [{ id: LEON, name: 'Leon' }] } }));
  assert.equal(bodies[0].tools, undefined);
  assert.doesNotMatch(JSON.stringify(bodies[0].messages), /Minecraft|Passwort|Katzen/);
});

test('Server mit Ping: angepingte Person nur mit Gesprächen von diesem Server', async () => {
  const { ai, bodies, msg } = setup([oaText('Ok')]);
  await ai.onMessage(msg({ content: 'Kennst du ihn?', mentions: { users: [{ id: LEON, name: 'Leon' }] } }));
  const all = JSON.stringify(bodies[0].messages);
  assert.match(all, /Minecraft/);
  assert.doesNotMatch(all, /Passwort|Katzen/);
});
