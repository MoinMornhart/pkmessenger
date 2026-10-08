'use strict';

// Anmelden per Link/QR-Code (JoniMoni #77): Token verschlüsselt im Link, Code nur auf dem Bildschirm.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sealToken, openLink, isLoginLink } = require('../src/shared/token-transfer');
const { buildHandlers, wrap } = require('../src/main/ipc');
const { validators } = require('../src/main/validate');

const TOKEN = 'MTAwMDAwMDAwMDAwMDAwMDAx.GxYzAB.abcdefghijklmnopqrstuvwxyz0123456789AB';

test('Link enthält den Token NICHT im Klartext; mit Code wieder lesbar', async () => {
  const { link, code } = await sealToken(TOKEN);
  assert.ok(isLoginLink(link));
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.ok(!link.includes(TOKEN) && !link.includes(TOKEN.split('.')[0]));
  assert.ok(!link.includes(code.replace('-', '')));
  assert.equal(await openLink(link, code), TOKEN);
  assert.equal(await openLink(link, code.toLowerCase().replace('-', ' ')), TOKEN); // Groß/klein, Leerzeichen egal
});

test('Falscher Code oder veränderter Link → verständlicher Fehler', async () => {
  const { link, code } = await sealToken(TOKEN);
  const wrong = code[0] === 'A' ? `B${code.slice(1)}` : `A${code.slice(1)}`;
  await assert.rejects(openLink(link, wrong), /Code passt nicht/);
  const broken = link.slice(0, -3) + (link.endsWith('AAA') ? 'BBB' : 'AAA');
  await assert.rejects(openLink(broken, code), /Code passt nicht/);
  await assert.rejects(openLink('https://example.com/#d=xyz', code), /kein gültiger Anmelde-Link/);
  // jedes Mal neuer Code und neuer Link
  const second = await sealToken(TOKEN);
  assert.notEqual(second.code, code);
  assert.notEqual(second.link, link);
});

test('IPC: Teilen nur mit gespeichertem Token; Import speichert und verbindet', async () => {
  let stored = { status: 'ok', token: TOKEN };
  const saved = [];
  const tokenStore = { load: () => stored, save: (t) => (saved.push(t), { stored: true }), info: () => ({ stored: true }), clear: () => ({}) };
  const service = { connect: async () => ({ state: 'ready' }) };
  const h = buildHandlers({ service, store: { get: () => ({}) }, tokenStore });
  const call = (ch, p) => wrap(h[ch], () => true, ch)({}, p);
  const share = await call('pk:token-share');
  assert.equal(share.ok, true);
  assert.ok(isLoginLink(share.data.link));
  const imp = await call('pk:token-import', { link: share.data.link, code: share.data.code });
  assert.equal(imp.ok, true);
  assert.equal(imp.data.state, 'ready');
  assert.deepEqual(saved, [TOKEN]);
  assert.equal((await call('pk:token-import', { link: share.data.link, code: 'ABCD-2345' })).error.code, 'VALIDATION');
  stored = { status: 'missing' };
  assert.equal((await call('pk:token-share')).ok, false);
  assert.throws(() => validators.tokenImport({ link: 'javascript:alert(1)', code: 'ABCD-2345' }), /kein gültiger Anmelde-Link/);
  assert.throws(() => validators.tokenImport({ link: share.data.link, code: '12' }), /8 Zeichen/);
});
