'use strict';

// Issue #29/#1: Windows Hello zum Entsperren, „Was ist neu?“ (Releases + Commits)
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppLock } = require('../src/main/app-lock');
const { createHello, SCRIPTS } = require('../src/main/hello');
const { createUpdater, releaseNotes, commitList } = require('../src/main/updater');
const { validators } = require('../src/main/validate');

const memStore = () => {
  const data = {};
  return { get: () => ({ ...data }), set: (k, v) => (data[k] = v), data };
};

test('Windows Hello: nur mit App-Passwort, entsperrt nur bei „Verified“ von Windows', async () => {
  const store = memStore();
  const lock = createAppLock({ store });
  assert.throws(() => lock.setHello({ on: true }), /Erst ein App-Passwort/);
  lock.set({ password: 'geheim123' });
  lock.setHello({ on: true });
  assert.equal(lock.status().hello, true);
  lock.lock();
  await assert.rejects(lock.verifyHello({ verify: async () => false }), /nicht bestätigt/);
  assert.equal(lock.isLocked(), true);
  await lock.verifyHello({ verify: async () => true });
  assert.equal(lock.isLocked(), false);
  // Passwort ändern behält Hello; Passwort geht weiterhin
  lock.set({ password: 'neu12345', current: 'geheim123' });
  assert.equal(lock.status().hello, true);
  lock.setHello({ on: false });
  lock.lock();
  await assert.rejects(lock.verifyHello({ verify: async () => true }), /nicht eingeschaltet/);
  lock.verify('neu12345');
  assert.equal(lock.isLocked(), false);
});

test('Windows Hello: festes Skript ohne Nutzereingaben, nur „Verified“ zählt, nicht unter anderen Systemen', async () => {
  assert.ok(!/\$\{|\$args/.test(SCRIPTS.verify));
  assert.match(SCRIPTS.verify, /RequestVerificationAsync\('PKMessenger entsperren'\)/);
  const calls = [];
  const h = createHello({ platform: 'win32', run: async (s) => (calls.push(s), s.includes('RequestVerification') ? 'Verified' : 'Available') });
  assert.equal(await h.availability(), 'Available');
  assert.equal(await h.verify(), true);
  const h2 = createHello({ platform: 'win32', run: async () => 'Canceled' });
  assert.equal(await h2.verify(), false);
  const h3 = createHello({ platform: 'linux', run: async () => 'Verified' });
  assert.equal(await h3.verify(), false);
  assert.equal(await h3.availability(), 'NotSupported');
  assert.deepEqual(validators.lockHello({ on: true }), { on: true });
  assert.throws(() => validators.backgroundSet({ on: 'ja' }), /Schalter/);
});

test('Release-Notizen und Commits werden lesbar', () => {
  const body = "## What's Changed\n* Befehle reparieren by @MoinMornhart in https://github.com/x/y/pull/31\n* Profile by @MoinMornhart in https://github.com/x/y/pull/32\n\n**Full Changelog**: https://github.com/x/y/compare/v0.8.1...v0.8.3";
  assert.deepEqual(releaseNotes(body), ['Befehle reparieren (#31)', 'Profile (#32)']);
  const commits = commitList([
    { sha: 'aaaaaaaaaa', commit: { message: 'Erster Commit\n\nDetails', author: { name: 'A', date: '2026-10-07T10:00:00Z' } } },
    { sha: 'bbbbbbbbbb', commit: { message: 'Merge pull request #32 from x/y\n\nProfile anklicken', author: { name: 'B', date: '2026-10-07T11:00:00Z' } } },
  ]);
  assert.deepEqual(
    commits.map((c) => [c.sha, c.title, c.merge]),
    [
      ['bbbbbbb', 'Profile anklicken (#32)', true],
      ['aaaaaaa', 'Erster Commit', false],
    ],
  );
});

test('„Was ist neu?“: Releases + Änderungen seit der eigenen Version, nur GitHub-Links', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.includes('/releases?'))
      return {
        ok: true,
        json: async () => [
          { tag_name: 'v0.2.0', name: 'v0.2.0', published_at: '2026-10-07T12:00:00Z', body: '* Neu by @a in https://github.com/p/k/pull/5', html_url: 'https://github.com/p/k/releases/tag/v0.2.0', assets: [{ name: 'PKMessenger-Setup.exe', browser_download_url: 'https://github.com/p/k/releases/download/v0.2.0/PKMessenger-Setup.exe' }] },
          { tag_name: 'v0.1.0', name: 'v0.1.0', published_at: '2026-10-06T12:00:00Z', body: '', html_url: 'https://evil.example/x', assets: [] },
          { tag_name: 'nightly', draft: false },
        ],
      };
    if (url.includes('/compare/')) return { ok: true, json: async () => ({ commits: [{ sha: '1234567890', commit: { message: 'Fix', author: { name: 'A', date: '2026-10-07T11:00:00Z' } } }] }) };
    return { ok: false, status: 404 };
  };
  const u = createUpdater({ autoUpdater: { on() {}, setFeedURL() {}, checkForUpdates() {} }, isPackaged: true, version: '0.1.0', repo: 'p/k', emit() {}, platform: 'win32', fetchImpl });
  const r = await u.changes();
  assert.equal(r.latest, '0.2.0');
  assert.equal(r.newer, true);
  assert.equal(r.releases.length, 2);
  assert.equal(r.releases[0].setupUrl, 'https://github.com/p/k/releases/download/v0.2.0/PKMessenger-Setup.exe');
  assert.equal(r.releases[1].url, null); // fremde Links werden verworfen
  assert.deepEqual(r.releases[0].notes, ['Neu (#5)']);
  assert.equal(r.commits[0].title, 'Fix');
  assert.ok(urls.some((x) => x.endsWith('/compare/v0.1.0...v0.2.0')));
  const offline = createUpdater({ autoUpdater: { on() {} }, isPackaged: true, version: '0.1.0', repo: 'p/k', emit() {}, platform: 'win32', fetchImpl: async () => Promise.reject(new Error('x')) });
  await assert.rejects(offline.changes(), /nicht erreichbar/);
});
