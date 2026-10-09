'use strict';

// Sprach-Einstellungen (Issue #1): Rauschen, doppelt hören, einzelne Teilnehmer stumm, Noise-Gate
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeVoiceFx, userGain, micConstraints, gateStep, gateGain, GATE_HOLD_MS, GATE_FLOOR } = require('../src/shared/voice-settings');

const ANNA = '555555555555555501';

test('Teilnehmer nur für mich stumm oder leiser/lauter', () => {
  const fx = sanitizeVoiceFx({ userMuted: { [ANNA]: true }, userVolume: { '555555555555555502': 1.5 } });
  assert.equal(userGain(fx, ANNA), 0);
  assert.equal(userGain(fx, '555555555555555502'), 1.5);
  assert.equal(userGain(fx, '555555555555555503'), 1);
});

test('Gespeicherte Werte werden geprüft (Grenzen, nur echte IDs)', () => {
  const fx = sanitizeVoiceFx({ echo: 'ja', gate: 'extrem', userMuted: { abc: true, [ANNA]: 'ja' }, userVolume: { [ANNA]: 9 } });
  assert.equal(fx.echo, true);
  assert.equal(fx.gate, 'normal');
  assert.deepEqual(fx.userMuted, {});
  assert.equal(fx.userVolume[ANNA], 2);
  assert.deepEqual(sanitizeVoiceFx(null).userMuted, {});
});

test('Mikrofon-Optionen: Echo/Rauschen/Lautstärke-Automatik schaltbar, Mikro-Auswahl', () => {
  assert.deepEqual(micConstraints(sanitizeVoiceFx({ echo: false, noise: true, agc: false }), 'mic1'), { echoCancellation: false, noiseSuppression: true, autoGainControl: false, voiceIsolation: true, channelCount: 1, deviceId: { ideal: 'mic1' } });
  assert.equal(micConstraints(sanitizeVoiceFx({}), '').deviceId, undefined);
});

test('Noise-Gate: leise = Stille, Sprechen öffnet, kurze Nachlaufzeit', () => {
  let g = gateStep(0.005, 'normal', 1000, 0);
  assert.equal(g.open, false); // Rauschen bleibt draußen
  g = gateStep(0.05, 'normal', 1000, g.openUntil);
  assert.equal(g.open, true);
  assert.equal(g.openUntil, 1000 + GATE_HOLD_MS);
  assert.equal(gateStep(0.001, 'normal', 1200, g.openUntil).open, true); // Satzende nicht abschneiden
  assert.equal(gateStep(0.001, 'normal', 1000 + GATE_HOLD_MS + 1, g.openUntil).open, false);
  assert.equal(gateStep(0.008, 'stark', 1000, 0).open, false); // „stark“ filtert mehr als „normal“
  assert.equal(gateStep(0.008, 'normal', 1000, 0).open, true);
  assert.equal(gateStep(0, 'aus', 1000, 0).open, true);
});

test('#108: „stark“ lässt normale Sprache durch (vorher bei 0.035 → man hörte niemanden)', () => {
  for (const speech of [0.015, 0.02, 0.03]) assert.equal(gateStep(speech, 'stark', 1000, 0).open, true, `Sprache RMS ${speech}`);
  assert.equal(gateStep(0.003, 'stark', 1000, 0).open, false); // leises Rauschen bleibt draußen
});

test('#108: geschlossenes Gate dämpft weich, aber nie auf völlige Stille', () => {
  assert.equal(gateGain(0.3, true), 1); // Sprechen → sofort voll
  let g = 1;
  const seen = [];
  for (let i = 0; i < 10; i++) seen.push((g = gateGain(g, false)));
  assert.ok(seen[0] < 1 && seen[0] > GATE_FLOOR); // weicher Übergang, kein harter Schnitt
  assert.equal(seen.at(-1), GATE_FLOOR);
  assert.ok(GATE_FLOOR > 0); // nie 0 → falsch eingestufte Sprache bleibt hörbar
  assert.equal(gateGain(undefined, false) < 1, true);
});
