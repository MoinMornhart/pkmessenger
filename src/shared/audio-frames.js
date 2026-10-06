'use strict';

// Discord-Sprache: Opus, 48 kHz, Stereo, 20-ms-Frames = 960 Samples pro Kanal.
const SAMPLE_RATE = 48000;
const FRAME_SAMPLES = 960;
const CHANNELS = 2;

/**
 * Sammelt beliebig große Mono-Blöcke (AudioWorklet liefert 128 Samples) und gibt volle 20-ms-Frames
 * als planares Stereo (L-Block, dann R-Block) zurück – genau das Format für WebCodecs AudioData 'f32-planar'.
 */
function createFrameAssembler() {
  let buf = new Float32Array(FRAME_SAMPLES);
  let fill = 0;
  return {
    /** @returns {Float32Array[]} fertige Frames (je 1920 Werte: 960 L + 960 R) */
    push(mono) {
      const frames = [];
      let i = 0;
      while (i < mono.length) {
        const n = Math.min(FRAME_SAMPLES - fill, mono.length - i);
        buf.set(mono.subarray(i, i + n), fill);
        fill += n;
        i += n;
        if (fill === FRAME_SAMPLES) {
          const planar = new Float32Array(FRAME_SAMPLES * CHANNELS);
          planar.set(buf, 0);
          planar.set(buf, FRAME_SAMPLES);
          frames.push(planar);
          buf = new Float32Array(FRAME_SAMPLES);
          fill = 0;
        }
      }
      return frames;
    },
    reset() {
      fill = 0;
    },
  };
}

/** Lautstärke (RMS, 0..1) – für die Pegelanzeige beim Sprechen. */
function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

/**
 * Wiedergabe-Planung pro Sprecher: kleiner Puffer gegen Netz-Schwankungen (Jitter),
 * bei zu großem Rückstand wird nachgezogen, damit sich keine Verzögerung aufbaut.
 */
function nextPlayTime(now, scheduledUntil, { lead = 0.06, maxLag = 0.3 } = {}) {
  if (!scheduledUntil || scheduledUntil < now) return now + lead; // Puffer leer → mit Vorlauf neu starten
  if (scheduledUntil - now > maxLag) return now + lead; // zu viel Rückstand → zurücksetzen
  return scheduledUntil;
}

module.exports = { SAMPLE_RATE, FRAME_SAMPLES, CHANNELS, createFrameAssembler, rms, nextPlayTime };
