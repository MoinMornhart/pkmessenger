'use strict';

// Issue #12: KI-Limits als Einstellung – automatisch an bei Cloud-Anbietern, aus bei lokalen Modellen
const test = require('node:test');
const assert = require('node:assert/strict');
const { isLocalAddress, limitsActive } = require('../src/shared/ai-limits');
const { validators } = require('../src/main/validate');

test('Lokale Adressen werden erkannt', () => {
  for (const u of ['http://localhost:11434/v1', 'http://127.0.0.1:1234/v1', 'http://[::1]:11434/v1', 'http://192.168.1.20:11434/v1', 'http://10.0.0.5/v1', 'http://172.20.0.2:8080/v1', 'http://ki.local:11434/v1']) {
    assert.equal(isLocalAddress(u), true, u);
  }
  for (const u of ['https://api.openai.com/v1', 'https://api.anthropic.com/v1', 'https://openrouter.ai/api/v1', 'http://172.32.0.1/v1', 'kein-link']) {
    assert.equal(isLocalAddress(u), false, u);
  }
});

test('Modus auto/an/aus', () => {
  assert.equal(limitsActive({ mode: 'auto' }, 'https://api.openai.com/v1'), true);
  assert.equal(limitsActive({ mode: 'auto' }, 'http://localhost:11434/v1'), false);
  assert.equal(limitsActive({ mode: 'an' }, 'http://localhost:11434/v1'), true);
  assert.equal(limitsActive({ mode: 'aus' }, 'https://api.openai.com/v1'), false);
  assert.equal(limitsActive(undefined, 'https://api.openai.com/v1'), true); // alte Einstellungen ohne Modus
});

test('Validierung: Modus optional, Standard auto', () => {
  assert.deepEqual(validators.aiLimits({ perHour: 5, perDay: 50 }), { mode: 'auto', perHour: 5, perDay: 50 });
  assert.deepEqual(validators.aiLimits({ mode: 'aus', perHour: 5, perDay: 50 }), { mode: 'aus', perHour: 5, perDay: 50 });
  assert.throws(() => validators.aiLimits({ mode: 'egal', perHour: 5, perDay: 50 }), /Limit-Modus/);
});
