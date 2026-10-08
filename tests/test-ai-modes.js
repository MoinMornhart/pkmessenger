'use strict';

// KI-Modi (Wunsch MoinMornhart 08.10.2026): mehrere unabhängige Persönlichkeiten/Modelle, Admins wechseln im Chat
// mit „modus Name“ – sofort, ohne KI-Anfrage. Andere dürfen nicht. Antworten pro Stunde einstellbar.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, BOT_ID } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');
const { createAiManager } = require('../src/main/ai');

const ALLG = '444444444444444401';
const ADMIN = '555555555555555501';
const GAST = '555555555555555502';
const MODES = [
  { id: 'mode-rainer', name: 'Rainer', instructions: 'Antworte wie Rainer.', model: 'modell-rainer' },
  { id: 'mode-japan', name: 'Japan', instructions: 'Antworte auf Japanisch.', model: '' },
];

async function setup(responder = {}) {
  const { service, world } = await readyService();
  service.isServerAdmin = async ({ userId }) => userId === ADMIN; // Admin-Recht simuliert
  const data = {};
  const store = { get: () => ({ ...data }), set: (k, v) => (data[k] = v) };
  let key = null;
  const secret = { has: () => Boolean(key), get: () => key, set: (v) => (key = v), clear: () => (key = null) };
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Antwort' } }] }) };
  };
  let t = 1_000_000;
  const ai = createAiManager({ store, secret, service, fetchImpl, emit: () => {}, now: () => (t += 20000) });
  ai.setConfig({ enabled: true, provider: 'openai', baseUrl: 'https://api.example.com/v1', model: 'standard-modell' });
  ai.setResponder(validators.aiResponder({ enabled: true, channelIds: [ALLG], dms: false, allowUsers: [], blockUsers: [], instructions: '', context: false, notify: false, modes: MODES, ...responder }));
  let n = 0;
  const msg = (content, author = ADMIN) => ({
    id: String(2000000000000000000n + BigInt(++n)),
    channelId: ALLG,
    guildId: world.guild.id,
    content,
    author: { id: author, name: author === ADMIN ? 'Anna' : 'Gast', bot: false },
    mentions: { users: content.includes(BOT_ID) ? [{ id: BOT_ID, name: 'PKBot' }] : [], roles: [], channels: [], everyone: false },
    toBot: content.includes(BOT_ID),
    isOwn: false,
    system: false,
  });
  const sent = () => world.channels.allgemein.sent.map((s) => s.content);
  return { ai, calls, msg, sent, world };
}

test('Admin schreibt „modus Rainer“ → sofort aktiv, ohne KI-Anfrage; nächste Antwort mit Modus-Anweisung + eigenem Modell', async () => {
  const { ai, calls, msg, sent, world } = await setup();
  assert.deepEqual(await ai.onMessage(msg('modus Rainer')), { mode: true });
  assert.equal(calls.length, 0);
  assert.match(sent().at(-1), /Modus „Rainer“ ist jetzt aktiv/);
  assert.equal(ai.getConfig().responder.activeModes[world.guild.id], 'mode-rainer');
  await ai.onMessage(msg(`<@${BOT_ID}> Hallo?`));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'modell-rainer');
  assert.match(calls[0].messages[0].content, /Active mode "Rainer".*Antworte wie Rainer/);
  // Groß/klein egal, Ausrufezeichen erlaubt; Modus ohne eigenes Modell → Standardmodell
  await ai.onMessage(msg('!MODUS japan'));
  await ai.onMessage(msg(`<@${BOT_ID}> Und jetzt?`));
  assert.equal(calls[1].model, 'standard-modell');
  assert.match(calls[1].messages[0].content, /Japanisch/);
  // zurück
  await ai.onMessage(msg('modus standard'));
  assert.equal(ai.getConfig().responder.activeModes[world.guild.id], undefined);
  assert.match(sent().at(-1), /Standard-Modus/);
});

test('Nicht-Admin darf nicht wechseln; „modus“ allein listet; unbekannter Modus wird erklärt', async () => {
  const { ai, msg, sent, world } = await setup();
  await ai.onMessage(msg('modus Rainer', GAST));
  assert.match(sent().at(-1), /nur Admins/);
  assert.equal(ai.getConfig().responder.activeModes[world.guild.id], undefined);
  await ai.onMessage(msg('modus'));
  assert.match(sent().at(-1), /Modi: „Rainer“, „Japan“\. Aktiv: Standard/);
  await ai.onMessage(msg('modus Pirat'));
  assert.match(sent().at(-1), /gibt es nicht/);
});

test('Eingetragene Personen dürfen auch ohne Admin-Recht wechseln', async () => {
  const { ai, msg, world } = await setup({ modeUsers: [{ id: GAST, name: 'Gast' }] });
  await ai.onMessage(msg('modus Japan', GAST));
  assert.equal(ai.getConfig().responder.activeModes[world.guild.id], 'mode-japan');
});

test('Ohne Modi oder in fremden Kanälen ist „modus …“ ein ganz normaler Text', async () => {
  const { ai, msg, sent } = await setup({ modes: [] });
  const res = await ai.onMessage(msg('modus Rainer'));
  assert.notEqual(res.mode, true);
  assert.equal(sent().length, 0);
});

test('Eingaben werden geprüft; Antworten pro Stunde einstellbar (0 = unbegrenzt)', () => {
  const base = { enabled: true, channelIds: [], dms: false, allowUsers: [], blockUsers: [], instructions: '', context: false, notify: false };
  assert.throws(() => validators.aiResponder({ ...base, modes: [{ id: 'mode-a', name: 'standard', instructions: '' }] }), /reserviert/);
  assert.throws(() => validators.aiResponder({ ...base, modes: [{ id: 'mode-a', name: 'A', instructions: '' }, { id: 'mode-b', name: 'a', instructions: '' }] }), /gibt es schon/);
  assert.throws(() => validators.aiResponder({ ...base, modes: [{ id: 'mode-a', name: '<script>', instructions: '' }] }), /Modus-Name/);
  assert.throws(() => validators.aiResponder({ ...base, replyLimit: 1000 }), /0 \(unbegrenzt\)/);
  const ok = validators.aiResponder({ ...base, modes: MODES, activeModes: { '222222222222222222': 'mode-japan', kaputt: 'mode-japan', '333333333333333333': 'gibtsnicht' }, replyLimit: 0 });
  assert.deepEqual(ok.activeModes, { '222222222222222222': 'mode-japan' });
  assert.equal(ok.replyLimit, 0);
});
