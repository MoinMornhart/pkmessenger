'use strict';

// Unscharfe Namenssuche (Issue #1: „Namen-Erkennung muss funktionieren … egal ob groß oder klein, auch ähnliche“).
// Findet: Anfang, Wortanfang, irgendwo im Namen, Buchstaben in der richtigen Reihenfolge („mmh“ → MoinMornhart)
// und kleine Tippfehler („Mornhrat“ → Mornhart). Umlaute/Akzente und Zahlen-Ersatz (M0in → Moin) werden angeglichen.

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };

/** „Mörn_Härt 07“ → „mornhart ot“-artig: klein, ohne Akzente, ß→ss, Sonderzeichen → Leerzeichen. */
function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[01345 7@$]/g, (c) => (c === ' ' ? ' ' : LEET[c] || c))
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tippfehler-Abstand (Levenshtein), bricht ab, sobald er größer als max wird. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Wie gut passt query zu text? -1 = gar nicht, sonst höher = besser (100 = genau). */
function fuzzyScore(query, text) {
  const q = normalize(query).replace(/ /g, '');
  if (!q) return 0;
  const t = normalize(text);
  const flat = t.replace(/ /g, '');
  if (!flat) return -1;
  if (flat === q) return 100;
  if (flat.startsWith(q)) return 90;
  if (t.split(' ').some((w) => w.startsWith(q))) return 80;
  if (flat.includes(q)) return 70;
  // Buchstaben in Reihenfolge (Abkürzungen): „mmh“ → m…m…h
  let i = 0;
  for (const ch of flat) if (ch === q[i]) i += 1;
  if (i === q.length && q.length >= 3) return 50 - Math.min(20, flat.length - q.length);
  // kleine Tippfehler – gegen den Anfang des Namens und gegen jedes Wort
  if (q.length >= 4) {
    const max = q.length >= 7 ? 2 : 1;
    const parts = [flat.slice(0, q.length), flat.slice(0, q.length + 1), ...t.split(' ')];
    if (parts.some((p) => editDistance(q, p, max) <= max)) return 40;
  }
  return -1;
}

/** Bester Treffer über mehrere Namen (Anzeigename, Benutzername …). */
function bestScore(query, names) {
  return Math.max(-1, ...names.filter(Boolean).map((n) => fuzzyScore(query, n)));
}

/** Liste filtern + sortieren. getNames(item) → [Name, …] */
function fuzzyFilter(items, query, getNames, limit = Infinity) {
  if (!normalize(query)) return items.slice(0, limit);
  return items
    .map((item, idx) => ({ item, idx, score: bestScore(query, getNames(item)) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .slice(0, limit)
    .map((x) => x.item);
}

module.exports = { normalize, fuzzyScore, bestScore, fuzzyFilter, editDistance };
