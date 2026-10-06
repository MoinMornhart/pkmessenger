'use strict';

// Token-Tresor (Issue #1): Der Bot-Token liegt VERSCHLÜSSELT in %APPDATA%\PKMessenger\token.enc.
// Verschlüsselung: Electron safeStorage → unter Windows DPAPI (an dein Windows-Konto gebunden).
// Eine vorhandene .env wird einmalig übernommen und danach überschrieben + gelöscht.
// Der Token verlässt den Main-Prozess nie Richtung Oberfläche (nur Bot-ID / Status).
const fs = require('node:fs');
const path = require('node:path');
const { loadToken, isPlausibleBotToken, botIdFromToken } = require('./env');

function createTokenStore({ safeStorage, filePath, envPath }) {
  let lastInfo = { stored: false, source: null, warning: null };

  const available = () => {
    try {
      return Boolean(safeStorage?.isEncryptionAvailable?.());
    } catch {
      return false;
    }
  };

  function writeEncrypted(token) {
    const blob = safeStorage.encryptString(token);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, blob, { mode: 0o600 });
    fs.renameSync(tmp, filePath);
  }

  /** .env unbrauchbar machen: erst mit Nullen überschreiben, dann löschen. */
  function wipeEnv() {
    try {
      const size = fs.statSync(envPath).size;
      fs.writeFileSync(envPath, Buffer.alloc(Math.max(size, 64), 0));
      fs.unlinkSync(envPath);
      return true;
    } catch {
      return false;
    }
  }

  /** Rückgabe wie env.loadToken: { status: 'ok', token } | { status: 'missing-file' | 'missing-token' | 'invalid-format' | ... } */
  function load() {
    // 1) verschlüsselter Tresor
    if (fs.existsSync(filePath)) {
      if (!available()) {
        lastInfo = { stored: true, source: 'secure', warning: 'Verschlüsselung gerade nicht verfügbar.' };
        return { status: 'read-error', detail: 'safeStorage nicht verfügbar' };
      }
      try {
        const token = safeStorage.decryptString(fs.readFileSync(filePath));
        if (isPlausibleBotToken(token)) {
          lastInfo = { stored: true, source: 'secure', warning: null };
          // Eine später neu entstandene .env wird nicht benutzt, aber sicherheitshalber entfernt.
          if (envPath && fs.existsSync(envPath)) {
            const fromEnv = loadToken(envPath);
            if (fromEnv.status === 'ok' && fromEnv.token !== token) {
              // Neuer Token in .env → übernehmen (Nutzer hat ihn bewusst eingetragen)
              writeEncrypted(fromEnv.token);
              wipeEnv();
              lastInfo = { stored: true, source: 'migrated', warning: null };
              return { status: 'ok', token: fromEnv.token };
            }
            if (fromEnv.status === 'ok') wipeEnv();
          }
          return { status: 'ok', token };
        }
      } catch {
        /* beschädigt oder von anderem Windows-Konto → wie "kein Token" behandeln */
      }
      lastInfo = { stored: false, source: null, warning: 'Gespeicherter Token war unlesbar und wurde ignoriert.' };
    }

    // 2) .env übernehmen (Erstinstallation / Altbestand)
    const fromEnv = envPath ? loadToken(envPath) : { status: 'missing-file' };
    if (fromEnv.status !== 'ok') return fromEnv;
    if (!available()) {
      // Kein sicherer Speicher → .env NICHT löschen, sonst wäre der Token weg. Deutlich warnen.
      lastInfo = { stored: false, source: 'env', warning: 'Verschlüsselung nicht verfügbar – Token wird aus der .env gelesen.' };
      return fromEnv;
    }
    writeEncrypted(fromEnv.token);
    const wiped = wipeEnv();
    lastInfo = { stored: true, source: 'migrated', warning: wiped ? null : '.env konnte nicht gelöscht werden – bitte manuell löschen.' };
    return fromEnv;
  }

  /** Neuen Token speichern (aus den Einstellungen). Wirft deutsche Fehler. */
  function save(token) {
    const t = typeof token === 'string' ? token.trim().replace(/^Bot\s+/i, '') : '';
    if (!isPlausibleBotToken(t)) {
      const e = new Error('Das sieht nicht wie ein Bot-Token aus.');
      e.code = 'VALIDATION';
      throw e;
    }
    if (!available()) {
      const e = new Error('Sichere Speicherung ist auf diesem System nicht verfügbar.');
      e.code = 'VALIDATION';
      throw e;
    }
    writeEncrypted(t);
    if (envPath && fs.existsSync(envPath)) wipeEnv();
    lastInfo = { stored: true, source: 'secure', warning: null };
    return info();
  }

  function clear() {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* war nicht da */
    }
    if (envPath && fs.existsSync(envPath)) wipeEnv();
    lastInfo = { stored: false, source: null, warning: null };
    return info();
  }

  /** Nur ungefährliche Infos für die Oberfläche – NIE den Token. */
  function info() {
    let botId = null;
    if (fs.existsSync(filePath) && available()) {
      try {
        botId = botIdFromToken(safeStorage.decryptString(fs.readFileSync(filePath)));
      } catch {
        botId = null;
      }
    }
    return { stored: Boolean(botId), encrypted: Boolean(botId), botId, source: lastInfo.source, warning: lastInfo.warning, available: available() };
  }

  return { load, save, clear, info };
}

module.exports = { createTokenStore };
