'use strict';

// KI-Agenten (Beta, Wunsch JoniMoni, Issue #1): Zeitpläne, Anbieter-Formate, Schlüssel-Sicherheit, Ausführung.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');
const { describeError } = require('../src/main/errors');
const { createAiManager, callModel } = require('../src/main/ai');
const { buildHandlers } = require('../src/main/ipc');
const { nextRun, describeSchedule, isValidSchedule } = require('../src/shared/schedule');

// Erfundener Schlüssel, zur Laufzeit zusammengesetzt (sonst meldet der Geheimnis-Scanner einen Fehlalarm)
const KEY = ['sk', 'test', 'nur', 'zum', 'testen'].join('-');

function memStore() {
  const data = {};
  return { get: () => ({ ...data }), set: (k, v) => (data[k] = v), data };
}
function memSecret() {
  let v = null;
  return { has: () => Boolean(v), get: () => v, set: (x) => (v = x), clear: () => (v = null) };
}
function fakeFetch(reply = 'Hallo aus der KI', { status = 200 } = {}) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const json = url.includes('/v1/messages') ? { content: [{ type: 'text', text: reply }] } : { choices: [{ message: { content: reply } }] };
    return { ok: status < 400, status, json: async () => (status < 400 ? json : { error: { message: 'kaputt' } }) };
  };
  f.calls = calls;
  return f;
}

test('Zeitpläne: Intervall mind. 15 Min., täglich zur Uhrzeit an Wochentagen', () => {
  assert.equal(isValidSchedule({ kind: 'interval', minutes: 14 }), false);
  assert.equal(isValidSchedule({ kind: 'interval', minutes: 15 }), true);
  assert.equal(isValidSchedule({ kind: 'daily', time: '24:00', days: [1] }), false);
  assert.equal(isValidSchedule({ kind: 'daily', time: '08:00', days: [] }), false);
  const mo0700 = new Date(2026, 9, 5, 7, 0).getTime(); // Montag
  assert.equal(nextRun({ kind: 'daily', time: '08:00', days: [1] }, mo0700), new Date(2026, 9, 5, 8, 0).getTime());
  assert.equal(nextRun({ kind: 'daily', time: '06:00', days: [1] }, mo0700), new Date(2026, 9, 12, 6, 0).getTime()); // nächster Montag
  assert.equal(nextRun({ kind: 'daily', time: '09:30', days: [3, 5] }, mo0700), new Date(2026, 9, 7, 9, 30).getTime()); // Mittwoch
  assert.equal(nextRun({ kind: 'interval', minutes: 30 }, 1000), 1000 + 30 * 60000);
  assert.equal(describeSchedule({ kind: 'daily', time: '08:00', days: [1, 2, 3, 4, 5] }), 'werktags um 08:00');
  assert.equal(describeSchedule({ kind: 'daily', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6] }), 'täglich um 08:00');
  assert.equal(describeSchedule({ kind: 'interval', minutes: 120 }), 'alle 2 Std.');
});

test('Anbieter-Formate: OpenAI-kompatibel und Anthropic', async () => {
  const f = fakeFetch('Antwort');
  assert.equal(await callModel({ provider: 'openai', baseUrl: 'https://api.example.com/v1/', model: 'm1', key: KEY, system: 'S', user: 'U', fetchImpl: f }), 'Antwort');
  assert.equal(f.calls[0].url, 'https://api.example.com/v1/chat/completions');
  assert.equal(f.calls[0].init.headers.authorization, `Bearer ${KEY}`);
  assert.deepEqual(f.calls[0].body.messages.map((m) => m.role), ['system', 'user']);
  assert.equal(f.calls[0].init.redirect, 'error'); // Schlüssel nie per Weiterleitung an fremde Server
  await callModel({ provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', key: KEY, system: 'S', user: 'U', fetchImpl: f });
  assert.equal(f.calls[1].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(f.calls[1].init.headers['x-api-key'], KEY);
  assert.equal(f.calls[1].body.system, 'S');
  // Lokales Modell ohne Schlüssel: kein Authorization-Header
  await callModel({ provider: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama', key: null, system: 'S', user: 'U', fetchImpl: f });
  assert.equal(f.calls[2].init.headers.authorization, undefined);
});

test('Anbieter-Fehler: verständlich und ohne Schlüssel', async () => {
  for (const [status, re] of [
    [401, /Schlüssel abgelehnt/],
    [404, /nicht gefunden/],
    [429, /bremst/],
    [503, /Probleme/],
  ]) {
    const err = await callModel({ provider: 'openai', baseUrl: 'https://x.example', model: 'm', key: KEY, system: 'S', user: 'U', fetchImpl: fakeFetch('', { status }) }).catch((e) => e);
    assert.match(err.message, re);
    const d = describeError(err);
    assert.equal(d.code, 'AI');
    assert.ok(!JSON.stringify(d).includes(KEY));
  }
  const offline = async () => {
    throw new TypeError('fetch failed');
  };
  await assert.rejects(callModel({ provider: 'openai', baseUrl: 'https://x.example', model: 'm', key: KEY, system: 'S', user: 'U', fetchImpl: offline }), /nicht erreichbar/);
});

test('Validierung: https-Pflicht (außer localhost), Modellname, Schlüssel, Auftrag', () => {
  const ok = { enabled: true, provider: 'openai', model: 'gpt-x' };
  assert.equal(validators.aiConfig({ ...ok, baseUrl: 'https://openrouter.ai/api/v1/' }).baseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(validators.aiConfig({ ...ok, baseUrl: 'http://localhost:11434/v1' }).baseUrl, 'http://localhost:11434/v1');
  assert.throws(() => validators.aiConfig({ ...ok, baseUrl: 'http://evil.example/v1' }), /https/);
  assert.throws(() => validators.aiConfig({ ...ok, baseUrl: 'https://user:pw@x.example' }), /Zugangsdaten/);
  assert.throws(() => validators.aiConfig({ ...ok, baseUrl: 'file:///C:/x' }), /https/);
  assert.throws(() => validators.aiConfig({ ...ok, provider: 'sonstwas', baseUrl: 'https://x.example' }), /Anbieter/);
  assert.throws(() => validators.aiConfig({ ...ok, model: 'a b', baseUrl: 'https://x.example' }), /Modell/);
  assert.throws(() => validators.aiKey({ key: 'kurz' }), /API-Schlüssel/);
  const job = { name: 'Morgengruß', channelId: '444444444444444401', prompt: 'Sag Guten Morgen', schedule: { kind: 'interval', minutes: 10 }, context: false, enabled: true };
  assert.throws(() => validators.aiJob(job), /15 Minuten/);
  assert.throws(() => validators.aiJob({ ...job, schedule: { kind: 'interval', minutes: 60 }, prompt: 'x' }), /3–2000/);
  assert.equal(validators.aiJob({ ...job, schedule: { kind: 'daily', time: '08:00', days: [1, 2] }, extra: 'weg' }).extra, undefined);
});

test('Schlüssel geht nur hinein: Oberfläche bekommt nie den Schlüssel zurück', async () => {
  const store = memStore();
  const ai = createAiManager({ store, secret: memSecret(), service: {}, fetchImpl: fakeFetch() });
  const h = buildHandlers({ service: {}, store, ai });
  const after = await h['pk:ai-set-key']({ key: KEY });
  assert.equal(after.hasKey, true);
  assert.ok(!JSON.stringify(after).includes(KEY));
  assert.ok(!JSON.stringify(await h['pk:ai-get']()).includes(KEY));
  assert.ok(!JSON.stringify(store.data).includes(KEY)); // nicht in settings.json
  assert.equal((await h['pk:ai-clear-key']()).hasKey, false);
});

test('Auftrag ausführen: KI fragen → als Bot posten, niemand wird gepingt', async () => {
  const { service, world } = await readyService();
  const f = fakeFetch('**Guten Morgen!** @everyone');
  const store = memStore();
  const ai = createAiManager({ store, secret: memSecret(), service, fetchImpl: f });
  ai.setConfig({ enabled: true, provider: 'openai', baseUrl: 'https://api.example.com/v1', model: 'm1' });
  const job = ai.saveJob(validators.aiJob({ name: 'Gruß', channelId: world.channels.allgemein.id, channelName: 'allgemein', prompt: 'Sag Guten Morgen', schedule: { kind: 'interval', minutes: 60 }, context: false, enabled: true }));
  const run = await ai.runJob({ id: job.id });
  assert.equal(run.ok, true);
  const sent = world.channels.allgemein.sent.at(-1);
  assert.equal(sent.content, '**Guten Morgen!** @everyone');
  assert.deepEqual(sent.allowedMentions.parse, []); // Text darf @everyone enthalten, pingt aber niemanden
  assert.equal(sent.allowedMentions.users?.length ?? 0, 0);
  assert.match(f.calls[0].body.messages[1].content, /Sag Guten Morgen/);
  assert.ok(!/Letzte Nachrichten/.test(f.calls[0].body.messages[1].content)); // ohne Erlaubnis kein Chatverlauf
  assert.equal(ai.getConfig().jobs[0].lastRun.ok, true);
});

test('Kontext nur mit Erlaubnis; Fehler werden am Auftrag vermerkt', async () => {
  const { service, world } = await readyService();
  const ch = world.channels.allgemein;
  ch.store.push(world.makeMessage({ id: '1000000000000000001', channel: ch, author: world.makeUser('555555555555555555', 'anna'), content: 'Treffen um 19 Uhr?' }));
  const f = fakeFetch('Ja!');
  const ai = createAiManager({ store: memStore(), secret: memSecret(), service, fetchImpl: f });
  ai.setConfig({ enabled: true, provider: 'openai', baseUrl: 'https://api.example.com/v1', model: 'm1' });
  const job = ai.saveJob(validators.aiJob({ name: 'Antwort', channelId: ch.id, prompt: 'Fasse zusammen', schedule: { kind: 'interval', minutes: 60 }, context: true, enabled: true }));
  await ai.runJob({ id: job.id });
  assert.match(f.calls[0].body.messages[1].content, /anna: Treffen um 19 Uhr\?/);
  // Ziel ohne Schreibrecht → Fehler wird vermerkt
  const bad = ai.saveJob(validators.aiJob({ name: 'Lesen', channelId: world.channels.nurLesen.id, prompt: 'Sag Hallo', schedule: { kind: 'interval', minutes: 60 }, context: false, enabled: true }));
  await assert.rejects(ai.runJob({ id: bad.id }), { code: 'MISSING_PERMISSION' });
  assert.equal(ai.getConfig().jobs.find((j) => j.id === bad.id).lastRun.ok, false);
});

test('Zeitplaner: nur wenn Beta an, nur fällige + aktive, verpasste Termine nicht nachholen', async () => {
  const { service, world } = await readyService();
  let t = new Date(2026, 9, 5, 7, 0).getTime();
  const ai = createAiManager({ store: memStore(), secret: memSecret(), service, fetchImpl: fakeFetch('Tick'), now: () => t });
  const mk = (name, enabled) => ai.saveJob(validators.aiJob({ name, channelId: world.channels.allgemein.id, prompt: 'Sag etwas', schedule: { kind: 'interval', minutes: 15 }, context: false, enabled }));
  ai.setConfig({ enabled: false, provider: 'openai', baseUrl: 'https://api.example.com/v1', model: 'm1' });
  mk('an', true);
  mk('aus', false);
  t += 16 * 60000;
  assert.deepEqual(await ai.tick(), []); // Beta aus → nichts passiert
  ai.setConfig({ enabled: true, provider: 'openai', baseUrl: 'https://api.example.com/v1', model: 'm1' }); // plant ab jetzt neu
  assert.deepEqual(await ai.tick(), []);
  t += 15 * 60000;
  const done = await ai.tick();
  assert.equal(done.length, 1);
  assert.equal(world.channels.allgemein.sent.length, 1);
  assert.deepEqual(await ai.tick(), []); // direkt danach nicht nochmal
  ai.stop();
});

test('Regression: eigener Hinweis bei Eingabefehlern kommt in der Oberfläche an', () => {
  const e = Object.assign(new Error('Discord hat den Namen abgelehnt.'), { code: 'VALIDATION', hint: 'max. 2× pro Stunde' });
  assert.equal(describeError(e).hint, 'max. 2× pro Stunde');
});
