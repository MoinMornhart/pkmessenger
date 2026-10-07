'use strict';

// Schutz: Jede Funktion, die preload.js per call('pk:…') anbietet, muss auch in der Renderer-Hülle (api.js) stehen.
// Sonst meldet die Oberfläche „api.xyz is not a function“ (passiert bei aiModels/aiFindLocal, 07.10.2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('preload.js und renderer/api.js bieten dieselben Aufrufe an', () => {
  const preload = [...read('src/preload/preload.js').matchAll(/^\s*(\w+): call\('pk:[\w-]+'\)/gm)].map((m) => m[1]);
  const apiSrc = read('src/renderer/api.js');
  const listed = new Set([...apiSrc.slice(apiSrc.indexOf('Object.fromEntries')).matchAll(/^\s*'(\w+)',?$/gm)].map((m) => m[1]));
  assert.ok(preload.length > 50, 'preload.js nicht gelesen');
  const missing = preload.filter((n) => !listed.has(n));
  assert.deepEqual(missing, [], `In api.js fehlen: ${missing.join(', ')}`);
});

test('Jedes Ereignis, das Main an die Oberfläche schickt, lässt preload.js auch durch', () => {
  const allowed = new Set([...read('src/preload/preload.js').matchAll(/^\s*'([a-z:-]+)',$/gm)].map((m) => m[1]));
  const files = fs.readdirSync(path.join(__dirname, '..', 'src', 'main')).filter((f) => f.endsWith('.js') && !['demo.js', 'screenshots.js', 'updater.js'].includes(f));
  const emitted = new Set();
  for (const f of files) for (const m of read(`src/main/${f}`).matchAll(/\bemit\('([a-z][a-z:-]+)'/g)) emitted.add(m[1]);
  const missing = [...emitted].filter((t) => !allowed.has(t));
  assert.deepEqual(missing, [], `In preload.js (EVENT_TYPES) fehlen: ${missing.join(', ')}`);
});
