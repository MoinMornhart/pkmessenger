'use strict';

// Websuche für die KI (Issue #12): kostenlos, ohne Schlüssel, ohne Konto.
// 1. DuckDuckGo (HTML-Version), 2. Ersatz: Wikipedia-Such-API (offiziell, frei).
// Übertragen wird nur der Suchbegriff. Ergebnisse sind reines Datenmaterial für die KI (nie Anweisungen).

const TIMEOUT_MS = 10000;
const MAX_RESULTS = 5;
const UA = 'PKMessenger (Desktop-App; https://github.com/Morni-Team/pkmessenger)';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" };
function htmlToText(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (ENTITIES[e.toLowerCase()]) return ENTITIES[e.toLowerCase()];
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 31 && n < 0x110000 ? String.fromCodePoint(n) : '';
      }
      return m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** DuckDuckGo-Weiterleitung (//duckduckgo.com/l/?uddg=…) → echte Adresse; nur http(s). */
function realUrl(href) {
  try {
    const u = new URL(href.replace(/&amp;/g, '&'), 'https://duckduckgo.com');
    const target = u.hostname.endsWith('duckduckgo.com') && u.searchParams.get('uddg') ? new URL(u.searchParams.get('uddg')) : u;
    return /^https?:$/.test(target.protocol) ? target.href : null;
  } catch {
    return null;
  }
}

/** Ergebnisse aus der HTML-Seite von DuckDuckGo lesen. */
function parseDuckDuckGo(html) {
  const out = [];
  const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]*class="[^"]*result__a|$)/g;
  let m;
  while ((m = re.exec(html)) && out.length < MAX_RESULTS) {
    const url = realUrl(m[1]);
    if (!url || /duckduckgo\.com\/y\.js/.test(url)) continue; // Werbung
    const snip = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(a|div|td)>/.exec(m[3]);
    out.push({ title: htmlToText(m[2]).slice(0, 200), url: url.slice(0, 500), snippet: htmlToText(snip?.[1]).slice(0, 400) });
  }
  return out;
}

async function getText(fetchImpl, url, init, signal) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetchImpl(url, { ...init, signal: signal ? AbortSignal.any([timeout, signal]) : timeout });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function searchDuckDuckGo(query, { fetchImpl, signal }) {
  const html = await getText(
    fetchImpl,
    'https://html.duckduckgo.com/html/',
    { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA }, body: new URLSearchParams({ q: query, kl: 'de-de' }).toString() },
    signal,
  );
  return parseDuckDuckGo(html);
}

async function searchWikipedia(query, { fetchImpl, signal, lang = 'de' }) {
  const url = `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({ action: 'query', list: 'search', srsearch: query, srlimit: String(MAX_RESULTS), format: 'json', utf8: '1' })}`;
  const json = JSON.parse(await getText(fetchImpl, url, { headers: { 'user-agent': UA } }, signal));
  return (json?.query?.search || []).slice(0, MAX_RESULTS).map((r) => ({
    title: htmlToText(r.title).slice(0, 200),
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(r.title).replace(/ /g, '_'))}`,
    snippet: htmlToText(r.snippet).slice(0, 400),
  }));
}

/** Im Web suchen. Gibt { source, results } zurück; wirft nur, wenn beide Quellen ausfallen. */
async function webSearch(query, { fetchImpl = (...a) => fetch(...a), signal } = {}) {
  const q = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!q) return { source: 'none', results: [] };
  try {
    const results = await searchDuckDuckGo(q, { fetchImpl, signal });
    if (results.length) return { source: 'DuckDuckGo', results };
  } catch (err) {
    if (signal?.aborted) throw err;
  }
  try {
    return { source: 'Wikipedia', results: await searchWikipedia(q, { fetchImpl, signal }) };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { source: 'none', results: [], error: 'Websuche gerade nicht erreichbar.' };
  }
}

/** Ergebnisse als Datenblock für den Prompt. */
function formatResults(query, { source, results, error }) {
  const body = results.length ? results.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n') : error || 'No results.';
  return `<web_results query="${String(query).replace(/"/g, "'").slice(0, 200)}" source="${source}">\n${body}\n</web_results>`;
}

module.exports = { webSearch, formatResults, parseDuckDuckGo, htmlToText, realUrl };
