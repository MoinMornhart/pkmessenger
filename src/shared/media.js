'use strict';

// Medien in Nachrichten (Issue #1: „GIFs und Videos laden nicht“ + Sicherheitseinstellung).
// Geladen wird NUR über Discords eigene Server/Proxys (cdn.discordapp.com, media.discordapp.net, images-ext-*.discordapp.net).
// Fremde Webseiten bekommen dadurch nie die IP-Adresse – Discord sieht sie ohnehin (wie in der normalen Discord-App).

const DISCORD_MEDIA = /^https:\/\/(cdn\.discordapp\.com|[a-z0-9-]+\.discordapp\.net)\//i;
const MEDIA_MODES = ['fragen', 'immer', 'nie'];

const isDiscordMedia = (url) => typeof url === 'string' && DISCORD_MEDIA.test(url);

/** Anhang → 'image' | 'gif' | 'video' | null (Datei) */
function attachmentKind(a) {
  if (!a || !isDiscordMedia(a.url)) return null;
  const type = String(a.contentType || '').toLowerCase();
  const name = String(a.name || '').toLowerCase();
  if (type === 'image/gif' || name.endsWith('.gif')) return 'gif';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/') && /\/(mp4|webm|quicktime)$/.test(type)) return 'video';
  return null;
}

/** Embed → { kind: 'gifv' | 'video' | 'image', src, poster } oder null. Nur Proxy-Adressen. */
function embedMedia(e) {
  if (!e) return null;
  if (e.video && isDiscordMedia(e.video)) return { kind: e.type === 'gifv' ? 'gifv' : 'video', src: e.video, poster: isDiscordMedia(e.thumbnail) ? e.thumbnail : null };
  if (e.image && isDiscordMedia(e.image)) return { kind: 'image', src: e.image };
  if ((e.type === 'image' || e.type === 'gifv') && isDiscordMedia(e.thumbnail)) return { kind: 'image', src: e.thumbnail };
  return null;
}

/** Link-Ziel für die Warnung: Domain, und ob sie verdächtig aussieht (IP-Adresse, Punycode, kein https). */
function describeLink(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const warnings = [];
    if (u.protocol !== 'https:') warnings.push('Keine verschlüsselte Verbindung (http).');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) warnings.push('Der Link zeigt auf eine nackte IP-Adresse.');
    if (host.split('.').some((p) => p.startsWith('xn--'))) warnings.push('Die Adresse enthält ungewöhnliche Schriftzeichen (kann eine bekannte Seite nachahmen).');
    return { host, warnings };
  } catch {
    return { host: '', warnings: ['Ungültiger Link.'] };
  }
}

module.exports = { MEDIA_MODES, isDiscordMedia, attachmentKind, embedMedia, describeLink };
