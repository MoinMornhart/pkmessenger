'use strict';

// Schutz vor Absturz des ganzen Renderers (Issue #85): Ein globaler keydown-Listener rief `e.key.toLowerCase()`
// auf. Bei manchen Ereignissen (Eingabemethoden/Autofill) ist `event.key` undefined → TypeError → „Ups …“.
// Jeder `.key.toLowerCase()`-Aufruf im Renderer muss gegen undefined abgesichert sein (z. B. `(e.key || '')`).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'src', 'renderer');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.jsx') || e.name.endsWith('.js') ? [path.join(dir, e.name)] : []);
}

test('Kein ungeschütztes event.key.toLowerCase() im Renderer', () => {
  const bad = [];
  for (const f of files(DIR)) {
    const src = fs.readFileSync(f, 'utf8');
    const lines = src.split(/\r?\n/);
    lines.forEach((line, i) => {
      // Treffer: <ident>.key.toLowerCase(), aber NICHT (<ident>.key || '').toLowerCase()
      if (/\w+\.key\.toLowerCase\(\)/.test(line) && !/\(\s*\w+\.key\s*\|\|\s*''\s*\)\.toLowerCase/.test(line)) {
        bad.push(`${path.basename(f)}:${i + 1}  ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(bad, [], `Ungeschütztes .key.toLowerCase() gefunden:\n${bad.join('\n')}`);
});
