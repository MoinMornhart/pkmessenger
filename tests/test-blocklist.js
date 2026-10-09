'use strict';

// Issue #1 (18:05): Link-Schutz mit öffentlichen, täglich aktualisierten Sperrlisten statt fester Listen
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBlocklist, parse, parseLinkLists, SOURCES } = require('../src/main/blocklist');
const { checkLink } = require('../src/shared/link-safety');

const fakeFetch = (fail = {}) => async (url) => {
  if (fail.all || (fail.txt && url.endsWith('.txt'))) throw new Error('offline');
  return { ok: true, status: 200, text: async () => (url.endsWith('.txt') ? '# Kommentar\nbad-site.example\nWWW.Nitro-Scam.example\n*.wild.example\n' : url.includes('suspicious') ? '{"domains":["odd.example","bad-site.example"]}' : '{"domains":["steam-fake.example","kaputt domain"]}') };
};

test('Formate lesen: Textliste und JSON, sauber normalisiert', () => {
  assert.deepEqual(parse('# x\nA.example\n*.b.example\nwww.c.example.\nkein-punkt\n', 'lines'), ['a.example', 'b.example', 'c.example']);
  assert.deepEqual(parse('{"domains":["X.example","bad domain"]}', 'json'), ['x.example']);
  assert.deepEqual(parse('kein json', 'json'), []);
});

test('Laden, zusammenführen, zwischenspeichern; „gefährlich“ schlägt „verdächtig“', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-bl-'));
  let t = 1_000_000;
  const events = [];
  const bl = createBlocklist({ dir, fetchImpl: fakeFetch(), now: () => t, emit: (type) => events.push(type) });
  const st = await bl.update();
  assert.equal(st.total, 5);
  const g = bl.get();
  assert.ok(g.danger.includes('bad-site.example'));
  assert.ok(!g.warn.includes('bad-site.example'));
  assert.ok(g.warn.includes('odd.example'));
  assert.deepEqual(events, ['blocklist']);
  assert.ok(fs.existsSync(path.join(dir, 'link-blocklist.json')));
  // Neustart: aus dem Zwischenspeicher, kein erneuter Download innerhalb 24 h
  let calls = 0;
  const again = createBlocklist({ dir, fetchImpl: async (...a) => (calls++, fakeFetch()(...a)), now: () => t + 3600_000 });
  assert.equal(again.status().total, 5);
  await again.update();
  assert.equal(calls, 0);
  t += 25 * 3600_000;
  await again.update();
  assert.equal(calls, SOURCES.length); // jede Quelle genau einmal
});

test('Offline: alter Stand bleibt, Fehler wird gemeldet', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-bl-'));
  const bl = createBlocklist({ dir, fetchImpl: fakeFetch(), now: () => 1 });
  await bl.update();
  const off = createBlocklist({ dir, fetchImpl: fakeFetch({ all: true }), now: () => 1 });
  const st = await off.update({ force: true });
  assert.equal(st.total, 5);
  assert.match(st.error, /offline/);
});

test('Link-Prüfung nutzt die Listen (auch Unterdomains)', () => {
  const lists = { danger: new Set(['bad-site.example']), warn: new Set(['odd.example']) };
  assert.equal(checkLink('https://sub.bad-site.example/x', [], lists).level, 'danger');
  assert.equal(checkLink('https://bad-site.example/x', [], lists).listed, true);
  assert.equal(checkLink('https://odd.example/x', [], lists).level, 'warn');
  assert.equal(checkLink('https://harmlos.example/x', [], lists).level, 'ok');
  assert.equal(checkLink('https://bad-site.example/x').level, 'ok'); // ohne Listen nicht bekannt
});

test('#110: Miner-Liste im Hosts-Format wird gelesen', () => {
  assert.deepEqual(parse('# NoCoin\n0.0.0.0 Coinhive.com\n127.0.0.1 ad-miner.com # Kommentar\n\n0.0.0.0 kaputt\n', 'hosts'), ['coinhive.com', 'ad-miner.com']);
});

test('#110: eigene Link-Datenbank – nur bekannte Schlüssel, nur gültige Domains', () => {
  const x = parseLinkLists(JSON.stringify({ shorteners: ['Neu-Kurz.example', 'kaputt domain'], miners: ['m.example'], boese: ['x.example'], trusted: 'kein array' }));
  assert.deepEqual(x, { ipLoggers: [], shorteners: ['neu-kurz.example'], trusted: [], miners: ['m.example'] });
  assert.equal(parseLinkLists('kein json'), null);
  assert.equal(parseLinkLists('[1,2]'), null);
});

test('#110: Miner werden als gefährlich erkannt (Domain, Skript, Liste) und Datenbank-Einträge wirken', () => {
  assert.equal(checkLink('https://coinhive.com/lib/coinhive.min.js').level, 'danger');
  assert.equal(checkLink('https://irgendwas.example/js/cryptonight.wasm').level, 'danger');
  assert.equal(checkLink('https://shop.example/assets/miner.min.js').miner, true);
  const lists = { danger: new Set(), warn: new Set(), miner: new Set(['ad-miner.com']), extra: { ipLoggers: ['neuer-logger.example'], shorteners: ['neu-kurz.example'], trusted: [], miners: ['neuer-miner.example'] } };
  assert.equal(checkLink('https://sub.ad-miner.com/', [], lists).miner, true);
  assert.equal(checkLink('https://neuer-miner.example/', [], lists).level, 'danger');
  assert.equal(checkLink('https://neuer-logger.example/a', [], lists).level, 'danger');
  assert.equal(checkLink('https://neu-kurz.example/x', [], lists).level, 'unknown');
  assert.equal(checkLink('https://github.com/Morni-Team/pkmessenger', [], lists).level, 'trusted'); // normale Seiten unberührt
});

test('#110: Laden übernimmt Miner-Liste und Link-Datenbank', async () => {
  const fetchImpl = async (url) => ({ ok: true, status: 200, text: async () => (url.includes('nocoin') ? '0.0.0.0 miner-a.example\n' : url.includes('link-lists') ? JSON.stringify({ shorteners: ['k.example'] }) : url.endsWith('.txt') ? 'bad.example\n' : '{"domains":[]}') });
  const bl = createBlocklist({ dir: null, fetchImpl, now: () => 5 });
  await bl.update();
  const g = bl.get();
  assert.deepEqual(g.miner, ['miner-a.example']);
  assert.deepEqual(g.extra.shorteners, ['k.example']);
  assert.equal(g.sources.miner.count, 1);
});
