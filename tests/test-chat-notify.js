'use strict';

// JoniMoni #61: Benachrichtigungen pro Chat oder Server (stumm, nur Erwähnungen, eigener Ton).
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeChatNotify, resolveChatNotify, applyChatNotify, classifyMessage, decideSound, DEFAULT_SOUND } = require('../src/shared/notify-sounds');

const CH = '444444444444444401';
const CH2 = '444444444444444402';
const G = '222222222222222222';

test('Gespeicherte Regeln werden geprüft; Standard und Unsinn fallen weg', () => {
  const clean = sanitizeChatNotify({ [CH]: { mode: 'aus' }, [G]: { mode: 'erwaehnungen', preset: 'retro' }, '@dm': { mode: 'alle', preset: 'klar' }, kaputt: { mode: 'aus' }, [CH2]: { mode: 'alle' }, '555555555555555555': { mode: 'quatsch', preset: 'aus' } });
  assert.deepEqual(clean, { [CH]: { mode: 'aus', preset: null }, [G]: { mode: 'erwaehnungen', preset: 'retro' }, '@dm': { mode: 'alle', preset: 'klar' } });
});

test('Chat-Regel schlägt Server-Regel; ohne Regel gilt Standard', () => {
  const map = { [CH]: { mode: 'aus' }, [G]: { mode: 'erwaehnungen' } };
  assert.equal(resolveChatNotify(map, { channelId: CH, guildId: G }).mode, 'aus');
  assert.equal(resolveChatNotify(map, { channelId: CH2, guildId: G }).mode, 'erwaehnungen');
  assert.equal(resolveChatNotify(map, { channelId: CH2, guildId: '333333333333333333' }).mode, 'alle');
  assert.equal(resolveChatNotify({ '@dm': { mode: 'aus' } }, { channelId: CH, guildId: null }).mode, 'aus');
});

test('Stumm → kein Ton; „Nur Erwähnungen“ lässt nur Erwähnungen/Privatchats durch; eigener Ton ersetzt', () => {
  const bot = '100000000000000001';
  const normal = { id: '1', channelId: CH, guildId: G, author: { id: '9' }, mentions: { users: [] } };
  const ping = { ...normal, mentions: { users: [{ id: bot }] } };
  const info = { botId: bot, activeChannelId: null, windowFocused: false };
  assert.deepEqual(applyChatNotify(classifyMessage(normal, info), { mode: 'aus' }), { event: null, preset: null });
  assert.equal(applyChatNotify(classifyMessage(normal, info), { mode: 'erwaehnungen' }).event, null);
  assert.equal(applyChatNotify(classifyMessage(ping, info), { mode: 'erwaehnungen' }).event, 'mention');
  const r = applyChatNotify(classifyMessage(normal, info), { mode: 'alle', preset: 'retro' });
  assert.deepEqual(r, { event: 'otherChat', preset: 'retro' });
  // ohne Ereignis kein Ton
  assert.equal(decideSound(null, DEFAULT_SOUND), null);
});
