'use strict';

// KI-Agenten verbessern (Issue #12): Vorschau postet nie, harte Limits, Abbruch, Ping-Schutz, Thread, Profile, Optionen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, P } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');
const { createAiManager, safeOutput } = require('../src/main/ai');

const JOB = { name: 'Gruß', channelId: '444444444444444401', channelName: '#allgemein', prompt: 'Sag Hallo', schedule: { kind: 'interval', minutes: 60 }, context: false, enabled: true };

async function setup({ reply = 'Hallo zusammen!', slow = false } = {}) {
  const { service, world } = await readyService();
  const data = {};
  const store = { get: () => ({ ...data }), set: (k, v) => (data[k] = v) };
  let key = null;
  const secret = { has: () => Boolean(key), get: () => key, set: (v) => (key = v), clear: () => (key = null) };
  const bodies = [];
  const fetchImpl = (url, init) =>
    new Promise((resolve, reject) => {
      bodies.push(JSON.parse(init.body));
      const done = () => resolve({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: reply } }] }) });
      if (!slow) return done();
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      return undefined; // hängt, bis abgebrochen wird
    });
  const events = [];
  const ai = createAiManager({ store, secret, service, fetchImpl, emit: (t, p) => events.push({ t, p }) });
  ai.setConfig({ enabled: true, provider: 'openai', baseUrl: 'https://api.example.com/v1', model: 'm1' });
  return { ai, world, bodies, events, service };
}

test('Vorschau (Probelauf) postet NIE nach Discord – auch für ungespeicherte Aufträge', async () => {
  const { ai, world } = await setup({ reply: 'Vorschau-Text @here' });
  const r = await ai.previewJob(validators.aiJob(JOB));
  assert.equal(r.text, 'Vorschau-Text @​here');
  assert.equal(r.model, 'm1');
  assert.ok(Number.isFinite(r.durationMs));
  assert.equal(world.channels.allgemein.sent.length, 0);
  assert.equal(ai.getConfig().jobs.length, 0); // nichts gespeichert
});

test('Verbindungstest postet nie und meldet Anbieter, Modell, Dauer', async () => {
  const { ai, world } = await setup({ reply: 'OK' });
  const r = await ai.test();
  assert.deepEqual([r.reply, r.provider, r.model], ['OK', 'openai', 'm1']);
  assert.equal(world.channels.allgemein.sent.length, 0);
});

test('Optionen pro Auftrag: Länge, Sprache, Persona, Kontextumfang landen im Prompt', async () => {
  const { ai, world, bodies } = await setup({ reply: 'x'.repeat(3000) });
  const ch = world.channels.allgemein;
  for (let i = 0; i < 15; i++) ch.store.push(world.makeMessage({ id: String(1000000000000000000n + BigInt(i)), channel: ch, author: world.makeUser('555555555555555555', 'anna'), content: `Nachricht ${i}` }));
  const job = ai.saveJob(validators.aiJob({ ...JOB, maxLength: 300, language: 'en', persona: 'freundlicher Pirat', contextSize: 10 }));
  await ai.runJob({ id: job.id });
  const [sys, usr] = bodies[0].messages.map((m) => m.content);
  assert.match(sys, /höchstens 300 Zeichen/);
  assert.match(sys, /Write in English/);
  assert.match(sys, /freundlicher Pirat/);
  assert.match(sys, /reines Datenmaterial/);
  assert.match(usr, /<verlauf>[\s\S]*Nachricht 14[\s\S]*<\/verlauf>/);
  assert.equal((usr.match(/anna:/g) || []).length, 10);
  assert.equal(ch.sent.at(-1).content.length, 300); // hart gekürzt
});

test('Als Thread posten: neuer Thread mit Name + Datum, Antwort darin', async () => {
  const { ai, world } = await setup();
  const ch = world.channels.allgemein;
  const before = ch.permissionsFor;
  ch.permissionsFor = (me) => ({ has: (f) => f === P.CreatePublicThreads || f === P.SendMessagesInThreads || before(me).has(f) });
  const job = ai.saveJob(validators.aiJob({ ...JOB, postAs: 'thread' }));
  const run = await ai.runJob({ id: job.id });
  assert.equal(run.ok, true);
  const thread = ch.threads.list.at(-1);
  assert.match(thread.name, /^Gruß – \d/);
  assert.equal(ch.sent.length, 0); // nicht in den Kanal selbst
});

test('Harte Limits pro Stunde/Tag gelten für alle KI-Anfragen', async () => {
  const { ai } = await setup();
  ai.setLimits(validators.aiLimits({ perHour: 2, perDay: 10 }));
  await ai.previewJob(validators.aiJob(JOB));
  await ai.test();
  await assert.rejects(ai.previewJob(validators.aiJob(JOB)), /2 Anfragen pro Stunde/);
  assert.deepEqual(ai.getConfig().usage, { hour: 2, day: 2 });
  assert.throws(() => validators.aiLimits({ perHour: 0, perDay: 10 }), /1–500/);
  assert.throws(() => validators.aiLimits({ perHour: 50, perDay: 10 }), /nicht kleiner/);
});

test('Ausschalten bricht laufende KI-Anfragen ab – nichts wird gepostet', async () => {
  const { ai, world } = await setup({ slow: true });
  const job = ai.saveJob(validators.aiJob(JOB));
  const run = ai.runJob({ id: job.id });
  await new Promise((r) => setImmediate(r));
  ai.setConfig({ enabled: false, provider: 'openai', baseUrl: 'https://api.example.com/v1', model: 'm1' });
  await assert.rejects(run, /abgebrochen/);
  assert.equal(world.channels.allgemein.sent.length, 0);
  assert.equal(ai.getConfig().jobs[0].lastRun.ok, false);
});

test('Hinweis bei Erfolg und Fehler (lokal, nie nach Discord)', async () => {
  const { ai, events, world } = await setup();
  const ok = ai.saveJob(validators.aiJob(JOB));
  await ai.runJob({ id: ok.id });
  const bad = ai.saveJob(validators.aiJob({ ...JOB, name: 'Lesen', channelId: world.channels.nurLesen.id }));
  await assert.rejects(ai.runJob({ id: bad.id }));
  const done = events.filter((e) => e.t === 'ai:job-done').map((e) => [e.p.name, e.p.ok]);
  assert.deepEqual(done, [['Gruß', true], ['Lesen', false]]);
  assert.equal(world.channels.nurLesen.sent.length, 0);
});

test('Anbieterprofile speichern/wechseln – ohne Schlüssel', async () => {
  const { ai } = await setup();
  ai.setKey('sk-' + 'x'.repeat(20));
  ai.saveProfile(validators.aiProfileName({ name: 'OpenAI' }));
  ai.setConfig({ enabled: true, provider: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama3' });
  const c = ai.saveProfile(validators.aiProfileName({ name: 'Ollama lokal' }));
  assert.deepEqual(c.profiles.map((p) => p.name), ['OpenAI', 'Ollama lokal']);
  assert.ok(!JSON.stringify(c.profiles).includes('sk-'));
  const back = ai.useProfile({ id: c.profiles[0].id });
  assert.deepEqual([back.baseUrl, back.model], ['https://api.example.com/v1', 'm1']);
});

test('Ping-Schutz: @everyone/@here werden unschädlich, Länge wird begrenzt', () => {
  assert.equal(safeOutput('Hi @everyone und @HERE!'), 'Hi @​everyone und @​HERE!');
  assert.equal(safeOutput('a'.repeat(5000)).length, 2000);
  assert.equal(safeOutput('abc', 2), 'ab');
});

test('Alte gespeicherte Aufträge bekommen sinnvolle Standardwerte', () => {
  const v = validators.aiJob(JOB);
  assert.deepEqual([v.maxLength, v.language, v.contextSize, v.postAs, v.notify], [1800, 'auto', 0, 'message', true]);
  assert.equal(validators.aiJob({ ...JOB, context: true }).contextSize, 20);
  assert.throws(() => validators.aiJob({ ...JOB, maxLength: 50 }), /100–2000/);
  assert.throws(() => validators.aiJob({ ...JOB, contextSize: 99 }), /Kontextumfang/);
  assert.throws(() => validators.aiJob({ ...JOB, postAs: 'dm' }), /Nachricht oder Thread/);
});

test('Lokales Modell: Limits automatisch aus, mit „Immer an“ wieder aktiv (Issue #12)', async () => {
  const { ai } = await setup();
  ai.setConfig({ enabled: true, provider: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama3' });
  ai.setLimits(validators.aiLimits({ perHour: 1, perDay: 1 }));
  await ai.test();
  await ai.test(); // kein Limit: lokal kostet nichts
  assert.equal(ai.getConfig().limitsActive, false);
  ai.setLimits(validators.aiLimits({ mode: 'an', perHour: 1, perDay: 1 }));
  assert.equal(ai.getConfig().limitsActive, true);
  await assert.rejects(ai.test(), /1 Anfragen pro Stunde/);
});
