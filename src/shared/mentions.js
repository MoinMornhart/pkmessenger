'use strict';

const { ALLOWED_MENTIONS_IDS_MAX } = require('./limits');

// Erkennt Discord-Mention-Tokens im Nachrichtentext.
// <@123> / <@!123> = User, <@&123> = Rolle, <#123> = Kanal, @everyone / @here = Massen-Ping.
const TOKEN_RE = /<@!?(\d{17,20})>|<@&(\d{17,20})>|<#(\d{17,20})>|@(everyone|here)\b/g;

/**
 * Zerlegt Text in Segmente: { type: 'text', value } | { type: 'user'|'role'|'channel', id } | { type: 'everyone'|'here' }
 */
function tokenizeMentions(text) {
  const out = [];
  if (typeof text !== 'string' || text.length === 0) return out;
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    if (m[1]) out.push({ type: 'user', id: m[1] });
    else if (m[2]) out.push({ type: 'role', id: m[2] });
    else if (m[3]) out.push({ type: 'channel', id: m[3] });
    else out.push({ type: m[4] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

function containsMassMention(text) {
  return /@(everyone|here)\b/.test(text || '');
}

/**
 * Wandelt den Composer-Text (mit lesbaren "@Name"-Platzhaltern) in den finalen Discord-Text um.
 * inserted: [{ display: '@Anna', kind: 'user'|'role'|'channel', id }]
 * Nur Platzhalter, die der Nutzer per Autocomplete eingefügt hat und die noch unverändert im Text stehen,
 * werden ersetzt. Ergebnis enthält die expliziten ID-Listen für allowed_mentions.
 */
function applyMentionTokens(text, inserted) {
  let content = String(text ?? '');
  const users = new Set();
  const roles = new Set();
  // Längste Platzhalter zuerst, damit "@Anna B" nicht von "@Anna" zerschnitten wird.
  const sorted = [...(inserted || [])].sort((a, b) => b.display.length - a.display.length);
  for (const item of sorted) {
    if (!item || typeof item.display !== 'string' || !content.includes(item.display)) continue;
    const token = item.kind === 'user' ? `<@${item.id}>` : item.kind === 'role' ? `<@&${item.id}>` : `<#${item.id}>`;
    content = content.split(item.display).join(token);
  }
  // Auch direkt eingetippte Tokens zählen als bewusste Mentions.
  for (const seg of tokenizeMentions(content)) {
    if (seg.type === 'user') users.add(seg.id);
    if (seg.type === 'role') roles.add(seg.id);
  }
  return { content, users: [...users], roles: [...roles], massMention: containsMassMention(content) };
}

/**
 * Baut das allowed_mentions-Objekt: parse ist IMMER leer, Pings nur für explizit gelistete IDs.
 * @everyone/@here nur, wenn der Nutzer das ausdrücklich bestätigt hat (everyone === true).
 */
function buildAllowedMentions({ users = [], roles = [], everyone = false } = {}) {
  return {
    parse: everyone ? ['everyone'] : [],
    users: users.slice(0, ALLOWED_MENTIONS_IDS_MAX),
    roles: roles.slice(0, ALLOWED_MENTIONS_IDS_MAX),
    repliedUser: false,
  };
}

/**
 * Findet die gerade getippte Mention-Abfrage vor dem Cursor, z. B. "Hallo @an|" → { query: 'an', start: 6 }.
 */
function findMentionQuery(text, caret) {
  const before = String(text ?? '').slice(0, caret);
  const m = /(^|\s)([@#])([^\s@#]{0,32})$/.exec(before);
  if (!m) return null;
  return { trigger: m[2], query: m[3], start: before.length - m[3].length - 1 };
}

// Einzeiliger Klartext für Vorschauen: <@id> → @Name, <#id> → #kanal, Zeilenumbrüche → Leerzeichen.
function toPlainText(content, mentions = {}, channelName = () => null) {
  return tokenizeMentions(content)
    .map((seg) => {
      if (seg.type === 'text') return seg.value;
      if (seg.type === 'user') return `@${(mentions.users || []).find((u) => u.id === seg.id)?.name || 'Unbekannt'}`;
      if (seg.type === 'role') return `@${(mentions.roles || []).find((r) => r.id === seg.id)?.name || 'Rolle'}`;
      if (seg.type === 'channel') return `#${(mentions.channels || []).find((c) => c.id === seg.id)?.name || channelName(seg.id) || 'kanal'}`;
      return `@${seg.type}`;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { toPlainText, tokenizeMentions, containsMassMention, applyMentionTokens, buildAllowedMentions, findMentionQuery };
