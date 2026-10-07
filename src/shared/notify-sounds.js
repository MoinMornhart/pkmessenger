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

module.exports = { PRESETS, EVENTS, COOLDOWN_MS, DEFAULT_SOUND, sanitizeSound, classifyMessage, decideSound };
