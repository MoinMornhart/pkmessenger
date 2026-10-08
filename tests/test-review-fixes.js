'use strict';

// Funde aus der Code-Prüfung vom 08.10.2026 (siehe error.md #25)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildHandlers, wrap } = require('../src/main/ipc');
const { validators } = require('../src/main/validate');
const { createVoiceManager } = require('../src/main/voice');
const { createFakeVoiceLib } = require('./helpers/fake-voice');
const { readyService, GUILD_ID } = require('./helpers/fake-discord');

test('Einstellungen an die Oberfläche: ohne App-Sperre- und Fernzugangs-Hash', async () => {
  const data = { appLock: { salt: 's', hash: 'h' }, remote: { salt: 's2', hash: 'h2', enabled: true }, dnd: true };
  const store = { get: () => ({ ...data }), set: () => {} };
  const h = buildHandlers({ service: {}, store });
  const res = await wrap(h['pk:get-settings'], () => true, 'pk:get-settings')({}, undefined);
  assert.equal(res.ok, true);
  assert.equal(res.data.appLock, undefined);
  assert.equal(res.data.remote, undefined);
  assert.equal(res.data.dnd, true);
});

test('Personensuche nur auf einem Server (Neue Gruppe); ohne guildId wie bisher', async () => {
  const { service, world } = await readyService();
  world.addMember('555555555555555501', 'Anna');
  const res = await service.searchPeople(validators.searchPeople({ query: 'Ann', guildId: GUILD_ID }));
  assert.ok(res.some((u) => u.id === '555555555555555501'));
  assert.throws(() => validators.searchPeople({ query: 'a', guildId: 'abc' }));
  await assert.rejects(service.searchPeople(validators.searchPeople({ query: 'a', guildId: '999999999999999999' })), { code: 'NOT_FOUND' });
  assert.deepEqual(validators.searchPeople({ query: ' x ' }), { query: 'x' });
});

test('Sprache: Fehler der Verbindung → sauber aufgelegt, Status „Fehler“ statt hängendem „verbunden“', async () => {
  const lib = createFakeVoiceLib();
  const events = [];
  const vm = createVoiceManager({
    voiceLib: lib,
    getVoiceTarget: () => ({ guild: { voiceAdapterCreator: 'A' }, channel: {}, canSpeak: true, botId: 'BOT', channelName: 'Sprache' }),
    emit: (t, p) => events.push({ t, p }),
    sendAudio: () => {},
    joinTimeoutMs: 50,
  });
  await vm.join({ guildId: GUILD_ID, channelId: '444444444444444405' });
  assert.equal(vm.getState().state, 'connected');
  lib.connections[0].emit('error', new Error('DAVE kaputt'));
  assert.equal(vm.getState().state, 'error');
  assert.match(vm.getState().error.message, /unterbrochen/);
});

test('Sprache: schneller Kanalwechsel → kein falscher Fehler für den alten Kanal', async () => {
  const lib = createFakeVoiceLib({ readyOnJoin: false });
  const vm = createVoiceManager({
    voiceLib: lib,
    getVoiceTarget: ({ channelId }) => ({ guild: { voiceAdapterCreator: 'A' }, channel: {}, canSpeak: true, botId: 'BOT', channelName: channelId }),
    emit: () => {},
    sendAudio: () => {},
    joinTimeoutMs: 60,
  });
  const first = vm.join({ guildId: GUILD_ID, channelId: '444444444444444405' });
  const firstDone = first.catch((e) => e);
  const second = vm.join({ guildId: GUILD_ID, channelId: '444444444444444406' }).catch((e) => e);
  assert.equal((await firstDone).code, 'VOICE_ABORTED');
  await second; // läuft hier in den Timeout (Fake verbindet nie) – entscheidend ist der Zustand danach
  assert.equal(vm.getState().channelId, '444444444444444406');
});

test('Hauptprozess: keine neuen Fenster per Mittelklick; Ursprungsprüfung mit „/“ am Ende', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  assert.match(src, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(src, /RENDERER_URL_PREFIX = `\$\{require\('node:url'\)\.pathToFileURL\(path\.dirname\(RENDERER_HTML\)\)\.toString\(\)\}\/`/);
});
