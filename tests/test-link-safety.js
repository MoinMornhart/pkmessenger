'use strict';

// Issue #38: IP-Grabber und Betrugs-Links erkennen, vertraute Seiten, alles lokal
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkLink, checkMessageLinks, trustKey } = require('../src/shared/link-safety');

const lvl = (u, extra) => checkLink(u, extra).level;

test('Bekannte IP-Grabber und Logger-Namen → gefährlich', () => {
  assert.equal(lvl('https://grabify.link/ABC123'), 'danger');
  assert.equal(lvl('https://iplogger.org/2abc'), 'danger');
  assert.equal(lvl('https://sub.2no.co/x'), 'danger');
  assert.equal(lvl('https://my-iplogger.xyz/x'), 'danger');
  assert.match(checkLink('https://grabify.link/x').reasons[0], /IP-Adresse/);
});

test('Nachgemachte Marken und Nitro-Betrug → gefährlich', () => {
  assert.equal(lvl('https://dlscord.com/gift/abc'), 'danger');
  assert.equal(lvl('https://discorcl.com/x'), 'danger');
  assert.equal(lvl('https://steamcommunlty.com/trade'), 'danger');
  assert.equal(lvl('https://free-nitro.xyz/claim'), 'danger');
  assert.equal(lvl('https://example.com/discord-nitro-gift'), 'danger');
  assert.equal(lvl('javascript:alert(1)'), 'danger');
});

test('Vertraute Seiten, auch Unterseiten und eigene Liste', () => {
  assert.equal(lvl('https://discord.com/channels/1/2'), 'trusted');
  assert.equal(lvl('https://www.youtube.com/watch?v=x'), 'trusted');
  assert.equal(lvl('https://gist.github.com/x'), 'trusted');
  assert.equal(lvl('https://meine-seite.de/x'), 'ok');
  assert.equal(lvl('https://meine-seite.de/x', ['meine-seite.de']), 'trusted');
  assert.equal(trustKey('WWW.Meine-Seite.de'), 'meine-seite.de');
});

test('Kurzlinks → Ziel unbekannt; http/IP/Punycode/Zugangsdaten → verdächtig', () => {
  assert.equal(lvl('https://bit.ly/3xyz'), 'unknown');
  assert.equal(lvl('http://example.com'), 'warn');
  assert.equal(lvl('https://192.168.0.1/login'), 'warn');
  assert.equal(lvl('https://xn--80ak6aa92e.com/'), 'warn');
  assert.equal(lvl('https://discord.com@evil.example/'), 'warn');
  assert.equal(lvl('https://mydiscordbot.dev'), 'warn'); // enthält „discord“, ist aber nicht die echte Seite
});

test('Nachricht: schlimmster Link zuerst', () => {
  const r = checkMessageLinks('guck https://youtube.com/x und https://grabify.link/abc lol');
  assert.equal(r[0].level, 'danger');
  assert.equal(r[0].host, 'grabify.link');
  assert.equal(r[1].level, 'trusted');
  assert.deepEqual(checkMessageLinks('kein link'), []);
});
