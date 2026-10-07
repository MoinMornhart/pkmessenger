'use strict';

// Issue #1: GIFs/Videos laden – nur über Discords Proxy; Link-Warnung
const test = require('node:test');
const assert = require('node:assert/strict');
const { isDiscordMedia, attachmentKind, embedMedia, describeLink } = require('../src/shared/media');

test('Nur Discord-Server/Proxys sind erlaubt', () => {
  assert.ok(isDiscordMedia('https://cdn.discordapp.com/attachments/1/2/a.gif'));
  assert.ok(isDiscordMedia('https://media.discordapp.net/attachments/1/2/a.mp4'));
  assert.ok(isDiscordMedia('https://images-ext-1.discordapp.net/external/abc/https/media.tenor.com/x.mp4'));
  assert.ok(!isDiscordMedia('https://media.tenor.com/x.mp4'));
  assert.ok(!isDiscordMedia('http://cdn.discordapp.com/a.png'));
  assert.ok(!isDiscordMedia('https://evil.com/?x=discordapp.net/'));
  assert.ok(!isDiscordMedia('https://discordapp.net.evil.com/a.png'));
});

test('Anhänge: Bild, GIF, Video, sonst Datei', () => {
  const u = 'https://cdn.discordapp.com/attachments/1/2/';
  assert.equal(attachmentKind({ url: `${u}a.png`, contentType: 'image/png' }), 'image');
  assert.equal(attachmentKind({ url: `${u}a.gif`, contentType: 'image/gif' }), 'gif');
  assert.equal(attachmentKind({ url: `${u}a.mp4`, contentType: 'video/mp4' }), 'video');
  assert.equal(attachmentKind({ url: `${u}a.mkv`, contentType: 'video/x-matroska' }), null);
  assert.equal(attachmentKind({ url: `${u}a.zip`, contentType: 'application/zip' }), null);
  assert.equal(attachmentKind({ url: 'https://evil.com/a.png', contentType: 'image/png' }), null);
});

test('Embeds: Tenor-GIF als „gifv“-Video über den Proxy, nie die Original-Adresse', () => {
  const p = 'https://images-ext-1.discordapp.net/external/x/';
  assert.deepEqual(embedMedia({ type: 'gifv', video: `${p}v.mp4`, thumbnail: `${p}t.png` }), { kind: 'gifv', src: `${p}v.mp4`, poster: `${p}t.png` });
  assert.deepEqual(embedMedia({ type: 'video', video: `${p}v.mp4`, thumbnail: null }), { kind: 'video', src: `${p}v.mp4`, poster: null });
  assert.deepEqual(embedMedia({ type: 'image', thumbnail: `${p}b.png` }), { kind: 'image', src: `${p}b.png` });
  assert.equal(embedMedia({ type: 'gifv', video: 'https://media.tenor.com/v.mp4' }), null);
  assert.equal(embedMedia({ type: 'rich', title: 'x' }), null);
});

test('Link-Warnung erkennt verdächtige Ziele', () => {
  assert.deepEqual(describeLink('https://github.com/x'), { host: 'github.com', warnings: [] });
  assert.match(describeLink('http://example.com').warnings.join(), /http/);
  assert.match(describeLink('https://192.168.0.1/login').warnings.join(), /IP-Adresse/);
  assert.match(describeLink('https://xn--dscord-6ua.com/').warnings.join(), /Schriftzeichen/);
  assert.match(describeLink('kein link').warnings.join(), /Ungültig/);
});
