'use strict';

// Issue #1 Token-Sicherheit: verschlüsselt speichern, .env übernehmen + löschen, nie Klartext rausgeben.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTokenStore } = require('../src/main/secrets');
const { FAKE_TOKEN, BOT_ID } = require('./helpers/fake-discord');

// Fake-safeStorage: "verschlüsselt" erkennbar anders als Klartext (XOR), damit der Test Klartext im File ausschließen kann.
function fakeSafeStorage(available = true) {
  const xor = (buf) => Buffer.from(buf.map((b) => b ^ 0x5a));
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.concat([Buffer.from('ENC1'), xor(Buffer.from(s, 'utf8'))]),
    decryptString: (b) => {
      if (b.subarray(0, 4).toString() !== 'ENC1') throw new Error('Error while decrypting the ciphertext');
      return xor(b.subarray(4)).toString('utf8');
    },
  };
}

function setup({ env = `DISCORD_TOKEN=${FAKE_TOKEN}\n`, available = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-sec-'));
  const envPath = path.join(dir, '.env');
  const filePath = path.join(dir, 'userdata', 'token.enc');
  if (env !== null) fs.writeFileSync(envPath, env);
  const store = createTokenStore({ safeStorage: fakeSafeStorage(available), filePath, envPath });
  return { store, envPath, filePath, dir };
}

test('Erster Start: Token aus .env wird verschlüsselt übernommen, .env danach gelöscht', () => {
  const { store, envPath, filePath } = setup();
  assert.deepEqual(store.load(), { status: 'ok', token: FAKE_TOKEN });
  assert.equal(fs.existsSync(envPath), false, '.env muss weg sein');
  assert.equal(fs.existsSync(filePath), true);
  assert.equal(fs.readFileSync(filePath).includes(Buffer.from(FAKE_TOKEN)), false, 'kein Klartext im Tresor');
  assert.equal(store.info().source, 'migrated');
});

test('Folgestart: Token kommt aus dem Tresor, auch ohne .env', () => {
  const { store } = setup();
  store.load();
  assert.equal(store.load().token, FAKE_TOKEN);
  assert.equal(store.info().source, 'secure');
});

test('Neu entstandene .env mit gleichem Token wird entfernt; mit neuem Token übernommen', () => {
  const { store, envPath } = setup();
  store.load();
  fs.writeFileSync(envPath, `DISCORD_TOKEN=${FAKE_TOKEN}\n`);
  store.load();
  assert.equal(fs.existsSync(envPath), false);
  const other = `${Buffer.from('222222222222222222').toString('base64url')}.XyZaBc.${'y'.repeat(27)}`;
  fs.writeFileSync(envPath, `DISCORD_TOKEN=${other}\n`);
  assert.equal(store.load().token, other);
  assert.equal(fs.existsSync(envPath), false);
});

test('Info gibt NIE den Token heraus, nur Bot-ID und Status', () => {
  const { store } = setup();
  store.load();
  const info = store.info();
  assert.equal(info.botId, BOT_ID);
  assert.equal(info.encrypted, true);
  assert.equal(JSON.stringify(info).includes(FAKE_TOKEN), false);
});

test('Speichern über Einstellungen: prüft Format, verschlüsselt, löscht alte .env', () => {
  const { store, envPath } = setup({ env: 'DISCORD_TOKEN=\n' });
  assert.throws(() => store.save('quatsch'), /nicht wie ein Bot-Token/);
  assert.throws(() => store.save(null), { code: 'VALIDATION' });
  const info = store.save(`  Bot ${FAKE_TOKEN}  `);
  assert.equal(info.stored, true);
  assert.equal(fs.existsSync(envPath), false);
  assert.equal(store.load().token, FAKE_TOKEN);
});

test('Entfernen: Tresor + .env weg → Setup-Status', () => {
  const { store } = setup();
  store.load();
  store.clear();
  assert.equal(store.info().stored, false);
  assert.equal(store.load().status, 'missing-file');
});

test('Beschädigter Tresor → kein Absturz, wird ignoriert', () => {
  const { store, filePath } = setup({ env: null });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'kaputt');
  assert.equal(store.load().status, 'missing-file');
  assert.match(store.info().warning, /unlesbar/);
});

test('Ohne verfügbare Verschlüsselung: .env bleibt erhalten (Token geht nicht verloren) + Warnung', () => {
  const { store, envPath } = setup({ available: false });
  assert.equal(store.load().token, FAKE_TOKEN);
  assert.equal(fs.existsSync(envPath), true);
  assert.match(store.info().warning, /nicht verfügbar/);
  assert.throws(() => store.save(FAKE_TOKEN), /nicht verfügbar/);
});
