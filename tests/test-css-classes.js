'use strict';

// Schutz vor verlorenen Styles beim Zusammenführen (error.md #16, #17): Jede feste CSS-Klasse aus den
// Komponenten muss in styles.css vorkommen. Klassen, die bewusst nur als Behälter/Marker dienen, stehen in ALLOWED.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'src', 'renderer');
const ALLOWED = new Set(['ai-people', 'ai-responder', 'rail__logo', 'row']);

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.jsx') ? [path.join(dir, e.name)] : []));
}

test('Alle CSS-Klassen der Komponenten sind in styles.css gestylt', () => {
  const css = fs.readFileSync(path.join(DIR, 'styles.css'), 'utf8');
  const used = new Set();
  for (const f of files(DIR)) {
    const src = fs.readFileSync(f, 'utf8');
    // className="a b c" und feste Teile in className={`a ${x ? 'b' : ''}`}
    for (const m of src.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
      const raw = (m[1] || m[2]).replace(/\$\{[^}]*\}/g, ' ');
      for (const c of raw.split(/\s+/)) if (/^[a-z][a-z0-9]*(?:(?:__|--|-)[a-z0-9]+)*$/.test(c)) used.add(c);
    }
  }
  assert.ok(used.size > 100, `zu wenige Klassen gefunden (${used.size}) – Muster prüfen`);
  const missing = [...used].filter((c) => !ALLOWED.has(c) && !new RegExp(`\\.${c}(?![a-z0-9_-])`).test(css));
  assert.deepEqual(missing, [], `Ohne Styles: ${missing.join(', ')}`);
});
