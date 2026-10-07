'use strict';

// Issue #1: Fehlerprotokoll (englisch, ohne Geheimnisse), Fehlerbericht, Einrichtungs-Check über die offizielle API
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLogger, buildReport, scrub } = require('../src/main/logger');
const { readyService, FAKE_TOKEN } = require('./helpers/fake-discord');

test('Protokoll macht Geheimnisse unkenntlich', () => {
  const s = scrub(`login failed token=${FAKE_TOKEN} key sk-abcdefghijklmnop Bearer abcdefghijklmnopqrst C:\\Users\\pmorn\\AppData`);
  assert.ok(!s.includes(FAKE_TOKEN));
  assert.ok(!s.includes('sk-abcdefghijklmnop'));
  assert.ok(!s.includes('abcdefghijklmnopqrst'));
  assert.ok(!s.includes('pmorn'));
  assert.match(s, /\[token\]|\[secret\]/);
  assert.ok(scrub('x'.repeat(5000)).length <= 600);
});

test('Protokoll schreibt in Datei, rotiert, merkt sich die letzten Zeilen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-log-'));
  const log = createLogger({ dir });
  log.error('pk:send-message', 'UNKNOWN: boom', 'at foo (bar.js:1)');
  log.warn('discord', 'slow');
  const text = fs.readFileSync(path.join(dir, 'pkmessenger.log'), 'utf8');
  assert.match(text, /ERROR \[pk:send-message\] UNKNOWN: boom \| at foo/);
  assert.equal(log.tail(5).length, 2);
  fs.writeFileSync(path.join(dir, 'pkmessenger.log'), 'x'.repeat(600 * 1024));
  log.info('x', 'nach Rotation');
  assert.ok(fs.existsSync(path.join(dir, 'pkmessenger.log.1')));
  // ohne Ordner (Demo) nur im Speicher, kein Absturz
  assert.match(createLogger({ dir: null }).error('a', 'b'), /ERROR \[a\] b/);
});

test('Fehlerbericht: englisch, mit Version/System/letzten Zeilen, ohne Geheimnisse', () => {
  const r = buildReport({ version: '0.9.7', platform: 'win32', arch: 'x64', electron: '44.5.1', where: 'react: ChatView', error: `TypeError: x is undefined ${FAKE_TOKEN}`, lines: ['line 1', `token=${FAKE_TOKEN}`] });
  assert.match(r, /### PKMessenger error report/);
  assert.match(r, /Version: 0\.9\.7/);
  assert.match(r, /Where: react: ChatView/);
  assert.ok(!r.includes(FAKE_TOKEN));
});

test('Einrichtungs-Check: angemeldet, Server, Kanäle; Presence freiwillig', async () => {
  const { service } = await readyService();
  const res = await service.setupCheck();
  const byId = Object.fromEntries(res.items.map((i) => [i.id, i]));
  assert.equal(byId.token.ok, true);
  assert.equal(byId.content.ok, true);
  assert.equal(byId.presence.optional, true);
  assert.equal(byId.guilds.ok, true);
  assert.ok(res.items.some((i) => i.id.startsWith('guild:') && /Kanälen sichtbar/.test(i.text)));
  assert.match(res.portal, /^https:\/\/discord\.com\/developers\/applications/);
});
