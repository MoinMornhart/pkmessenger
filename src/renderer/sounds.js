// Benachrichtigungstöne (Issue #12): Klänge werden per WebAudio erzeugt – keine Dateien, kein Internet.
// Eigene WAV-Datei: liegt geprüft im App-Ordner (Main-Prozess), wird hier nur abgespielt.
import { classifyMessage, decideSound } from '../shared/notify-sounds';
import { prefs } from './prefs';
import { api } from './api';

let ctx = null;
let customBuffer = null;
let lastPlayedAt = 0;
const log = []; // letzte Töne (für Statusanzeige und Screenshot-Prüfung)
if (typeof window !== 'undefined') window.__pkSoundLog = log; // nur Zeitpunkte/Art, keine Inhalte

function audio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// [Frequenz Hz, Start s, Dauer s, Wellenform]
const NOTES = {
  standard: [
    [880, 0, 0.12, 'sine'],
    [1320, 0.11, 0.2, 'sine'],
  ],
  leise: [[660, 0, 0.28, 'sine']],
  klar: [
    [1046, 0, 0.08, 'triangle'],
    [1568, 0.08, 0.08, 'triangle'],
    [2093, 0.16, 0.16, 'triangle'],
  ],
  retro: [
    [523, 0, 0.07, 'square'],
    [784, 0.08, 0.07, 'square'],
    [1046, 0.16, 0.1, 'square'],
  ],
};
const LEVEL = { standard: 0.35, leise: 0.14, klar: 0.3, retro: 0.1 };

function synth(preset, volume) {
  const c = audio();
  const t0 = c.currentTime + 0.01;
  for (const [freq, at, dur, type] of NOTES[preset] || NOTES.standard) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const peak = Math.max(0.0002, (LEVEL[preset] || 0.3) * volume);
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.03);
  }
}

async function playCustom(volume) {
  if (!customBuffer) {
    const data = await api.soundCustomGet().catch(() => null);
    if (!data) return synth('standard', volume); // keine eigene Datei → Standardton
    customBuffer = await audio().decodeAudioData(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
  const c = audio();
  const src = c.createBufferSource();
  const gain = c.createGain();
  src.buffer = customBuffer;
  gain.gain.value = volume;
  src.connect(gain).connect(c.destination);
  src.start();
  return undefined;
}

/** Ton direkt abspielen (z. B. „Testton“). */
export function playPreset(preset, volume = prefs.get().sound.volume, event = 'test') {
  if (preset === 'aus' || !(volume > 0)) return false;
  log.unshift({ preset, event, at: Date.now() });
  log.length = Math.min(log.length, 10);
  if (preset === 'eigen') playCustom(volume).catch(() => synth('standard', volume));
  else synth(preset, volume);
  return true;
}

/** Ereignis melden ('ai', 'error', …) → spielt höchstens einen Ton, wenn die Einstellungen es erlauben. */
export function notify(event) {
  const s = prefs.get().sound;
  const d = decideSound(event, s, { lastPlayedAt, now: Date.now() });
  if (!d) return null;
  lastPlayedAt = Date.now();
  playPreset(d.preset, s.volume, d.event);
  return d;
}

export function notifyMessage(m, info) {
  return notify(classifyMessage(m, info));
}

export function forgetCustomSound() {
  customBuffer = null;
}

export const soundLog = () => [...log];
