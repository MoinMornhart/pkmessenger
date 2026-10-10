'use strict';

// #131: eigene Bilder als Chat-Hintergrund, bewegte Vorlagen, Leistungs-Schalter
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sanitizeWallpapers, wallpaperFor, isCustomWall, ANIMATED, WALLPAPERS } = require('../src/shared/wallpapers');

test('Eigene Bilder: nur saubere IDs werden gespeichert', () => {
  assert.equal(isCustomWall('bild:0f8e2c1a-1234-4abc-9def-001122334455'), true);
  for (const bad of ['bild:', 'bild:../../etc', 'bild:ABC', 'javascript:alert(1)', 'url(x)', 42, null]) assert.equal(isCustomWall(bad), false);
  const s = sanitizeWallpapers({ default: 'bild:0f8e2c1a-1234', '123456789012345678': 'aurora', '223456789012345678': 'bild:<script>' });
  assert.deepEqual(s, { default: 'bild:0f8e2c1a-1234', '123456789012345678': 'aurora' });
  assert.equal(wallpaperFor(s, { channelId: '999999999999999999' }), 'bild:0f8e2c1a-1234');
});

test('Bewegte Vorlagen gibt es wirklich, und die Animation ist abschaltbar', () => {
  const ids = new Set(WALLPAPERS.map((w) => w.id));
  for (const id of ANIMATED) assert.ok(ids.has(id), id);
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');
  // Animationen nur mit data-wall-anim="an", und reduzierte Bewegung des Systems wird beachtet
  const animRules = css.match(/[^}]*animation: wall-[^;]+;/g) || [];
  assert.ok(animRules.length >= 3);
  for (const r of animRules) assert.match(r, /data-wall-anim='an'/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.chat\[data-wall\]/);
  assert.match(css, /data-glass='aus'\] \* \{\s*backdrop-filter: none/);
});

test('Bild-Speicher: nur data:-Bilder, Größen- und Typ-Grenzen, nichts geht ins Netz', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'wall-store.js'), 'utf8');
  assert.match(src, /indexedDB\.open/);
  assert.match(src, /startsWith\('data:image\/'\)/);
  assert.match(src, /'image\/png', 'image\/jpeg', 'image\/webp', 'image\/gif'/);
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|api\./);
});
