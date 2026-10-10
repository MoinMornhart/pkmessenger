'use strict';

// vibeworks #218: natives Tool-Calling (OpenAI tool_calls / Anthropic tool_use), unbekanntes Werkzeug → englische
// Fehlermeldung an die KI + neuer Versuch, Rundenlimit, Rückfall aufs Text-Protokoll, Werkzeug-Protokoll.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');
const { createAiManager } = require('../src/main/ai');

async function setup(steps, { provider = 'openai' } = {}) {
  const { service, world } = await readyService();
  const data = {};
  const store = { get: () => ({ ...data }), set: (k, v) => (data[k] = v) };
  let key = 'sk-test';
  const secret = { has: () => true, get: () => key, set: (v) => (key = v), clear() {} };
  const bodies = [];
  const fetchImpl = async (url, init) => {
    const b = JSON.parse(init.body);
    bodies.push(b);
    const step = steps[Math.min(bodies.length - 1, steps.length - 1)];
    return { ok: true, status: 200, json: async () => step };
  };
  const searched = [];
  const searchImpl = async (q) => {
    searched.push(q);
    return { source: 'Test', results: [{ title: 'Treffer', url: 'https://example.org', snippet: 'Ergebnis zu ' + q }] };
  };
  const ai = createAiManager({ store, secret, service, fetchImpl, searchImpl });
  ai.setConfig({ enabled: true, provider, baseUrl: provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.example.com/v1', model: 'm1' });
  const job = validators.aiJob({ name: 'News', channelId: world.channels.allgemein.id, channelName: '#allgemein', prompt: 'Was gibt es Neues?', schedule: { kind: 'interval', minutes: 60 }, context: false, enabled: true, web: true });
  return { ai, bodies, searched, job };
}

// OpenAI-Antworten
const oaCall = (id, name, args) => ({ choices: [{ message: { content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] });
const oaText = (content) => ({ choices: [{ message: { content } }] });

test('OpenAI: KI ruft web_search selbst auf, bekommt das Ergebnis als tool-Nachricht und antwortet', async () => {
  const { ai, bodies, searched, job } = await setup([oaCall('c1', 'web_search', { query: 'news heute' }), oaText('Hier die News (Quelle: example.org)')]);
  const r = await ai.previewJob(job);
  assert.equal(r.text, 'Hier die News (Quelle: example.org)');
  assert.deepEqual(searched, ['news heute']);
  assert.equal(bodies[0].tools[0].function.name, 'web_search');
  assert.equal(bodies[0].tool_choice, 'auto');
  // zweite Anfrage: Verlauf mit assistant(tool_calls) + tool-Ergebnis
  const msgs = bodies[1].messages;
  assert.equal(msgs.at(-2).tool_calls[0].id, 'c1');
  assert.deepEqual([msgs.at(-1).role, msgs.at(-1).tool_call_id], ['tool', 'c1']);
  assert.match(msgs.at(-1).content, /Ergebnis zu news heute/);
  const log = ai.getConfig().toolLog;
  assert.equal(log[0].tool, 'web_search');
  assert.equal(log[0].ok, true);
});

test('Anthropic: tool_use → tool_result im nächsten user-Turn', async () => {
  const steps = [
    { content: [{ type: 'text', text: 'Ich schaue nach.' }, { type: 'tool_use', id: 'tu1', name: 'web_search', input: { query: 'wetter berlin' } }] },
    { content: [{ type: 'text', text: 'Sonnig, 20 Grad.' }] },
  ];
  const { ai, bodies, searched, job } = await setup(steps, { provider: 'anthropic' });
  const r = await ai.previewJob(job);
  assert.equal(r.text, 'Sonnig, 20 Grad.');
  assert.deepEqual(searched, ['wetter berlin']);
  assert.equal(bodies[0].tools[0].name, 'web_search');
  assert.ok(bodies[0].tools[0].input_schema);
  const last = bodies[1].messages.at(-1);
  assert.equal(last.role, 'user');
  assert.deepEqual([last.content[0].type, last.content[0].tool_use_id], ['tool_result', 'tu1']);
});

test('Unbekanntes Werkzeug / leerer Suchbegriff → englische Fehlermeldung an die KI, sie versucht es neu', async () => {
  const { ai, bodies, searched, job } = await setup([oaCall('c1', 'browse_url', { url: 'x' }), oaCall('c2', 'web_search', {}), oaCall('c3', 'web_search', { query: 'richtig' }), oaText('Fertig')]);
  const r = await ai.previewJob(job);
  assert.equal(r.text, 'Fertig');
  assert.match(bodies[1].messages.at(-1).content, /the tool "browse_url" does not exist\. Available tools: web_search/);
  assert.match(bodies[2].messages.at(-1).content, /needs a non-empty "query"/);
  assert.deepEqual(searched, ['richtig']);
  const log = ai.getConfig().toolLog;
  assert.ok(log.some((e) => e.tool === 'browse_url' && e.ok === false));
});

test('Rundenlimit: nach 5 Werkzeug-Runden muss die KI ohne Werkzeuge antworten', async () => {
  const many = Array.from({ length: 5 }, (_, i) => oaCall('c' + i, 'web_search', { query: 'q' + i }));
  const { ai, bodies, searched, job } = await setup([...many, oaText('Endlich die Antwort')]);
  const r = await ai.previewJob(job);
  assert.equal(r.text, 'Endlich die Antwort');
  assert.equal(searched.length, 5);
  assert.equal(bodies.length, 6);
  assert.equal(bodies[5].tools, undefined); // letzte Runde ohne Werkzeuge
  assert.match(bodies[5].messages[0].content, /Do not call tools anymore/);
});

test('Modell ohne Tool-Calling: Rückfall aufs Text-Protokoll, und das wird sich gemerkt', async () => {
  const { service, world } = await readyService();
  const data = {};
  const store = { get: () => ({ ...data }), set: (k, v) => (data[k] = v) };
  const secret = { has: () => false, get: () => null, set() {}, clear() {} };
  const bodies = [];
  const replies = ['Antwort 1', 'Antwort 2'];
  const fetchImpl = async (url, init) => {
    const b = JSON.parse(init.body);
    bodies.push(b);
    if (b.tools) return { ok: false, status: 400, json: async () => ({ error: { message: 'registry.ollama.ai/library/gemma does not support tools' } }) };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: replies.shift() } }] }) };
  };
  const ai = createAiManager({ store, secret, service, fetchImpl, searchImpl: async () => ({ source: 'x', results: [] }) });
  ai.setConfig({ enabled: true, provider: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'gemma' });
  const job = validators.aiJob({ name: 'X', channelId: world.channels.allgemein.id, channelName: '#allgemein', prompt: 'Hallo', schedule: { kind: 'interval', minutes: 60 }, context: false, enabled: true, web: true });
  assert.equal((await ai.previewJob(job)).text, 'Antwort 1');
  assert.equal((await ai.previewJob(job)).text, 'Antwort 2');
  assert.equal(bodies.filter((b) => b.tools).length, 1); // nur EIN Versuch mit Werkzeugen, danach gemerkt
  assert.match(bodies[1].messages[0].content, /SEARCH: <short search query>/);
});

test('Andere Anbieter-Fehler werden NICHT als „kein Tool-Calling" missverstanden', async () => {
  const { service, world } = await readyService();
  const data = {};
  const store = { get: () => ({ ...data }), set: (k, v) => (data[k] = v) };
  const secret = { has: () => true, get: () => 'k', set() {}, clear() {} };
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid api key' } }) });
  const ai = createAiManager({ store, secret, service, fetchImpl, searchImpl: async () => ({ source: 'x', results: [] }) });
  ai.setConfig({ enabled: true, provider: 'openai', baseUrl: 'https://api.example.com/v1', model: 'm' });
  const job = validators.aiJob({ name: 'X', channelId: world.channels.allgemein.id, channelName: '#allgemein', prompt: 'Hallo', schedule: { kind: 'interval', minutes: 60 }, context: false, enabled: true, web: true });
  await assert.rejects(ai.previewJob(job));
});
