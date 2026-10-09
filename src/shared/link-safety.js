'use strict';

// Link-Schutz (Issue #38: „IP-Grabber blocken und intelligent erkennen, Trusted Links“).
// Läuft komplett lokal: keine Anfrage an fremde Dienste (sonst würde gerade das Prüfen die IP verraten).
// Stufen: 'trusted' (bekannt sicher) · 'ok' (normal) · 'unknown' (Ziel versteckt, z. B. Kurzlink) · 'warn' (verdächtig) · 'danger' (IP-Grabber/Betrug)

// #110: Keine fest eingebauten Listen mehr im Code. Die Link-Datenbank liegt in ./link-lists.json:
// sie wird mit der App ausgeliefert (Notfall/offline) UND täglich frisch aus dem Repo geladen (src/main/blocklist.js),
// sodass neue IP-Logger, Kurzlink-Dienste oder Miner ohne App-Update dazukommen. Frische Einträge kommen über
// lists.extra herein und ergänzen die eingebauten.
const BUILTIN = require('./link-lists.json');
// Bekannte IP-Logger/Grabber-Dienste und ihre Ausweich-Domains
const IP_LOGGERS = BUILTIN.ipLoggers;
// Kurzlink-Dienste: das echte Ziel ist nicht sichtbar
const SHORTENERS = BUILTIN.shorteners;
// Bekannte, seriöse Seiten (Startliste; eigene vertraute Seiten kommen aus den Einstellungen dazu)
const TRUSTED = BUILTIN.trusted;
// #110: Krypto-Miner/Cryptojacking-Dienste (nutzen heimlich die Rechenleistung der Besucher)
const MINERS = BUILTIN.miners;
// Typische Miner-Skripte/-Pfade, auch auf unbekannten Domains
const MINER_HINT = /(coin-?hive|authedmine|cryptonight|crypto-?loot|webminepool|coinimp|deepminer|xmrig|monero-?miner|cryptonoter|(^|[/.-])miner(\.min)?\.js)/i;
const MINER_REASON = 'Krypto-Miner: Die Seite nutzt heimlich die Rechenleistung deines PCs oder Handys zum Schürfen von Kryptogeld (frisst Akku und Strom, Lüfter läuft hoch).';
// Marken, die Betrüger gern nachmachen (Tippfehler-Domains wie „dlscord“, „discorcl“, „steamcommunlty“)
const BRANDS = ['discord', 'steamcommunity', 'steampowered', 'github', 'youtube', 'twitch', 'paypal', 'google', 'microsoft', 'epicgames', 'roblox', 'spotify', 'instagram'];
const SCAM_WORDS = /(free-?nitro|nitro-?(gift|free|drop)|gift-?nitro|discord-?(gift|nitro|airdrop|app\.|give)|steam-?(gift|trade|offer)|airdrop|claim-?(reward|gift))/i;

const lower = (s) => String(s || '').toLowerCase();
/** Gehört host zu domain (genau oder Subdomain)? */
const isOrSub = (host, domain) => host === domain || host.endsWith(`.${domain}`);
/** Frische Einträge aus der täglich geladenen Datenbank (lists.extra) an die eingebauten anhängen. */
const withExtra = (builtin, lists, key) => (Array.isArray(lists?.extra?.[key]) && lists.extra[key].length ? [...builtin, ...lists.extra[key]] : builtin);
/** Hauptdomain grob: letzte zwei Teile (für .co.uk usw. reicht das hier). */
const baseOf = (host) => host.split('.').slice(-2).join('.');

/** Optisch verwechselbare Zeichen angleichen: „rn“→m, „cl“→d, „vv“→w, 0→o, 1/l/I→i, 3→e, 5→s. */
function confusable(s) {
  return s.replace(/rn/g, 'm').replace(/cl/g, 'd').replace(/vv/g, 'w').replace(/0/g, 'o').replace(/[1l|]/g, 'i').replace(/3/g, 'e').replace(/5/g, 's');
}

function editDistance(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/**
 * Link prüfen. trustedExtra: eigene vertraute Domains aus den Einstellungen.
 * @returns {{ level: 'trusted'|'ok'|'unknown'|'warn'|'danger', host: string, reasons: string[] }}
 */
/**
 * lists: { danger: Set, warn: Set } aus den öffentlichen Sperrlisten (src/main/blocklist.js), optional.
 */
function checkLink(url, trustedExtra = [], lists = null) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { level: 'warn', host: '', reasons: ['Ungültiger Link.'] };
  }
  const host = lower(u.hostname).replace(/\.$/, '');
  const reasons = [];
  if (!/^https?:$/.test(u.protocol)) return { level: 'danger', host, reasons: ['Kein normaler Web-Link (könnte ein Programm starten).'] };

  const ipLoggers = withExtra(IP_LOGGERS, lists, 'ipLoggers');
  if (ipLoggers.some((d) => isOrSub(host, d))) return { level: 'danger', host, reasons: ['Bekannter IP-Grabber: Wer draufklickt, verrät seine IP-Adresse und oft auch Gerät und ungefähren Ort.'] };
  if (/(^|[.-])(grabify|iplogger|ipgrab|iptrack|ip-?logger|ip-?grab)/.test(host)) return { level: 'danger', host, reasons: ['Die Adresse sieht nach einem IP-Logger aus.'] };

  // Host und alle Oberdomains (für Listen-Abgleich)
  const parts = host.split('.');
  const candidates = parts.map((_, i) => parts.slice(i).join('.')).filter((d) => d.includes('.'));

  // #110: Krypto-Miner – eingebaute + frische Datenbank + öffentliche NoCoin-Liste, dazu typische Miner-Skripte im Pfad
  const miners = withExtra(MINERS, lists, 'miners');
  if (miners.some((d) => isOrSub(host, d)) || candidates.some((d) => lists?.miner?.has?.(d)) || MINER_HINT.test(host + u.pathname)) {
    return { level: 'danger', host, reasons: [MINER_REASON], miner: true };
  }

  // Öffentliche, täglich aktualisierte Sperrlisten (Betrug, Phishing, IP-Grabber)
  if (lists) {
    if (candidates.some((d) => lists.danger?.has(d))) return { level: 'danger', host, reasons: ['Steht auf einer öffentlichen Sperrliste für Betrug, Phishing und IP-Grabber.'], listed: true };
    if (candidates.some((d) => lists.warn?.has(d))) return { level: 'warn', host, reasons: ['Steht auf einer öffentlichen Liste verdächtiger Seiten.'], listed: true };
  }

  const trustedAll = withExtra(TRUSTED, lists, 'trusted');
  const trusted = [...trustedAll, ...trustedExtra.map(lower)].some((d) => d && isOrSub(host, d));
  if (trusted) return { level: 'trusted', host, reasons: [] };

  // Nachgemachte Marken: „dlscord.com“, „discorcl.gift“, „steamcommunlty.com“, „discord-nitro.xyz“
  const label = baseOf(host).split('.')[0];
  const flatHost = host.replace(/[^a-z0-9]/g, '');
  const look = confusable(label);
  for (const brand of BRANDS) {
    const tooClose = editDistance(label, brand) <= (brand.length >= 9 ? 2 : 1) || editDistance(look, confusable(brand)) <= 1;
    if (label !== brand && label.length >= 5 && tooClose) {
      reasons.push(`Sieht aus wie „${brand}“, ist es aber nicht (Tippfehler-Trick).`);
      return { level: 'danger', host, reasons };
    }
    if (flatHost.includes(brand) && !trustedAll.some((d) => isOrSub(host, d))) reasons.push(`Enthält „${brand}“, gehört aber nicht zur echten Seite.`);
  }
  if (SCAM_WORDS.test(host + u.pathname)) return { level: 'danger', host, reasons: [...reasons, 'Typischer Betrugs-Link („gratis Nitro“, „Geschenk“, „Airdrop“).'] };

  if (host.split('.').some((p) => p.startsWith('xn--'))) reasons.push('Die Adresse enthält ungewöhnliche Schriftzeichen (kann eine bekannte Seite nachahmen).');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) reasons.push('Der Link zeigt auf eine nackte IP-Adresse.');
  if (u.protocol === 'http:') reasons.push('Keine verschlüsselte Verbindung (http).');
  if (u.username || u.password) reasons.push('Im Link stecken versteckte Zugangsdaten (Trick, um die echte Adresse zu verschleiern).');
  if (reasons.length) return { level: 'warn', host, reasons };

  if (withExtra(SHORTENERS, lists, 'shorteners').some((d) => isOrSub(host, d))) return { level: 'unknown', host, reasons: ['Kurzlink: Wohin er wirklich führt, ist nicht zu sehen (beliebter Trick für IP-Grabber).'] };

  // #95: Structural analysis (no list needed). IP grabbers constantly switch to fresh domains, so blocklists alone
  // never keep up. Instead we look at the SHAPE of the link: an opaque random code as the only path segment,
  // hostnames that read like redirect/link services, and embedded redirect targets.
  const t = trackingSignals(u, host);
  if (t.score >= 2) return { level: 'warn', host, reasons: t.reasons, heuristic: true };
  if (t.score === 1) return { level: 'unknown', host, reasons: t.reasons, heuristic: true };
  return { level: 'ok', host, reasons: [] };
}

// Words that typically appear in redirect / link-shortener / logger hostnames
const LINKY_HOST = /(url|link|lnk|short|tiny|click|redir|track|trk|grab|logger|iplog|geo|trace|2no|cutt|snip)/;
// Path parts typical for tracking pixels / click counters
const TRACKY_PATH = /\/(track|trk|log|pixel|px|beacon|click|redirect|redir|r|c|go|out)(\/|$)/i;
// Query parameters that carry a second (hidden) target URL
const REDIRECT_PARAM = /^(url|u|redirect|redirect_uri|redir|to|next|dest|destination|target|goto|link|out)$/i;

/**
 * #95: Heuristic score for "this link probably hides its real target or logs the visitor".
 * Pure function, runs locally – the link is never fetched (fetching would already leak the IP).
 * @returns {{ score: number, reasons: string[] }}
 */
function trackingSignals(u, host) {
  const reasons = [];
  let score = 0;
  const segments = u.pathname.split('/').filter(Boolean);
  // 1) Only one short opaque code as the path ("/2pZms", "/aB3x9"): mixed case or letters+digits
  if (segments.length === 1) {
    const s = segments[0];
    const opaque = /^[A-Za-z0-9_-]{3,12}$/.test(s) && ((/[a-z]/.test(s) && /[A-Z]/.test(s)) || (/[A-Za-z]/.test(s) && /\d/.test(s)));
    if (opaque) {
      score += 2;
      reasons.push('Der Link besteht nur aus einem kurzen Zufallscode – typisch für Kurzlinks und IP-Logger. Wohin er wirklich führt, ist nicht zu sehen.');
    }
  }
  // 2) Hostname reads like a link/redirect/logger service ("urlto.me", "clicktrk.io")
  const label = baseOf(host).split('.')[0];
  if (LINKY_HOST.test(label)) {
    score += 1;
    reasons.push('Der Name der Seite klingt nach einem Weiterleitungs- oder Kurzlink-Dienst.');
  }
  // 3) Tracking-ish path ("/track/…", "/r/…", "/pixel")
  if (TRACKY_PATH.test(u.pathname)) {
    score += 1;
    reasons.push('Der Pfad sieht nach einem Klick-Zähler oder Tracking-Pixel aus.');
  }
  // 4) A second, hidden target inside the query (?url=https://…)
  for (const [k, v] of u.searchParams) {
    if (REDIRECT_PARAM.test(k) && /^(https?:)?\/\//i.test(v)) {
      score += 2;
      reasons.push('Im Link steckt eine Weiterleitung auf eine andere Adresse.');
      break;
    }
  }
  return { score, reasons };
}

/** Alle Links einer Nachricht prüfen → schlimmste Stufe zuerst. */
const RANK = { danger: 4, warn: 3, unknown: 2, ok: 1, trusted: 0 };
function checkMessageLinks(content, trustedExtra = [], lists = null) {
  const urls = String(content || '').match(/https?:\/\/[^\s<>()]+/gi) || [];
  return urls.map((url) => ({ url, ...checkLink(url, trustedExtra, lists) })).sort((a, b) => RANK[b.level] - RANK[a.level]);
}

/** Domain für „vertrauen“ normalisieren: nur Hostname, ohne www. */
function trustKey(host) {
  return lower(host).replace(/^www\./, '').slice(0, 253);
}

module.exports = { checkLink, checkMessageLinks, trustKey, trackingSignals, IP_LOGGERS, SHORTENERS, TRUSTED, MINERS };
