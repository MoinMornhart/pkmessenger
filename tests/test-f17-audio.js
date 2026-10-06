'use strict';

// F17 Ton-Aufbereitung (rein rechnerisch, ohne Mikrofon): 20-ms-Frames, Stereo, Pegel, Wiedergabe-Planung.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFrameAssembler, rms, nextPlayTime, FRAME_SAMPLES } = require('../src/shared/audio-frames');

test('128er-Blöcke (AudioWorklet) ergeben exakt 960er-Frames ohne Verlust', () => {
  const asm = createFrameAssembler();
  let frames = [];
  let counter = 0;
  for (let b = 0; b < 15; b++) {
    const block = new Float32Array(128).map(() => (counter++ % 1000) / 1000);
    frames = frames.concat(asm.push(block));
  }
  // 15 * 128 = 1920 Samples = genau 2 Frames
  assert.equal(frames.length, 2);
  assert.equal(frames[0].length, FRAME_SAMPLES * 2);
  // Kontinuität: erstes Sample von Frame 2 = Sample Nr. 960
  assert.equal(frames[1][0], Math.fround((960 % 1000) / 1000)); // Float32-Genauigkeit
});

test('Mono wird auf beide Stereo-Kanäle (planar) kopiert', () => {
  const asm = createFrameAssembler();
  const mono = new Float32Array(FRAME_SAMPLES).map((_, i) => i / FRAME_SAMPLES);
  const [frame] = asm.push(mono);
  assert.deepEqual(frame.subarray(0, FRAME_SAMPLES), mono);
  assert.deepEqual(frame.subarray(FRAME_SAMPLES), mono);
});

test('Große Blöcke liefern mehrere Frames, Rest bleibt für den nächsten Aufruf', () => {
  const asm = createFrameAssembler();
  assert.equal(asm.push(new Float32Array(2500)).length, 2); // 2×960 = 1920, Rest 580
  assert.equal(asm.push(new Float32Array(380)).length, 1); // 580 + 380 = 960
});

test('Pegel (RMS)', () => {
  assert.equal(rms(new Float32Array(10)), 0);
  assert.equal(rms(new Float32Array([1, -1, 1, -1])), 1);
});

test('Wiedergabe-Planung: Vorlauf, lückenlos anschließen, Rückstand begrenzen', () => {
  assert.equal(nextPlayTime(10, 0), 10.06, 'leer → mit 60 ms Vorlauf starten');
  assert.equal(nextPlayTime(10, 10.1), 10.1, 'lückenlos anschließen');
  assert.equal(nextPlayTime(10, 9.5), 10.06, 'Puffer leergelaufen → neu starten');
  assert.equal(nextPlayTime(10, 10.5), 10.06, 'mehr als 300 ms Rückstand → zurücksetzen');
});
