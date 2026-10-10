'use strict';

// #131: Bot-Module (Vorbild Moin_Julia) – Auto-Antworten, Zählen, Level. Pro Server an/aus, ab Werk aus.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBotModules, levelOf } = require('../src/main/bot-modules');
const { buildHandlers } = require('../src/main/ipc');

const G = '100000000000000001';
const CH = '300000000000000001';
const COUNT = '300000000000000002';

function setup() {
  const data = {};
  const store = { get: () => ({ ...data }), set: (k, v) => (data[k] = v) };
  const sent = [];
  const reactions = [];
  const service = {
    sendMessage: async (p) => (sent.push(p), { id: 'x' }),
    react: async (p) => reactions.push(p.emoji),
  };
  let t = 1_000_000;
  const mods = createBotModules({ store, service, now: () => t });
  let n = 0;
  const msg = (content, over = {}) => ({ id: String(900000000000000000 + (n += 1)), guildId: G, channelId: CH, content, author: { id: '500000000000000001', name: 'Anna', bot: false }, isOwn: false, ...over });
  return { mods, sent, reactions, data, msg, tick: (ms) => (t += ms) };
}

test('Ab Werk ist jedes Modul aus – der Bot reagiert auf nichts', async () => {
  const { mods, sent, msg } = setup();
  assert.ok(mods.list({ guildId: G }).every((m) => m.enabled === false));
  await mods.onMessage(msg('!rang'));
  assert.equal(sent.length, 0);
});

test('Auto-Antworten: genau / enthält, ohne Pings, mit Abklingzeit', async () => {
  const { mods, sent, msg, tick } = setup();
  mods.set({ guildId: G, moduleId: 'autoreply', enabled: true, config: { rules: [{ trigger: '!regeln', reply: 'Seid nett @everyone', match: 'genau' }, { trigger: 'hilfe', reply: 'Schreib ins #support', match: 'enthaelt' }] } });
  await mods.onMessage(msg('!REGELN'));
  await mods.onMessage(msg('!regeln')); // Abklingzeit
  await mods.onMessage(msg('ich brauche Hilfe bitte'));
  await mods.onMessage(msg('!regeln bitte')); // „genau“ passt nicht
  assert.deepEqual(sent.map((s) => s.content), ['Seid nett @everyone', 'Schreib ins #support']);
  assert.deepEqual(sent[0].mentions, { users: [], roles: [], everyone: false });
  tick(11000);
  await mods.onMessage(msg('!regeln'));
  assert.equal(sent.length, 3);
  // nie auf Bots oder sich selbst
  await mods.onMessage(msg('!regeln', { author: { id: '2', name: 'Bot', bot: true } }));
  await mods.onMessage(msg('hilfe', { isOwn: true }));
  assert.equal(sent.length, 3);
});

test('Zählen: richtig → ✅, zweimal hintereinander oder falsch → ❌ und von vorn', async () => {
  const { mods, sent, reactions, msg } = setup();
  mods.set({ guildId: G, moduleId: 'counting', enabled: true, config: { channelId: COUNT } });
  const c = (content, user = '500000000000000001') => msg(content, { channelId: COUNT, author: { id: user, name: `U${user.slice(-1)}`, bot: false } });
  await mods.onMessage(c('1', '500000000000000001'));
  await mods.onMessage(c('2', '500000000000000002'));
  await mods.onMessage(c('wer ist dran?', '500000000000000003')); // Reden ist erlaubt
  await mods.onMessage(c('3', '500000000000000002')); // zweimal hintereinander
  assert.deepEqual(reactions, ['✅', '✅', '❌']);
  assert.match(sent[0].content, /zweimal hintereinander.*\*\*1\*\*.*Rekord: 2/);
  await mods.onMessage(c('5', '500000000000000001'));
  assert.match(sent[1].content, /verzählt \(richtig wäre 1\)/);
  assert.equal(mods.list({ guildId: G }).find((m) => m.id === 'counting').info.best, 2);
  // anderer Kanal zählt nicht
  await mods.onMessage(msg('1'));
  assert.equal(reactions.length, 4);
});

test('Level: Punkte höchstens 1× pro Minute, Level-Aufstieg, !rang und !top', async () => {
  const { mods, sent, msg, tick } = setup();
  mods.set({ guildId: G, moduleId: 'levels', enabled: true, config: { announce: true } });
  assert.equal(levelOf(0), 0);
  assert.equal(levelOf(100), 1);
  assert.equal(levelOf(300), 2);
  for (let i = 0; i < 5; i += 1) {
    await mods.onMessage(msg(`Nachricht ${i}`));
    await mods.onMessage(msg('Spam'));
    tick(61000);
  }
  assert.ok(sent.some((s) => /Anna ist jetzt \*\*Level 1\*\*/.test(s.content)));
  await mods.onMessage(msg('!rang'));
  assert.match(sent.at(-1).content, /Level \*\*1\*\* · 100 Punkte · Platz 1/);
  await mods.onMessage(msg('!top'));
  assert.match(sent.at(-1).content, /1\. Anna – Level 1 \(100\)/);
});

test('Eigenes Antwort-Limit pro Server (kein Zuspammen)', async () => {
  const { mods, sent, msg } = setup();
  mods.set({ guildId: G, moduleId: 'levels', enabled: true, config: { announce: false } });
  for (let i = 0; i < 40; i += 1) await mods.onMessage(msg('!top'));
  assert.equal(sent.length, 20);
});

test('IPC: Eingaben werden geprüft', async () => {
  const { mods } = setup();
  const h = buildHandlers({ botModules: mods, store: { get: () => ({}) } });
  assert.throws(() => h['pk:modules-set']({ guildId: 'x', moduleId: 'levels', enabled: true }), /Server/);
  assert.throws(() => h['pk:modules-set']({ guildId: G, moduleId: 'hack', enabled: true }), /Unbekanntes Modul/);
  assert.throws(() => h['pk:modules-set']({ guildId: G, moduleId: 'levels', enabled: 'ja' }), /Schalter/);
  assert.throws(() => h['pk:modules-set']({ guildId: G, moduleId: 'counting', enabled: true, config: { channelId: '../x' } }), /Kanal/);
  assert.throws(() => h['pk:modules-set']({ guildId: G, moduleId: 'autoreply', enabled: true, config: { rules: [{ trigger: '', reply: 'x' }] } }), /Stichwort/);
  assert.throws(() => h['pk:modules-set']({ guildId: G, moduleId: 'autoreply', enabled: true, config: { rules: Array.from({ length: 51 }, () => ({ trigger: 'a', reply: 'b' })) } }), /50/);
  assert.equal(h['pk:modules-list']({ guildId: G }).length, 3);
});
