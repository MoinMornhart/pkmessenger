'use strict';

// Android-App (Issue #56): Build-Ergebnis und Sicherheitseinstellungen prüfen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'mobile', 'www');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

// Bauen braucht die Android-Pakete (npm ci --prefix mobile); ohne sie (z. B. im Windows-Release-Lauf) wird der Bau-Test übersprungen
const mobileInstalled = fs.existsSync(path.join(ROOT, 'mobile', 'node_modules', '@capacitor', 'core'));

test('Release-Build: alle API-Funktionen aus preload.js, kein Demo-/Testcode, kein Node', { skip: !mobileInstalled && 'Android-Pakete nicht installiert' }, () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-mobile.js')], { encoding: 'utf8' });
  const preloadNames = [...read('src', 'preload', 'preload.js').matchAll(/^\s+(\w+): call\('pk:/gm)].length;
  assert.match(out, new RegExp(`${preloadNames} API-Funktionen`));
  const app = fs.readFileSync(path.join(WWW, 'app.js'), 'utf8');
  for (const bad of ['__PK_TEST_DISCORD__', 'FakeGateway', 'pk-autoplay', 'require("node:', "require('node:", 'ipcRenderer']) assert.ok(!app.includes(bad), `${bad} darf nicht in der APK stehen`);
  assert.ok(fs.existsSync(path.join(WWW, 'index.html')) && fs.existsSync(path.join(WWW, 'styles.css')));
});

test('Strenge CSP: nur eigene Skripte, Verbindungen nur zu Discord und GitHub', () => {
  const html = read('src', 'mobile', 'index.html');
  const csp = /content="([^"]+)"/.exec(html)[1];
  assert.match(csp, /script-src 'self';/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*;|http:/);
  const connect = /connect-src ([^;]+);/.exec(csp)[1].split(/\s+/);
  assert.ok(connect.includes("'self'"), 'Capacitors HTTP-Weg (https://localhost/_capacitor_http_interceptor_) muss erlaubt sein');
  for (const host of connect.filter((h) => h !== "'self'")) assert.match(host, /^(https:\/\/(discord\.com|api\.github\.com|github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com|raw\.githubusercontent\.com)|wss:\/\/(gateway\.discord\.gg|\*\.discord\.gg))$/);
});

test('Android-Manifest: keine Datensicherung, kein Klartext-HTTP, FileProvider nur für den Cache', () => {
  const manifest = read('mobile', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /REQUEST_INSTALL_PACKAGES/);
  assert.doesNotMatch(manifest, /READ_EXTERNAL_STORAGE|RECORD_AUDIO|ACCESS_FINE_LOCATION|READ_CONTACTS/);
  assert.doesNotMatch(read('mobile', 'android', 'app', 'src', 'main', 'res', 'xml', 'file_paths.xml'), /external-path/);
  const cfg = JSON.parse(read('mobile', 'capacitor.config.json'));
  assert.equal(cfg.android.webContentsDebuggingEnabled, false);
  assert.equal(cfg.android.allowMixedContent, false);
  assert.equal(cfg.plugins.CapacitorHttp.enabled, true);
  // Signaturschlüssel nie im Repo
  assert.match(read('.gitignore'), /\*\.keystore/);
  assert.match(read('mobile', 'android', 'app', 'build.gradle'), /System\.getenv\('PK_KEYSTORE'\)/);
});

test('Die Electron-App enthält den Android-Teil nicht', () => {
  const forge = read('forge.config.js');
  assert.match(forge, /\/\^\\\/mobile\//);
  assert.match(forge, /\/\^\\\/src\\\/mobile\//);
});
