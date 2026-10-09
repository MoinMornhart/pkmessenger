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

// #95: Unknown shortener / IP-logger domains are detected by URL shape, not by a hard-coded list
test('#95: unbekannte Kurz-/Tracking-Links werden an der Form erkannt (ohne Liste)', () => {
  // The exact link from the issue screenshot
  const r = checkLink('https://urlto.me/2pZms');
  assert.equal(r.level, 'warn');
  assert.ok(r.heuristic);
  assert.ok(r.reasons.some((x) => /Zufallscode/.test(x)));
  // Fresh, never-seen domains with an opaque code
  assert.equal(lvl('https://neuer-dienst.xyz/aB3x9'), 'warn');
  assert.equal(lvl('https://example.org/out?url=https%3A%2F%2Fevil.example'), 'warn');
  assert.equal(lvl('https://example.org/go?to=https://evil.example/'), 'warn');
  // Only a weak signal → "unknown" (dialog, but no alarm)
  assert.equal(lvl('https://clickstats.net/about'), 'unknown');
});

test('#95: normale Links bleiben normal (keine Fehlalarme)', () => {
  assert.equal(lvl('https://meine-seite.de/impressum'), 'ok');
  assert.equal(lvl('https://blog.example.com/2024/10/mein-artikel'), 'ok');
  assert.equal(lvl('https://example.com/2024'), 'ok');
  assert.equal(lvl('https://example.com/kontakt'), 'ok');
  // Trusted sites keep their opaque IDs (YouTube, GitHub …)
  assert.equal(lvl('https://youtu.be/dQw4w9WgXcQ'), 'trusted');
  assert.equal(lvl('https://github.com/aB3x9'), 'trusted');
  // A domain the user trusts explicitly is never flagged
  assert.equal(lvl('https://urlto.me/2pZms', ['urlto.me']), 'trusted');
  // Known shorteners keep their existing level
  assert.equal(lvl('https://bit.ly/3xyz'), 'unknown');
});
