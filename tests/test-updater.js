'use strict';

// Auto-Update: Feed-URL, Abschaltbedingungen, Zustandsmaschine, Neustart nur wenn Update bereit.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdater, parseRepo, feedUrl } = require('../src/main/updater');

function fakeAutoUpdater() {
  const au = new EventEmitter();
  au.calls = [];
  au.setFeedURL = (o) => au.calls.push(['setFeedURL', o.url]);
  au.checkForUpdates = () => au.calls.push(['check']);
  au.quitAndInstall = () => au.calls.push(['quitAndInstall']);
  return au;
}

function make(over = {}) {
  const au = fakeAutoUpdater();
  const events = [];
  const scheduled = [];
  const u = createUpdater({
    autoUpdater: au,
    isPackaged: true,
    version: '0.1.0',
    repo: 'pmorn/pkmessenger',
    emit: (t, p) => events.push({ t, p }),
    platform: 'win32',
    arch: 'x64',
    argv: [],
    schedule: (fn, ms) => scheduled.push(ms),
    ...over,
  });
  return { u, au, events, scheduled };
}

test('Repo-Angabe wird aus allen üblichen Formaten gelesen', () => {
  assert.equal(parseRepo('github:pmorn/pkmessenger'), 'pmorn/pkmessenger');
  assert.equal(parseRepo('pmorn/pkmessenger'), 'pmorn/pkmessenger');
  assert.equal(parseRepo({ type: 'git', url: 'https://github.com/pmorn/pkmessenger.git' }), 'pmorn/pkmessenger');
  assert.equal(parseRepo('git@github.com:pmorn/pkmessenger.git'), 'pmorn/pkmessenger');
  assert.equal(parseRepo('github:DEIN-GITHUB-NAME/pkmessenger'), null, 'Platzhalter zählt nicht');
  assert.equal(parseRepo(undefined), null);
});

test('Feed-URL entspricht dem Squirrel-Format von update.electronjs.org', () => {
  assert.equal(feedUrl('pmorn/pkmessenger', 'win32', 'x64', '0.1.0'), 'https://update.electronjs.org/pmorn/pkmessenger/win32-x64/0.1.0');
});

test('In der Entwicklung / ohne Repo: abgeschaltet mit deutscher Begründung, kein Netzwerkzugriff', () => {
  const dev = make({ isPackaged: false });
  assert.equal(dev.u.start().state, 'disabled');
  assert.match(dev.u.getState().reason, /npm run update/);
  assert.deepEqual(dev.au.calls, []);
  const noRepo = make({ repo: null });
  noRepo.u.start();
  assert.match(noRepo.u.getState().reason, /GitHub-Repo/);
  assert.deepEqual(noRepo.au.calls, []);
});

test('Start: Feed setzen, sofort prüfen, alle 6 Stunden erneut', () => {
  const { u, au, scheduled } = make();
  u.start();
  assert.deepEqual(au.calls, [['setFeedURL', 'https://update.electronjs.org/pmorn/pkmessenger/win32-x64/0.1.0'], ['check']]);
  assert.deepEqual(scheduled, [6 * 60 * 60 * 1000]);
});

test('Erster Start nach Installation (--squirrel-firstrun): keine Sofort-Prüfung', () => {
  const { u, au } = make({ argv: ['PKMessenger.exe', '--squirrel-firstrun'] });
  u.start();
  assert.deepEqual(au.calls.map((c) => c[0]), ['setFeedURL']);
});

test('Ablauf: prüfen → laden → bereit → Neustart; ohne Update kein Neustart', () => {
  const { u, au, events } = make();
  u.start();
  assert.equal(u.install(), false, 'kein Neustart ohne fertiges Update');
  au.emit('checking-for-update');
  au.emit('update-available');
  assert.equal(u.check().state, 'downloading', 'während des Ladens keine Doppelprüfung');
  au.emit('update-downloaded', {}, 'Notizen', 'v0.2.0');
  assert.equal(u.getState().state, 'ready');
  assert.equal(u.getState().newVersion, 'v0.2.0');
  assert.equal(u.install(), true);
  assert.deepEqual(au.calls.at(-1), ['quitAndInstall']);
  assert.deepEqual(events.map((e) => e.p.state), ['checking', 'downloading', 'ready']);
});

test('Fehler (z. B. offline) → deutscher Hinweis statt Absturz', () => {
  const { u, au } = make();
  u.start();
  au.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'));
  assert.equal(u.getState().state, 'error');
  assert.match(u.getState().error.message, /fehlgeschlagen/);
  au.emit('update-not-available');
  assert.equal(u.getState().state, 'current');
});
