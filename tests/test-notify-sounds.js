'use strict';

// Benachrichtigungstöne (Issue #12): Filterregeln, Drosselung, Lautstärkegrenzen, gespeicherte Werte.
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyMessage, decideSound, sanitizeSound, DEFAULT_SOUND, COOLDOWN_MS } = require('../src/shared/notify-sounds');

const BOT = '111111111111111111';
const ctx = { botId: BOT, activeChannelId: 'A', windowFocused: true };
const msg = (over = {}) => ({ id: '1', channelId: 'B', guildId: 'G', author: { id: '2' }, isOwn: false, system: false, mentions: { users: [] }, ...over });

test('Ereignisse: Privatchat > Erwähnung > offener/anderer Chat; eigene/System nie', () => {
  assert.equal(classifyMessage(msg({ guildId: null }), ctx), 'dm');
  assert.equal(classifyMessage(msg({ mentions: { users: [{ id: BOT }] } }), ctx), 'mention');
  assert.equal(classifyMessage(msg({ channelId: 'A' }), ctx), 'activeChat');
  assert.equal(classifyMessage(msg({ channelId: 'A' }), { ...ctx, windowFocused: false }), 'otherChat'); // minimiert = „anderer Chat“
  assert.equal(classifyMessage(msg(), ctx), 'otherChat');
  assert.equal(classifyMessage(msg({ isOwn: true }), ctx), null);
  assert.equal(classifyMessage(msg({ author: { id: BOT } }), ctx), null);
  assert.equal(classifyMessage(msg({ system: true }), ctx), null);
});

test('Entscheidung: an/aus, Lautstärke 0, „aus“-Ton, offener Chat ruhig', () => {
  assert.deepEqual(decideSound('otherChat', DEFAULT_SOUND), { event: 'otherChat', preset: 'standard' });
  assert.deepEqual(decideSound('mention', DEFAULT_SOUND), { event: 'mention', preset: 'klar' });
  assert.equal(decideSound('otherChat', { ...DEFAULT_SOUND, enabled: false }), null);
  assert.equal(decideSound('otherChat', { ...DEFAULT_SOUND, volume: 0 }), null);
  assert.equal(decideSound('activeChat', DEFAULT_SOUND), null); // Standard: im offenen Chat still
  const loud = { ...DEFAULT_SOUND, quietInOpenChat: false, events: { ...DEFAULT_SOUND.events, activeChat: { on: true, preset: 'leise' } } };
  assert.deepEqual(decideSound('activeChat', loud), { event: 'activeChat', preset: 'leise' });
  const silentDm = { ...DEFAULT_SOUND, events: { ...DEFAULT_SOUND.events, dm: { on: true, preset: 'aus' } } };
  assert.equal(decideSound('dm', silentDm), null);
  assert.equal(decideSound(null, DEFAULT_SOUND), null);
});

test('Drosselung: höchstens ein Ton pro 1,5 Sekunden', () => {
  assert.equal(decideSound('otherChat', DEFAULT_SOUND, { lastPlayedAt: 1000, now: 1000 + COOLDOWN_MS - 1 }), null);
  assert.ok(decideSound('otherChat', DEFAULT_SOUND, { lastPlayedAt: 1000, now: 1000 + COOLDOWN_MS }));
});

test('Gespeicherte Werte: Grenzen und Unsinn werden abgefangen', () => {
  const s = sanitizeSound({ enabled: 'ja', volume: 7, events: { dm: { on: false, preset: 'laut!' }, mention: 'kaputt' }, quietInOpenChat: false });
  assert.equal(s.enabled, true);
  assert.equal(s.volume, 1);
  assert.deepEqual(s.events.dm, { on: false, preset: 'klar' });
  assert.deepEqual(s.events.mention, DEFAULT_SOUND.events.mention);
  assert.equal(s.quietInOpenChat, false);
  assert.equal(sanitizeSound({ volume: -3 }).volume, 0);
  assert.deepEqual(sanitizeSound(null), sanitizeSound(DEFAULT_SOUND));
});

test('Eigene WAV-Datei: nur echtes WAV bis 2 MiB, bleibt lokal (IPC)', async () => {
  const { validators } = require('../src/main/validate');
  const { buildHandlers } = require('../src/main/ipc');
  const wav = new Uint8Array(64);
  wav.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  wav.set([...'WAVE'].map((c) => c.charCodeAt(0)), 8);
  assert.equal(validators.soundFile({ data: wav }), wav);
  const mp3 = new Uint8Array(64).fill(0xff);
  assert.throws(() => validators.soundFile({ data: mp3 }), /Nur WAV/);
  assert.throws(() => validators.soundFile({ data: new Uint8Array(10) }), /Ungültige/);
  const big = new Uint8Array(2 * 1024 * 1024 + 1);
  big.set(wav.subarray(0, 12));
  assert.throws(() => validators.soundFile({ data: big }), /2 MiB/);
  assert.throws(() => validators.soundFile({ data: 'https://example.com/ton.wav' }), /Ungültige/);
  let saved = null;
  const soundFile = { has: () => Boolean(saved), get: () => saved, set: (d) => (saved = d), clear: () => (saved = null) };
  const h = buildHandlers({ service: {}, store: { get: () => ({}) }, soundFile });
  assert.deepEqual(await h['pk:sound-custom-info'](), { has: false });
  assert.deepEqual(await h['pk:sound-custom-set']({ data: wav }), { has: true });
  assert.equal(await h['pk:sound-custom-get'](), wav);
  await h['pk:sound-custom-clear']();
  assert.equal(await h['pk:sound-custom-get'](), null);
});
