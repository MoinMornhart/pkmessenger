'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Lokale Einstellungen als JSON. Der Token wird hier NIEMALS gespeichert (nur in .env).
// Datensparsam: nur letzte Position und Lese-Markierungen (Kanal-ID → letzte gelesene Nachrichten-ID).
const DEFAULTS = Object.freeze({ lastGuildId: null, lastChannelId: null, readMarkers: {} });
const FORBIDDEN_KEYS = /token|secret|password/i;

function createStore(filePath) {
  let data = load();
  let timer = null;

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return { ...DEFAULTS, ...parsed, readMarkers: { ...(parsed.readMarkers || {}) } };
    } catch {
      return { ...DEFAULTS, readMarkers: {} };
    }
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filePath); // atomar: keine halb geschriebene Datei bei Absturz
  }

  // Schreibzugriffe bündeln, damit schnelles Kanal-Wechseln keine Disk-Stürme auslöst.
  function scheduleFlush() {
    if (!timer) timer = setTimeout(flush, 500);
  }

  return {
    get() {
      return { ...data, readMarkers: { ...data.readMarkers } };
    },
    set(key, value) {
      if (FORBIDDEN_KEYS.test(key)) throw new Error('Geheimnisse dürfen nicht im Settings-Store landen.');
      data[key] = value;
      scheduleFlush();
    },
    setReadMarker(channelId, messageId) {
      data.readMarkers[channelId] = messageId;
      scheduleFlush();
    },
    flush,
  };
}

module.exports = { createStore };
