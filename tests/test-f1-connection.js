'use strict';

// F1: .env laden, Token-Prüfung, Verbinden/Trennen/Reconnect, deutsche Fehlermeldungen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadToken, isPlausibleBotToken, botIdFromToken, ensureEnvFile } = require('../src/main/env');
const { describeError } = require('../src/main/errors');
const { createTestService, tmpEnv, FAKE_TOKEN, BOT_ID, Events } = require('./helpers/fake-discord');

test('.env: fehlende Datei → missing-file', () => {
  assert.equal(loadToken(tmpEnv(null)).status, 'missing-file');
});

test('.env: leerer Token / Platzhalter → missing-token', () => {
  assert.equal(loadToken(tmpEnv('DISCORD_TOKEN=\n')).status, 'missing-token');
  assert.equal(loadToken(tmpEnv('DISCORD_TOKEN=dein_token_hier\n')).status, 'missing-token');
  assert.equal(loadToken(tmpEnv('ANDERES=1\n')).status, 'missing-token');
});

test('.env: Unsinn als Token → invalid-format', () => {
  assert.equal(loadToken(tmpEnv('DISCORD_TOKEN=hallo123\n')).status, 'invalid-format');
  assert.equal(loadToken(tmpEnv('DISCORD_TOKEN=a.b.c\n')).status, 'invalid-format');
});

test('.env: gültiges Format, auch mit BOM, Anführungszeichen und "Bot "-Präfix', () => {
  assert.deepEqual(loadToken(tmpEnv(`DISCORD_TOKEN=${FAKE_TOKEN}\n`)), { status: 'ok', token: FAKE_TOKEN });
  assert.equal(loadToken(tmpEnv(`﻿DISCORD_TOKEN="${FAKE_TOKEN}"\r\n`)).token, FAKE_TOKEN);
  assert.equal(loadToken(tmpEnv(`DISCORD_TOKEN=Bot ${FAKE_TOKEN}\n`)).token, FAKE_TOKEN);
});

test('Token: Bot-ID aus Teil 1 und Plausibilitätsprüfung', () => {
  assert.equal(botIdFromToken(FAKE_TOKEN), BOT_ID);
  assert.equal(isPlausibleBotToken(FAKE_TOKEN), true);
  assert.equal(isPlausibleBotToken(''), false);
  assert.equal(isPlausibleBotToken(null), false);
});

test('.env-Vorlage wird angelegt, bestehende Datei NIE überschrieben', () => {
  const p = tmpEnv(null);
  assert.equal(ensureEnvFile(p), true);
  assert.match(fs.readFileSync(p, 'utf8'), /DISCORD_TOKEN=\n/);
  fs.writeFileSync(p, `DISCORD_TOKEN=${FAKE_TOKEN}\n`);
  assert.equal(ensureEnvFile(p), false);
  assert.match(fs.readFileSync(p, 'utf8'), new RegExp(FAKE_TOKEN));
});

test('Connect ohne Token → Setup-Bildschirm statt Absturz, kein Login-Versuch', async () => {
  const { service, world } = createTestService({ envContent: 'DISCORD_TOKEN=\n' });
  const st = await service.connect();
  assert.equal(st.state, 'setup');
  assert.equal(st.reason, 'missing-token');
  assert.equal(world.client.loginCalls.length, 0);
});

test('Connect erfolgreich → ready mit Bot-Infos, Token geht nur an login()', async () => {
  const { service, world, events } = createTestService();
  const st = await service.connect();
  assert.equal(st.state, 'ready');
  assert.equal(st.bot.id, BOT_ID);
  assert.deepEqual(world.client.loginCalls, [FAKE_TOKEN]);
  assert.deepEqual(events.map((e) => e.payload.state), ['connecting', 'ready']);
  // Der Token taucht in KEINEM Event an den Renderer auf.
  assert.equal(JSON.stringify(events).includes(FAKE_TOKEN), false);
});

test('Ungültiger Token (401) → Setup + deutsche Meldung mit Lösung', async () => {
  const { service, world } = createTestService({ loginBehavior: 'invalid-token' });
  const st = await service.connect();
  assert.equal(st.state, 'setup');
  assert.equal(st.error.code, 'TOKEN_INVALID');
  assert.match(st.error.message, /Token abgelehnt/);
  assert.match(st.error.hint, /Reset Token/);
  assert.equal(world.client.destroyed, true);
});

test('Message Content Intent nicht aktiviert (Close 4014) → klare Fehlermeldung statt Hängen', async () => {
  const { service } = createTestService({ loginBehavior: 'disallowed-intents' });
  const st = await service.connect();
  assert.equal(st.state, 'error');
  assert.equal(st.error.code, 'DISALLOWED_INTENTS');
  assert.match(st.error.hint, /Message Content Intent/);
});

test('Discord antwortet nicht → Timeout-Fehler', async () => {
  const { service } = createTestService({ loginBehavior: 'hang', loginTimeoutMs: 50 });
  const st = await service.connect();
  assert.equal(st.error.code, 'LOGIN_TIMEOUT');
});

test('Gleichzeitige connect()-Aufrufe teilen sich EINEN Login', async () => {
  const { service, world } = createTestService();
  const [a, b] = await Promise.all([service.connect(), service.connect()]);
  assert.equal(a.state, 'ready');
  assert.equal(b.state, 'ready');
  assert.equal(world.client.loginCalls.length, 1);
});

test('Reconnect-Zyklus: reconnecting → ready; Disconnect → disconnected', async () => {
  const { service, world } = createTestService();
  await service.connect();
  world.client.emit(Events.ShardReconnecting, 0);
  assert.equal(service.getStatus().state, 'reconnecting');
  world.client.emit(Events.ShardResume, 0, 0);
  assert.equal(service.getStatus().state, 'ready');
  const st = await service.disconnect();
  assert.equal(st.state, 'disconnected');
  assert.equal(world.client.destroyed, true);
  assert.throws(() => service.listGuilds(), { code: 'NOT_READY' });
});

test('Fehlerübersetzung: Netzwerk, Rate-Limit, Discord-API-Codes, Unbekanntes', () => {
  assert.equal(describeError({ code: 'ENOTFOUND' }).code, 'NETWORK');
  assert.equal(describeError({ cause: { code: 'ECONNRESET' } }).code, 'NETWORK');
  assert.equal(describeError({ status: 429 }).code, 'RATE_LIMIT');
  assert.equal(describeError({ code: 50013 }).code, 'API_50013');
  assert.match(describeError({ code: 50001 }).hint, /Kanal ansehen/);
  const unknown = describeError(new Error('kaputt'));
  assert.equal(unknown.code, 'UNKNOWN');
  assert.ok(unknown.hint.length > 0);
});
