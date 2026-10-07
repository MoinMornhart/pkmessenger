'use strict';

// Tippanzeige wie bei Discord (Issue #1): bis zu 3 Namen, darüber die Anzahl.
function typingText(names) {
  const n = Array.isArray(names) ? names.filter(Boolean) : [];
  if (n.length === 0) return '';
  if (n.length === 1) return `${n[0]} schreibt …`;
  if (n.length === 2) return `${n[0]} und ${n[1]} schreiben …`;
  if (n.length === 3) return `${n[0]}, ${n[1]} und ${n[2]} schreiben …`;
  return `${n.length} Personen schreiben …`;
}

// Online-Status: der „beste“ Status über alle gemeinsamen Server (online > abwesend > beschäftigt > offline)
const RANK = { online: 3, idle: 2, dnd: 1, offline: 0 };
function bestStatus(list) {
  let best = null;
  for (const s of list) if (s && (best === null || (RANK[s] ?? -1) > (RANK[best] ?? -1))) best = s;
  return best;
}

module.exports = { typingText, bestStatus };
