// Android-App (Issue #56): stellt der Oberfläche dieselbe window.api bereit wie preload.js am PC.
// Dahinter laufen dieselben Bausteine wie im Electron-Hauptprozess: Validierung (validate.js), Fehlertexte
// (errors.js), Kanal-Tabelle (ipc.js) und der Discord-Service (discord.js) – nur mit dem schlanken Client.
import { Buffer } from './buffer-shim';
import { secure, openExternal, onResume, onBackButton, onLoginLink } from './platform';

globalThis.Buffer ||= Buffer;

const { createClient, liteDiscord } = require('./lite-discord');
const { createDiscordService } = require('../main/discord');
const { buildHandlers, wrap } = require('../main/ipc');
const { isPlausibleBotToken, botIdFromToken } = require('./env-shim');
const { createMobileUpdater } = require('./updater');

/* global __PK_API_MAP__, __PK_EVENT_TYPES__, __PK_VERSION__, __PK_REPO__, __PK_DEV__ */
const API_MAP = __PK_API_MAP__; // { getStatus: 'pk:get-status', … } – beim Bauen aus preload.js gelesen
const EVENT_TYPES = new Set(__PK_EVENT_TYPES__);
globalThis.__PK_VERSION__ = __PK_VERSION__;

// ---------- Einstellungen (wie settings.json am PC; Geheimnisse sind verboten) ----------
const SETTINGS_KEY = 'pk.mobile.settings.v1';
const FORBIDDEN_KEYS = /token|secret|password/i;
function createMobileStore() {
  let data = { readMarkers: {} };
  try {
    data = { readMarkers: {}, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    /* kaputte Daten → Standard */
  }
  const flush = () => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    } catch {
      /* Speicher voll/gesperrt – nicht kritisch */
    }
  };
  return {
    get: () => ({ ...data, readMarkers: { ...data.readMarkers } }),
    set(key, value) {
      if (FORBIDDEN_KEYS.test(key)) throw new Error('Geheimnisse dürfen nicht im Settings-Store landen.');
      data[key] = value;
      flush();
    },
    setReadMarker(channelId, messageId) {
      data.readMarkers[channelId] = messageId;
      flush();
    },
    flush,
  };
}

// ---------- Token-Tresor (Android-Schlüsselspeicher) ----------
const TOKEN_KEY = 'botToken';
function createMobileTokenStore() {
  let token = null;
  return {
    async init() {
      token = (await secure.get(TOKEN_KEY)) || (__PK_DEV__ ? globalThis.__PK_TEST_DISCORD__?.token || null : null);
    },
    load: () => (token ? { status: 'ok', token } : { status: 'missing' }),
    save(input) {
      const t = typeof input === 'string' ? input.trim().replace(/^Bot\s+/i, '') : '';
      if (!isPlausibleBotToken(t)) throw Object.assign(new Error('Das sieht nicht wie ein Bot-Token aus.'), { code: 'VALIDATION' });
      token = t;
      secure.set(TOKEN_KEY, t).catch(() => {});
      return this.info();
    },
    clear() {
      token = null;
      secure.remove(TOKEN_KEY);
      return this.info();
    },
    // Nur ungefährliche Infos für die Oberfläche – NIE den Token
    info: () => ({ stored: Boolean(token), encrypted: Boolean(token), botId: token ? botIdFromToken(token) : null, source: token ? 'secure' : null, warning: null, available: true }),
  };
}

// ---------- Aufbau ----------
const listeners = new Set();
const emit = (type, payload) => {
  if (!EVENT_TYPES.has(type)) return;
  for (const fn of listeners) {
    try {
      fn(type, payload);
    } catch {
      /* ein fehlerhafter Zuhörer darf die anderen nicht stören */
    }
  }
};

const store = createMobileStore();
if (__PK_DEV__ && globalThis.__PK_TEST_DISCORD__?.dmChannels && !store.get().dmChannels) store.set('dmChannels', globalThis.__PK_TEST_DISCORD__.dmChannels);
const tokenStore = createMobileTokenStore();
const logger = {
  info: (...a) => console.info('[pk]', ...a),
  warn: (...a) => console.warn('[pk]', ...a),
  error: (...a) => console.error('[pk]', ...a),
};
const service = createDiscordService({
  discord: liteDiscord,
  envPath: '',
  emit,
  getToken: () => tokenStore.load(),
  createClient: (options) => createClient({ intents: options.intents, ...(__PK_DEV__ ? globalThis.__PK_TEST_DISCORD__ || {} : {}) }),
  statusExtra: { platform: 'android' },
  dmStore: {
    list: () => store.get().dmChannels || [],
    add: (e) => store.set('dmChannels', [e, ...(store.get().dmChannels || []).filter((x) => x.channelId !== e.channelId)].slice(0, 100)),
  },
  presence: { get: () => store.get().presence === true, set: (on) => store.set('presence', Boolean(on)) },
});
const updater = createMobileUpdater({ repo: __PK_REPO__, currentVersion: __PK_VERSION__, emit, openExternal });

const handlers = buildHandlers({
  service,
  store,
  tokenStore,
  updater,
  appVersion: __PK_VERSION__,
  openExternal: (url) => openExternal(url),
  copyText: ({ text }) => navigator.clipboard?.writeText(text),
  logger,
  errorReport: ({ where, message }) => `### PKMessenger error report (Android)\n\nVersion: ${__PK_VERSION__}\nOrt: ${where}\nFehler: ${message}\n`,
});
const wrapped = Object.fromEntries(Object.entries(handlers).map(([ch, h]) => [ch, wrap(h, () => true, ch, () => false, logger)]));
const unavailable = { ok: false, error: { code: 'NOT_FOUND', message: 'Das gibt es in der Android-App nicht.', hint: 'Diese Funktion gibt es nur am PC.' } };

const api = {};
for (const [name, channel] of Object.entries(API_MAP)) {
  api[name] = async (payload) => (wrapped[channel] ? wrapped[channel]({}, payload === undefined ? undefined : structuredClone(payload)) : unavailable);
}
api.voicePacket = () => {};
api.onVoiceAudio = () => () => {};
api.onEvent = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
api.platform = 'android';
window.api = Object.freeze(api);
document.documentElement.dataset.platform = 'android';

// Start: Token aus dem Schlüsselspeicher holen, dann verbinden. Kommt die App zurück in den Vordergrund und ist
// die Verbindung weg (Android trennt im Hintergrund), neu verbinden.
(async () => {
  await tokenStore.init().catch(() => {});
  await service.connect().catch(() => {});
  updater.start();
})();
// Zurück-Taste → Oberfläche (Workspace) entscheidet; ganz oben verlässt sie die App
onBackButton((exit) => window.dispatchEvent(new CustomEvent('pk:back', { detail: { exit } })));
// QR-Code mit der Kamera gescannt → Link an die Einrichtung weitergeben (auch wenn die App gerade erst startet)
let pendingLoginLink = null;
onLoginLink((url) => {
  pendingLoginLink = url;
  window.dispatchEvent(new CustomEvent('pk:login-link', { detail: { url } }));
});
window.pkPendingLoginLink = () => pendingLoginLink;
onResume(() => {
  const s = service.getStatus().state;
  if (s !== 'ready' && s !== 'connecting' && s !== 'setup') service.connect().catch(() => {});
});
