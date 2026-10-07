'use strict';

// Text markieren → Fett, Kursiv, … (Issue #1: „Hover-Menü mit den Formatierungen“)
// Discord-Markdown: **fett**, *kursiv*, __unterstrichen__, ~~durchgestrichen~~, `code`, ```block```, ||spoiler||, > zitat
const MARKS = {
  bold: '**',
  italic: '*',
  underline: '__',
  strike: '~~',
  code: '`',
  spoiler: '||',
};

/**
 * Formatiert die Markierung (oder entfernt die Formatierung, wenn sie schon da ist).
 * @returns {{ text: string, start: number, end: number }} neuer Text + neue Markierung
 */
function applyFormat(text, start, end, kind) {
  const s = Math.max(0, Math.min(start, end));
  const e = Math.min(text.length, Math.max(start, end));
  const before = text.slice(0, s);
  const sel = text.slice(s, e);
  const after = text.slice(e);

  if (kind === 'quote') {
    // Jede markierte Zeile mit „> “ beginnen lassen (oder wieder entfernen)
    const lineStart = before.lastIndexOf('\n') + 1;
    const block = text.slice(lineStart, e);
    const lines = block.split('\n');
    const quoted = lines.every((l) => l.startsWith('> '));
    const next = lines.map((l) => (quoted ? l.slice(2) : `> ${l}`)).join('\n');
    return { text: text.slice(0, lineStart) + next + after, start: lineStart, end: lineStart + next.length };
  }

  // Code über mehrere Zeilen → Codeblock
  const mark = kind === 'code' && sel.includes('\n') ? '```' : MARKS[kind];
  if (!mark) return { text, start: s, end: e };
  const nl = mark === '```' ? '\n' : '';

  // Schon formatiert? (Marker direkt um die Markierung oder innerhalb) → entfernen
  if (before.endsWith(mark + nl) && after.startsWith(nl + mark)) {
    const b = before.slice(0, before.length - mark.length - nl.length);
    return { text: b + sel + after.slice(mark.length + nl.length), start: b.length, end: b.length + sel.length };
  }
  if (sel.length >= mark.length * 2 && sel.startsWith(mark) && sel.endsWith(mark)) {
    const inner = sel.slice(mark.length, sel.length - mark.length);
    return { text: before + inner + after, start: s, end: s + inner.length };
  }
  // Kursiv (*) darf nicht als Teil von fett (**) erkannt werden – oben schon ausgeschlossen, da exakte Marker verglichen werden
  const wrapped = mark + nl + sel + nl + mark;
  return { text: before + wrapped + after, start: s + mark.length + nl.length, end: s + mark.length + nl.length + sel.length };
}

const FORMAT_BUTTONS = [
  { kind: 'bold', label: 'F', title: 'Fett (Strg+B)' },
  { kind: 'italic', label: 'K', title: 'Kursiv (Strg+I)' },
  { kind: 'underline', label: 'U', title: 'Unterstrichen (Strg+U)' },
  { kind: 'strike', label: 'S', title: 'Durchgestrichen' },
  { kind: 'code', label: '</>', title: 'Code' },
  { kind: 'spoiler', label: '👁', title: 'Spoiler (verdeckt)' },
  { kind: 'quote', label: '❝', title: 'Zitat' },
];

module.exports = { applyFormat, FORMAT_BUTTONS, MARKS };
