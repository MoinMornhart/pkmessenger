'use strict';

// Sprach-Einstellungen (Issue #1: „Rauschen entfernen“, „man hört sich doppelt“, „alles muten“).
// Reine Logik, getestet in tests/test-voice-settings.js. Audio selbst: src/renderer/voice/engine.js.

const GATE_LEVELS = { aus: 0, normal: 0.012, stark: 0.035 }; // RMS-Schwelle des Noise-Gates
const GATE_HOLD_MS = 300; // nach dem Sprechen kurz offen lassen → keine abgeschnittenen Silben
const SNOWFLAKE = /^\d{17,20}$/;

const DEFAULT_VOICE_FX = Object.freeze({ echo: true, noise: true, agc: true, gate: 'normal', userMuted: {}, userVolume: {} });

function sanitizeVoiceFx(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const ids = (o, ok) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([k, v]) => SNOWFLAKE.test(k) && ok(v)));
  return {
    echo: typeof r.echo === 'boolean' ? r.echo : true,
    noise: typeof r.noise === 'boolean' ? r.noise : true,
    agc: typeof r.agc === 'boolean' ? r.agc : true,
    gate: Object.hasOwn(GATE_LEVELS, r.gate) ? r.gate : 'normal',
    userMuted: ids(r.userMuted, (v) => v === true),
    userVolume: Object.fromEntries(Object.entries(ids(r.userVolume, (v) => Number.isFinite(v))).map(([k, v]) => [k, Math.min(2, Math.max(0, v))])),
  };
}

/** Lautstärke eines Teilnehmers für mich (0 = stumm). */
function userGain(fx, userId) {
  if (fx.userMuted[userId]) return 0;
  return fx.userVolume[userId] ?? 1;
}

/** Mikrofon-Optionen für getUserMedia. */
function micConstraints(fx, micId) {
  return { echoCancellation: fx.echo, noiseSuppression: fx.noise, autoGainControl: fx.agc, channelCount: 1, ...(micId ? { deviceId: { ideal: micId } } : {}) };
}

/**
 * Noise-Gate: Soll dieser 20-ms-Block gesendet werden (sonst Stille)?
 * @returns {{ open: boolean, openUntil: number }}
 */
function gateStep(level, gate, now, openUntil) {
  const threshold = GATE_LEVELS[gate] ?? 0;
  if (threshold === 0) return { open: true, openUntil };
  if (level >= threshold) return { open: true, openUntil: now + GATE_HOLD_MS };
  return { open: now < openUntil, openUntil };
}

module.exports = { GATE_LEVELS, GATE_HOLD_MS, DEFAULT_VOICE_FX, sanitizeVoiceFx, userGain, micConstraints, gateStep };
