'use strict';

// KI-Antwort-Agent (Beta, Wunsch JoniMoni, Issue #1): antwortet als Bot, wenn er erwähnt wird.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, BOT_ID } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');
const { createAiManager } = require('../src/main/ai');

const ALLG = '444444444444444401';

function setup({ responder = {}, reply = 'Klar, gern!' } = {}) {
  return readyService().then(({ service, world }) => {
    const data = {};
    const store = { get: () => ({ ...data }), set: (k, v) => (data[k] = v) };
    let key = null;
    const secret = { has: () => Boolean(key), get: () => key, set: (v) => (key = v), clear: () => (key = null) };
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: reply } }] }) };
    };
    const events = [];
    let t = 1_000_000;
    const ai = createAiManager({ store, secret, service, fetchImpl, emit: (type, p) => events.push({ type, p }), now: () => t });
    ai.setConfig({ enabled: true, provider: 'openai', baseUrl: 'https://api.example.com/v1', model: 'm1' });
    ai.setResponder(
      validators.aiResponder({ enabled: true, channelIds: [ALLG], dms: false, allowUsers: [], blockUsers: [], instructions: 'Sei freundlich.', context: false, notify: true, ...responder }),
    );
    const msg = (over = {}) => ({
      id: String(2000000000000000000n + BigInt(calls.length + events.length)),
      channelId: ALLG,
      guildId: world.guild.id,
      content: `<@${BOT_ID}> Wie spät treffen wir uns?`,
      author: { id: '555555555555555501', name: 'Anna', bot: false },
      mentions: { users: [{ id: BOT_ID, name: 'PKBot' }], roles: [], channels: [], everyone: false },
      isOwn: false,
      system: false,
      ...over,
    });
    return { service, world, ai, calls, events, msg, advance: (ms) => (t += ms) };
  });
}

test('Antwortet bei Erwähnung als Antwort (Reply), pingt niemanden, gibt Hinweis', async () => {
  const { ai, world, calls, events, msg } = await setup();
  const m = msg();
  const res = await ai.onMessage(m);
  assert.equal(res.ok, true);
  const sent = world.channels.allgemein.sent.at(-1);
  assert.equal(sent.content, 'Klar, gern!');
  assert.equal(sent.reply.messageReference, m.id);
  assert.deepEqual(sent.allowedMentions.parse, []);
  assert.equal(sent.allowedMentions.repliedUser, false);
  assert.match(calls[0].messages[0].content, /Sei freundlich/); // Vorgaben des Besitzers
  assert.match(calls[0].messages[1].content, /Anna asks: Wie spät treffen wir uns\?/); // ohne „@PKBot“
  assert.ok(events.some((e) => e.type === 'ai:replied' && e.p.userName === 'Anna'));
  assert.equal(ai.getConfig().recent[0].ok, true);
});

test('Antwortet NICHT: ohne Ping, falscher Kanal, Bots, eigene, System, Beta/Agent aus', async () => {
  const { ai, msg, world } = await setup();
  assert.equal((await ai.onMessage(msg({ mentions: { users: [] } }))).skipped, 'kein-ping');
  assert.equal((await ai.onMessage(msg({ channelId: '444444444444444406' }))).skipped, 'kanal');
  assert.equal((await ai.onMessage(msg({ author: { id: '1', name: 'AndererBot', bot: true } }))).skipped, 'bot');
  assert.equal((await ai.onMessage(msg({ isOwn: true }))).skipped, 'eigene');
  assert.equal((await ai.onMessage(msg({ system: true }))).skipped, 'leer');
  ai.setConfig({ enabled: false, provider: 'openai', baseUrl: 'https://api.example.com/v1', model: 'm1' });
  assert.equal((await ai.onMessage(msg())).skipped, 'aus');
  assert.equal(world.channels.allgemein.sent.length, 0);
});

test('Nur bestimmte Personen / Personen ausschließen', async () => {
  const anna = { id: '555555555555555501', name: 'Anna' };
  const bernd = { id: '555555555555555502', name: 'Bernd' };
  const a = await setup({ responder: { allowUsers: [bernd] } });
  assert.equal((await a.ai.onMessage(a.msg())).skipped, 'nicht-erlaubt');
  const b = await setup({ responder: { blockUsers: [anna] } });
  assert.equal((await b.ai.onMessage(b.msg())).skipped, 'ausgeschlossen');
});

test('Spam-Schutz: Wartezeit pro Kanal und Stundenlimit', async () => {
  const { ai, msg, advance } = await setup();
  assert.equal((await ai.onMessage(msg())).ok, true);
  assert.equal((await ai.onMessage(msg())).queued, true); // #112: Warteschlange statt ignorieren
  advance(16000);
  assert.equal((await ai.onMessage(msg())).ok, true);
  for (let i = 0; i < 40; i++) {
    advance(16000);
    await ai.onMessage(msg());
  }
  advance(16000);
  assert.equal((await ai.onMessage(msg())).skipped, 'stundenlimit');
});

test('Privatchats: nur wenn eingeschaltet, dort ohne Ping', async () => {
  const { ai, msg, world } = await setup({ responder: { dms: true } });
  const anna = world.addMember('555555555555555501', 'Anna');
  const dm = await anna.createDM();
  const res = await ai.onMessage(msg({ channelId: dm.id, guildId: null, mentions: { users: [] }, content: 'Hallo Bot' }));
  assert.equal(res.ok, true);
  assert.equal(dm.sent.at(-1).content, 'Klar, gern!');
  const off = await setup();
  assert.equal((await off.ai.onMessage(off.msg({ channelId: dm.id, guildId: null, mentions: { users: [] } }))).skipped, 'kanal');
});

test('Validierung der Antwort-Einstellungen', () => {
  const ok = { enabled: true, channelIds: [ALLG, ALLG], dms: false, allowUsers: [{ id: '555555555555555501', name: 'Anna' }], blockUsers: [], instructions: ' Hi ', context: false, notify: true };
  const v = validators.aiResponder(ok);
  assert.deepEqual(v.channelIds, [ALLG]); // doppelte entfernt
  assert.equal(v.instructions, 'Hi');
  assert.throws(() => validators.aiResponder({ ...ok, channelIds: ['abc'] }), /Ungültige ID/);
  assert.throws(() => validators.aiResponder({ ...ok, instructions: 'x'.repeat(8001) }), /8000/);
  assert.throws(() => validators.aiResponder({ ...ok, notify: 'ja' }), /notify/);
  assert.throws(() => validators.aiResponder({ ...ok, allowUsers: [{ id: '1', name: 'x' }] }), /Ungültige ID/);
});

test('Hinweis zeigt Antwort ohne Markdown-Zeichen', async () => {
  const { ai, msg, events } = await setup({ reply: 'Heute um **19 Uhr** in der `Lounge`!' });
  await ai.onMessage(msg());
  assert.equal(events.find((e) => e.type === 'ai:replied').p.answer, 'Heute um 19 Uhr in der Lounge!');
});
