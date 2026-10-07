'use strict';

// Link-Schutz (Issue #38: „IP-Grabber blocken und intelligent erkennen, Trusted Links“).
// Läuft komplett lokal: keine Anfrage an fremde Dienste (sonst würde gerade das Prüfen die IP verraten).
// Stufen: 'trusted' (bekannt sicher) · 'ok' (normal) · 'unknown' (Ziel versteckt, z. B. Kurzlink) · 'warn' (verdächtig) · 'danger' (IP-Grabber/Betrug)

// Bekannte IP-Logger/Grabber-Dienste und ihre Ausweich-Domains (Stand 10/2026, öffentlich dokumentiert)
const IP_LOGGERS = [
  'grabify.link', 'grabify.org', 'grabify.icu', 'iplogger.org', 'iplogger.com', 'iplogger.ru', 'iplogger.co', 'iplogger.info', 'iplis.ru', '2no.co', 'yip.su',
  'blasze.com', 'blasze.tk', 'ps3cfw.com', 'urlz.fr', 'bmwforum.co', 'leancoding.co', 'spottyfly.com', 'stopify.co', 'yoütu.be', 'xn--yotu-1ra.be', 'quickmessage.us',
  'shrekis.life', 'gamingfun.me', 'catsnthings.fun', 'curiouscat.club', 'joinmy.site', 'fortnitechat.site', 'fortnight.space', 'freegiftcards.co', 'stopify.co',
  'headshot.monster', 'gaming-at-my.best', 'progaming.monster', 'yourmy.monster', 'screenshare.host', 'imageshare.best', 'screenshot.best', 'gamingfun.me',
  'myprivate.pics', 'locations.quest', 'lovebird.guru', 'trulove.guru', 'dateing.club', 'otherhalf.life', 'shrekis.life', 'datasig.io', 'datauth.io',
  'ipgrabber.ru', 'ipgraber.ru', 'iptrace.ru', 'canarytokens.com', 'webresolver.nl', 'ip-tracker.org', 'whatstheirip.com', 'hackerrank.cc',
];
// Kurzlink-Dienste: das echte Ziel ist nicht sichtbar
const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'ow.ly', 'cutt.ly', 'rebrand.ly', 'shorturl.at', 'tiny.cc', 'rb.gy', 'v.gd', 'buff.ly', 'adf.ly', 'shorte.st', 'bl.ink', 'lnkd.in', 't.ly', 's.id', 'qr.ae', 'clck.ru', 'u.to'];
// Bekannte, seriöse Seiten (Startliste; eigene vertraute Seiten kommen aus den Einstellungen dazu)
const TRUSTED = [
  'discord.com', 'discord.gg', 'discordapp.com', 'discordapp.net', 'discord.media', 'github.com', 'githubusercontent.com', 'youtube.com', 'youtu.be', 'google.com',
  'wikipedia.org', 'tenor.com', 'giphy.com', 'twitch.tv', 'spotify.com', 'reddit.com', 'x.com', 'twitter.com', 'instagram.com', 'tiktok.com', 'steampowered.com',
  'steamcommunity.com', 'microsoft.com', 'apple.com', 'amazon.de', 'amazon.com', 'mozilla.org', 'stackoverflow.com', 'npmjs.com', 'electronjs.org', 'anthropic.com',
  'claude.ai', 'openai.com', 'duckduckgo.com', 'heise.de', 'tagesschau.de', 'spiegel.de', 'zeit.de',
  // offizielle Domains der geprüften Marken (sonst würden sie als „enthält Marke“ markiert)
  'github.io', 'roblox.com', 'paypal.com', 'paypal.de', 'epicgames.com', 'googleusercontent.com', 'gstatic.com', 'google.de', 'youtube-nocookie.com', 'live.com', 'office.com', 'steamstatic.com', 'twitchcdn.net', 'cdninstagram.com',
];
// Marken, die Betrüger gern nachmachen (Tippfehler-Domains wie „dlscord“, „discorcl“, „steamcommunlty“)
const BRANDS = ['discord', 'steamcommunity', 'steampowered', 'github', 'youtube', 'twitch', 'paypal', 'google', 'microsoft', 'epicgames', 'roblox', 'spotify', 'instagram'];
const SCAM_WORDS = /(free-?nitro|nitro-?(gift|free|drop)|gift-?nitro|discord-?(gift|nitro|airdrop|app\.|give)|steam-?(gift|trade|offer)|airdrop|claim-?(reward|gift))/i;

const lower = (s) => String(s || '').toLowerCase();
/** Gehört host zu domain (genau oder Subdomain)? */
const isOrSub = (host, domain) => host === domain || host.endsWith(`.${domain}`);
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

  if (IP_LOGGERS.some((d) => isOrSub(host, d))) return { level: 'danger', host, reasons: ['Bekannter IP-Grabber: Wer draufklickt, verrät seine IP-Adresse und oft auch Gerät und ungefähren Ort.'] };
  if (/(^|[.-])(grabify|iplogger|ipgrab|iptrack|ip-?logger|ip-?grab)/.test(host)) return { level: 'danger', host, reasons: ['Die Adresse sieht nach einem IP-Logger aus.'] };

  // Öffentliche, täglich aktualisierte Sperrlisten (Betrug, Phishing, IP-Grabber) – Host und alle Oberdomains prüfen
  if (lists) {
    const parts = host.split('.');
    const candidates = parts.map((_, i) => parts.slice(i).join('.')).filter((d) => d.includes('.'));
    if (candidates.some((d) => lists.danger?.has(d))) return { level: 'danger', host, reasons: ['Steht auf einer öffentlichen Sperrliste für Betrug, Phishing und IP-Grabber.'], listed: true };
    if (candidates.some((d) => lists.warn?.has(d))) return { level: 'warn', host, reasons: ['Steht auf einer öffentlichen Liste verdächtiger Seiten.'], listed: true };
  }

  const trusted = [...TRUSTED, ...trustedExtra.map(lower)].some((d) => d && isOrSub(host, d));
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
    if (flatHost.includes(brand) && !TRUSTED.some((d) => isOrSub(host, d))) reasons.push(`Enthält „${brand}“, gehört aber nicht zur echten Seite.`);
  }
  if (SCAM_WORDS.test(host + u.pathname)) return { level: 'danger', host, reasons: [...reasons, 'Typischer Betrugs-Link („gratis Nitro“, „Geschenk“, „Airdrop“).'] };

  if (host.split('.').some((p) => p.startsWith('xn--'))) reasons.push('Die Adresse enthält ungewöhnliche Schriftzeichen (kann eine bekannte Seite nachahmen).');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) reasons.push('Der Link zeigt auf eine nackte IP-Adresse.');
  if (u.protocol === 'http:') reasons.push('Keine verschlüsselte Verbindung (http).');
  if (u.username || u.password) reasons.push('Im Link stecken versteckte Zugangsdaten (Trick, um die echte Adresse zu verschleiern).');
  if (reasons.length) return { level: 'warn', host, reasons };

  if (SHORTENERS.some((d) => isOrSub(host, d))) return { level: 'unknown', host, reasons: ['Kurzlink: Wohin er wirklich führt, ist nicht zu sehen (beliebter Trick für IP-Grabber).'] };
  return { level: 'ok', host, reasons: [] };
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

module.exports = { checkLink, checkMessageLinks, trustKey, IP_LOGGERS, SHORTENERS, TRUSTED };
