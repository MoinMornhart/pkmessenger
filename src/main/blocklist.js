'use strict';

// Öffentliche, gepflegte Sperrlisten für den Link-Schutz (Issue #1/#38: „keine hardcodierten Sachen“).
// Geladen werden NUR die Listen selbst (von raw.githubusercontent.com), einmal täglich – die Links aus
// Nachrichten werden NIE an einen Dienst geschickt, geprüft wird immer lokal.
// Zwischenspeicher: %APPDATA%\PKMessenger\link-blocklist.json (funktioniert dadurch auch offline).

const fs = require('node:fs');
const path = require('node:path');

const SOURCES = [
  // Discord-Betrug inkl. IP-Grabber (grabify, iplogger, 2no.co …) – The DSP Project
  { id: 'antiscam', level: 'danger', label: 'Discord-AntiScam', url: 'https://raw.githubusercontent.com/Discord-AntiScam/scam-links/main/list.txt', format: 'lines' },
  // Discord-Phishing (gefälschte Nitro-/Steam-Seiten)
  { id: 'phishing', level: 'danger', label: 'discord-phishing-links', url: 'https://raw.githubusercontent.com/nikolaischunk/discord-phishing-links/main/domain-list.json', format: 'json' },
  // Auffällige, noch nicht bestätigte Domains → nur Warnung
  { id: 'suspicious', level: 'warn', label: 'discord-phishing-links (verdächtig)', url: 'https://raw.githubusercontent.com/nikolaischunk/discord-phishing-links/main/suspicious-list.json', format: 'json' },
  // #110: Krypto-Miner/Cryptojacking (NoCoin-Liste, Hosts-Format „0.0.0.0 domain“)
  { id: 'miner', level: 'miner', label: 'NoCoin (Krypto-Miner)', url: 'https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/hosts.txt', format: 'hosts' },
  // #110: PKMessengers eigene Link-Datenbank (IP-Logger, Kurzlinks, vertraute Seiten, Miner) – erweiterbar per PR
  { id: 'pklists', level: 'extra', label: 'PKMessenger-Link-Datenbank', url: 'https://raw.githubusercontent.com/Morni-Team/pkmessenger/main/src/shared/link-lists.json', format: 'pklists' },
];
const EXTRA_KEYS = ['ipLoggers', 'shorteners', 'trusted', 'miners'];
const MAX_EXTRA = 5000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_DOMAINS = 300000;

const cleanDomain = (d) =>
  String(d || '')
    .trim()
    .toLowerCase()
    .replace(/^(\*\.|www\.)/, '')
    .replace(/\.$/, '');
const validDomain = (d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) && d.length <= 253;

function parse(text, format) {
  let list = [];
  if (format === 'json') {
    try {
      const j = JSON.parse(text);
      list = Array.isArray(j) ? j : Array.isArray(j?.domains) ? j.domains : [];
    } catch {
      list = [];
    }
  } else if (format === 'hosts') {
    // „0.0.0.0 domain“ / „127.0.0.1 domain“ → letztes Feld
    list = String(text)
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*/, '').trim())
      .filter(Boolean)
      .map((l) => l.split(/\s+/).pop());
  } else {
    list = String(text).split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  }
  return list.map(cleanDomain).filter(validDomain).slice(0, MAX_DOMAINS);
}

/** #110: eigene Link-Datenbank lesen – nur bekannte Schlüssel, nur gültige Domains, begrenzt. */
function parseLinkLists(text) {
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const out = {};
  for (const k of EXTRA_KEYS) out[k] = Array.isArray(j[k]) ? [...new Set(j[k].map(cleanDomain).filter(validDomain))].slice(0, MAX_EXTRA) : [];
  return out;
}

function createBlocklist({ dir, fetchImpl = (...a) => fetch(...a), now = () => Date.now(), emit = () => {} }) {
  const file = dir ? path.join(dir, 'link-blocklist.json') : null;
  let data = { at: 0, sources: {}, danger: [], warn: [], miner: [], extra: null, error: null };

  try {
    if (file && fs.existsSync(file)) data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    /* kaputter Zwischenspeicher → neu laden */
  }

  const status = () => ({ at: data.at || null, sources: data.sources, total: data.danger.length + data.warn.length + (data.miner?.length || 0), error: data.error || null });

  /** Listen neu laden (nur wenn älter als 24 h, außer force). Fehler einer Liste blockieren die anderen nicht. */
  async function update({ force = false } = {}) {
    if (!force && data.at && now() - data.at < MAX_AGE_MS) return status();
    const danger = new Set();
    const warn = new Set();
    const miner = new Set();
    let extra = null;
    const sources = {};
    const errors = [];
    for (const s of SOURCES) {
      try {
        const res = await fetchImpl(s.url, { headers: { 'user-agent': 'PKMessenger-LinkGuard' }, signal: AbortSignal.timeout(20000), redirect: 'error' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (s.format === 'pklists') {
          extra = parseLinkLists(text);
          if (!extra) throw new Error('ungültiges Format');
          sources[s.id] = { label: s.label, count: EXTRA_KEYS.reduce((n, k) => n + extra[k].length, 0) };
          continue;
        }
        const domains = parse(text, s.format);
        for (const d of domains) (s.level === 'danger' ? danger : s.level === 'miner' ? miner : warn).add(d);
        sources[s.id] = { label: s.label, count: domains.length };
      } catch (err) {
        errors.push(`${s.label}: ${err?.message || err}`);
        if (data.sources?.[s.id]) sources[s.id] = { ...data.sources[s.id], stale: true }; // alte Daten behalten
      }
    }
    // Nur übernehmen, wenn wirklich etwas geladen wurde – sonst den alten Stand behalten
    if (danger.size + warn.size + miner.size > 0 || extra) {
      for (const d of danger) {
        warn.delete(d);
        miner.delete(d);
      }
      data = { at: now(), sources, danger: [...danger], warn: [...warn], miner: [...miner], extra: extra || data.extra || null, error: errors.length ? errors.join('; ') : null };
      try {
        if (file) {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
          fs.renameSync(`${file}.tmp`, file);
        }
      } catch {
        /* Zwischenspeicher nicht schreibbar – gilt bis zum Neustart */
      }
      emit('blocklist', status());
    } else {
      data = { ...data, error: errors.join('; ') || 'Keine Liste erreichbar.' };
    }
    return status();
  }

  /** Für die Oberfläche: komplette Listen (einmal pro Start, ~1–2 MB). */
  function get() {
    return { danger: data.danger, warn: data.warn, miner: data.miner || [], extra: data.extra || null, ...status() };
  }

  return { update, get, status, SOURCES };
}

module.exports = { createBlocklist, parse, parseLinkLists, SOURCES };
