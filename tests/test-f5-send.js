'use strict';

// F5: Senden mit optimistischer Anzeige (Nonce), 2.000-Zeichen-Limit, Gruppierung & deutsche Zeitangaben.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');
const { buildRows } = require('../src/shared/grouping');
const { formatMessageTime, formatDayDivider } = require('../src/shared/format');

const NONE = { users: [], roles: [], everyone: false };

test('Senden: Nonce wird erzwungen, standardmäßig pingt niemand', async () => {
  const { service, world } = await readyService();
  const msg = await service.sendMessage({ channelId: world.channels.allgemein.id, content: 'Hallo Welt', nonce: 'abc123', mentions: NONE });
  const sent = world.channels.allgemein.sent[0];
  assert.equal(sent.content, 'Hallo Welt');
  assert.equal(sent.nonce, 'abc123');
  assert.equal(sent.enforceNonce, true);
  assert.deepEqual(sent.allowedMentions, { parse: [], users: [], roles: [], repliedUser: false });
  assert.equal(msg.nonce, 'abc123', 'Renderer ersetzt die optimistische Nachricht anhand der Nonce');
  assert.equal(msg.isOwn, true);
});

test('Senden ohne Schreibrecht → MISSING_PERMISSION, nichts gesendet', async () => {
  const { service, world } = await readyService();
  await assert.rejects(service.sendMessage({ channelId: world.channels.nurLesen.id, content: 'x', mentions: NONE }), { code: 'MISSING_PERMISSION' });
  assert.equal(world.channels.nurLesen.sent.length, 0);
});

test('Validierung: 2.000 Zeichen ok, 2.001 abgelehnt, leer abgelehnt', () => {
  const base = { channelId: '444444444444444401' };
  assert.equal(validators.sendMessage({ ...base, content: 'a'.repeat(2000) }).content.length, 2000);
  assert.throws(() => validators.sendMessage({ ...base, content: 'a'.repeat(2001) }), /2000 Zeichen/);
  assert.throws(() => validators.sendMessage({ ...base, content: '   \n ' }), /Leere/);
  assert.throws(() => validators.sendMessage({ ...base, content: 42 }), { code: 'VALIDATION' });
  assert.throws(() => validators.sendMessage({ ...base, content: 'x', nonce: '<script>' }), { code: 'VALIDATION' });
});

test('Gruppierung: gleicher Autor < 5 min = gruppiert; > 5 min, neuer Autor oder neuer Tag = neuer Kopf', () => {
  const t0 = new Date(2026, 9, 6, 12, 0, 0).getTime();
  const a = { id: 'a' };
  const b = { id: 'b' };
  const msgs = [
    { id: '1', author: a, createdTimestamp: t0 },
    { id: '2', author: a, createdTimestamp: t0 + 60_000 },
    { id: '3', author: a, createdTimestamp: t0 + 7 * 60_000 },
    { id: '4', author: b, createdTimestamp: t0 + 8 * 60_000 },
    { id: '5', author: b, createdTimestamp: new Date(2026, 9, 7, 0, 1).getTime() },
  ];
  const rows = buildRows(msgs);
  assert.deepEqual(rows.map((r) => (r.kind === 'day' ? 'TAG' : `${r.message.id}:${r.grouped ? 'g' : 'K'}`)), ['TAG', '1:K', '2:g', '3:K', '4:K', 'TAG', '5:K']);
});

test('Zeitangaben auf Deutsch (de-DE)', () => {
  const now = new Date(2026, 9, 6, 15, 0).getTime();
  assert.equal(formatMessageTime(new Date(2026, 9, 6, 14, 3).getTime(), now), 'Heute um 14:03');
  assert.equal(formatMessageTime(new Date(2026, 9, 5, 9, 12).getTime(), now), 'Gestern um 09:12');
  assert.equal(formatMessageTime(new Date(2026, 9, 3, 18, 45).getTime(), now), '03.10.2026 18:45');
  assert.equal(formatDayDivider(new Date(2026, 9, 6).getTime()), 'Dienstag, 6. Oktober 2026');
});
