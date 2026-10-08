'use strict';

// Benachrichtigungstöne (Issue #12): Wann klingt es, und welcher Ton?
// Reine Logik ohne Audio – getestet in tests/test-notify-sounds.js. Abgespielt wird in src/renderer/sounds.js.

const PRESETS = ['standard', 'leise', 'klar', 'retro', 'eigen', 'aus'];
const EVENTS = ['activeChat', 'otherChat', 'mention', 'dm', 'ai', 'error'];
const COOLDOWN_MS = 1500; // höchstens ein Ton pro 1,5 s – kein „Sound-Sturm“

const DEFAULT_SOUND = Object.freeze({
  enabled: true,
  volume: 0.6,
  quietInOpenChat: true, // kein Ton, wenn das Fenster aktiv ist und dieser Chat gerade offen ist
  events: Object.freeze({
    activeChat: Object.freeze({ on: false, preset: 'leise' }),
    otherChat: Object.freeze({ on: true, preset: 'standard' }),
    mention: Object.freeze({ on: true, preset: 'klar' }),
    dm: Object.freeze({ on: true, preset: 'klar' }),
    ai: Object.freeze({ on: true, preset: 'retro' }),
    error: Object.freeze({ on: true, preset: 'leise' }),
  }),
});

/** Gespeicherte Werte prüfen; alles Unbekannte fällt auf die Standardwerte zurück. */
function sanitizeSound(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const vol = Number(r.volume);
  const events = {};
  for (const e of EVENTS) {
    const x = r.events && typeof r.events[e] === 'object' && r.events[e] ? r.events[e] : {};
    events[e] = {
      on: typeof x.on === 'boolean' ? x.on : DEFAULT_SOUND.events[e].on,
      preset: PRESETS.includes(x.preset) ? x.preset : DEFAULT_SOUND.events[e].preset,
    };
  }
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_SOUND.enabled,
    volume: Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : DEFAULT_SOUND.volume,
    quietInOpenChat: typeof r.quietInOpenChat === 'boolean' ? r.quietInOpenChat : DEFAULT_SOUND.quietInOpenChat,
    events,
  };
}

/** Welches Ereignis ist diese Nachricht? Reihenfolge: Privatchat > Erwähnung/Antwort an mich > offener/anderer Chat. */
function classifyMessage(m, { botId, activeChannelId, windowFocused }) {
  if (!m || m.isOwn || (botId && m.author?.id === botId)) return null; // eigene Nachrichten: nie
  if (m.system) return null;
  if (!m.guildId) return 'dm';
  if (botId && (m.mentions?.users || []).some((u) => u.id === botId)) return 'mention';
  return m.channelId === activeChannelId && windowFocused ? 'activeChat' : 'otherChat';
}

/**
 * Soll ein Ton kommen? → { event, preset } oder null.
 * @param {string|null} event  aus classifyMessage oder 'ai' / 'error'
 */
function decideSound(event, settings, { lastPlayedAt = 0, now = Date.now() } = {}) {
  if (!event) return null;
  const s = sanitizeSound(settings);
  if (!s.enabled || s.volume === 0) return null;
  if (event === 'activeChat' && s.quietInOpenChat) return null;
  const rule = s.events[event];
  if (!rule || !rule.on || rule.preset === 'aus') return null;
  if (now - lastPlayedAt < COOLDOWN_MS) return null;
  return { event, preset: rule.preset };
}

// ---------- Benachrichtigungen pro Chat oder Server (JoniMoni #61: „welche Kanäle man ignorieren soll“) ----------
// mode: 'alle' (wie eingestellt) | 'erwaehnungen' (nur Erwähnungen + Privatchats) | 'aus' (stumm); preset: eigener Ton
const CHAT_MODES = ['alle', 'erwaehnungen', 'aus'];
const CHAT_KEY = /^(\d{17,20}|@dm)$/;

function sanitizeChatNotify(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw).slice(0, 500)) {
    if (!CHAT_KEY.test(k) || !v || typeof v !== 'object') continue;
    const mode = CHAT_MODES.includes(v.mode) ? v.mode : 'alle';
    const preset = PRESETS.includes(v.preset) && v.preset !== 'aus' ? v.preset : null;
    if (mode === 'alle' && !preset) continue; // Standard → nicht speichern
    out[k] = { mode, preset };
  }
  return out;
}

/** Regel für einen Chat: zuerst der Chat selbst, dann sein Server, sonst Standard. */
function resolveChatNotify(map, { channelId, guildId } = {}) {
  const m = sanitizeChatNotify(map);
  return m[channelId] || m[guildId || '@dm'] || { mode: 'alle', preset: null };
}

/** Ereignis + Regel → Ereignis (oder null = stumm) und ggf. eigener Ton. */
function applyChatNotify(event, rule) {
  if (!event || !rule) return { event, preset: null };
  if (rule.mode === 'aus') return { event: null, preset: null };
  if (rule.mode === 'erwaehnungen' && event !== 'mention' && event !== 'dm') return { event: null, preset: null };
  return { event, preset: rule.preset || null };
}

module.exports = { PRESETS, EVENTS, COOLDOWN_MS, DEFAULT_SOUND, CHAT_MODES, sanitizeSound, classifyMessage, decideSound, sanitizeChatNotify, resolveChatNotify, applyChatNotify };
