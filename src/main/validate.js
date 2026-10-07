'use strict';

const { isSnowflake } = require('../shared/snowflake');
const { parseInviteCode } = require('../shared/invites');
const { MESSAGE_CONTENT_MAX, MESSAGES_PER_FETCH_MAX, ALLOWED_MENTIONS_IDS_MAX, UPLOAD_MAX_BYTES, EMBEDS_PER_MESSAGE_MAX, EMBED_TOTAL_CHARS_MAX, FILES_PER_MESSAGE_MAX } = require('../shared/limits');

// Jeder IPC-Payload aus dem Renderer wird hier geprüft, bevor er discord.js erreicht.
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION';
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
}

function obj(payload) {
  if (!isPlainObject(payload)) throw new ValidationError('Ungültige Anfrage (kein Objekt).');
  return payload;
}

function snowflake(value, field) {
  if (!isSnowflake(value)) throw new ValidationError(`Ungültige ID im Feld "${field}".`);
  return value;
}

function optionalSnowflake(value, field) {
  return value === undefined || value === null ? undefined : snowflake(value, field);
}

function idList(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > ALLOWED_MENTIONS_IDS_MAX) throw new ValidationError(`Ungültige Liste "${field}".`);
  return [...new Set(value.map((v) => snowflake(v, field)))];
}

function mentionsOf(mentions) {
  const m = mentions === undefined ? {} : obj(mentions);
  if (m.everyone !== undefined && typeof m.everyone !== 'boolean') throw new ValidationError('Ungültiges Feld "everyone".');
  return { users: idList(m.users, 'users'), roles: idList(m.roles, 'roles'), everyone: m.everyone === true };
}

// Emoji: Unicode-Emoji (kurz, keine Steuerzeichen) oder eigenes Server-Emoji "name:id"
function isEmojiKey(e) {
  if (typeof e !== 'string' || e.length === 0 || e.length > 64) return false;
  if (/^[A-Za-z0-9_~-]{2,32}:\d{17,20}$/.test(e)) return true;
  return e.length <= 16 && /\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}]/u.test(e) && !/[\s<>:@#`]/.test(e);
}

// F10: Dateien – max. 10 Stück, zusammen max. 25 MiB (Discord-Limit pro Anfrage), sichere Dateinamen
function fileList(files) {
  if (files === undefined) return [];
  if (!Array.isArray(files) || files.length > FILES_PER_MESSAGE_MAX) throw new ValidationError(`Höchstens ${FILES_PER_MESSAGE_MAX} Dateien pro Nachricht.`);
  let total = 0;
  const out = files.map((f) => {
    const { name, data } = obj(f);
    if (!(data instanceof Uint8Array) || data.byteLength === 0) throw new ValidationError('Leere oder ungültige Datei.');
    if (typeof name !== 'string' || name.length === 0 || name.length > 200) throw new ValidationError('Ungültiger Dateiname.');
    total += data.byteLength;
    const safe = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '_');
    return { name: safe, data };
  });
  if (total > UPLOAD_MAX_BYTES) throw new ValidationError('Dateien sind zusammen größer als 25 MiB (Discord-Limit).');
  return out;
}

// F11: Embed-Baukasten – Discord-Limits (Titel 256, Beschreibung 4096, max. 10 Embeds, zusammen 6000 Zeichen)
function embedList(embeds) {
  if (embeds === undefined) return [];
  if (!Array.isArray(embeds) || embeds.length > EMBEDS_PER_MESSAGE_MAX) throw new ValidationError(`Höchstens ${EMBEDS_PER_MESSAGE_MAX} Embeds pro Nachricht.`);
  let chars = 0;
  const url = (v, field) => {
    if (v === undefined || v === '') return undefined;
    try {
      const u = new URL(v);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
      return u.toString();
    } catch {
      throw new ValidationError(`Ungültiger Link im Feld "${field}".`);
    }
  };
  const out = embeds.map((e) => {
    const { title, description, color, footer, image } = obj(e);
    const str = (v, max, field) => {
      if (v === undefined || v === '') return undefined;
      if (typeof v !== 'string' || v.length > max) throw new ValidationError(`Embed-Feld "${field}" ist zu lang (max. ${max}).`);
      chars += v.length;
      return v;
    };
    const res = {
      title: str(title, 256, 'Titel'),
      description: str(description, 4096, 'Beschreibung'),
      footer: str(footer, 2048, 'Fußzeile'),
      url: url(e.url, 'Link'),
      image: url(image, 'Bild'),
      color: color === undefined || color === '' ? undefined : /^#[0-9a-fA-F]{6}$/.test(color) ? color : (() => { throw new ValidationError('Farbe muss wie #2dd4bf aussehen.'); })(),
    };
    if (!res.title && !res.description && !res.image) throw new ValidationError('Ein Embed braucht mindestens Titel, Beschreibung oder Bild.');
    return res;
  });
  if (chars > EMBED_TOTAL_CHARS_MAX) throw new ValidationError('Embeds haben zusammen mehr als 6000 Zeichen (Discord-Limit).');
  return out;
}

const validators = {
  guildRef(p) {
    const { guildId } = obj(p);
    return { guildId: snowflake(guildId, 'guildId') };
  },
  channelRef(p) {
    const { channelId } = obj(p);
    return { channelId: snowflake(channelId, 'channelId') };
  },
  getMessages(p) {
    const { channelId, before, limit } = obj(p);
    const lim = limit === undefined ? 50 : limit;
    if (!Number.isInteger(lim) || lim < 1 || lim > MESSAGES_PER_FETCH_MAX) throw new ValidationError('limit muss zwischen 1 und 100 liegen.');
    return { channelId: snowflake(channelId, 'channelId'), before: optionalSnowflake(before, 'before'), limit: lim };
  },
  sendMessage(p) {
    const { channelId, content, mentions, nonce, replyTo, pingReply, files, embeds } = obj(p);
    if (typeof content !== 'string') throw new ValidationError('Nachricht fehlt.');
    if (content.length > MESSAGE_CONTENT_MAX) throw new ValidationError(`Nachricht ist länger als ${MESSAGE_CONTENT_MAX} Zeichen.`);
    if (nonce !== undefined && !(typeof nonce === 'string' && /^[A-Za-z0-9]{1,25}$/.test(nonce))) throw new ValidationError('Ungültige Nonce.');
    if (pingReply !== undefined && typeof pingReply !== 'boolean') throw new ValidationError('Ungültiges Feld "pingReply".');
    const cleanFiles = fileList(files);
    const cleanEmbeds = embedList(embeds);
    if (content.trim().length === 0 && cleanFiles.length === 0 && cleanEmbeds.length === 0) throw new ValidationError('Leere Nachrichten können nicht gesendet werden.');
    return {
      channelId: snowflake(channelId, 'channelId'),
      content,
      nonce,
      mentions: mentionsOf(mentions),
      replyTo: optionalSnowflake(replyTo, 'replyTo') ?? null,
      pingReply: pingReply === true,
      files: cleanFiles,
      embeds: cleanEmbeds,
    };
  },
  editMessage(p) {
    const { channelId, messageId, content, mentions } = obj(p);
    if (typeof content !== 'string' || content.trim().length === 0) throw new ValidationError('Leerer Text kann nicht gespeichert werden.');
    if (content.length > MESSAGE_CONTENT_MAX) throw new ValidationError(`Nachricht ist länger als ${MESSAGE_CONTENT_MAX} Zeichen.`);
    return { channelId: snowflake(channelId, 'channelId'), messageId: snowflake(messageId, 'messageId'), content, mentions: mentionsOf(mentions) };
  },
  messageRef(p) {
    const { channelId, messageId } = obj(p);
    return { channelId: snowflake(channelId, 'channelId'), messageId: snowflake(messageId, 'messageId') };
  },
  react(p) {
    const { channelId, messageId, emoji, add } = obj(p);
    if (typeof add !== 'boolean') throw new ValidationError('Ungültiges Feld "add".');
    if (!isEmojiKey(emoji)) throw new ValidationError('Ungültiges Emoji.');
    return { channelId: snowflake(channelId, 'channelId'), messageId: snowflake(messageId, 'messageId'), emoji, add };
  },
  pin(p) {
    const { channelId, messageId, pin } = obj(p);
    if (typeof pin !== 'boolean') throw new ValidationError('Ungültiges Feld "pin".');
    return { channelId: snowflake(channelId, 'channelId'), messageId: snowflake(messageId, 'messageId'), pin };
  },
  threadCreate(p) {
    const { channelId, name, messageId, content } = obj(p);
    if (typeof name !== 'string' || name.trim().length < 1 || name.length > 100) throw new ValidationError('Thread-Name muss 1–100 Zeichen haben.');
    if (content !== undefined && (typeof content !== 'string' || content.length > MESSAGE_CONTENT_MAX)) throw new ValidationError('Ungültige erste Nachricht.');
    return { channelId: snowflake(channelId, 'channelId'), name: name.trim(), messageId: optionalSnowflake(messageId, 'messageId'), content: content?.trim() || undefined };
  },
  threadRef(p) {
    const { threadId } = obj(p);
    return { threadId: snowflake(threadId, 'threadId') };
  },
  search(p) {
    const { guildId, content, channelId, authorId, pinned, offset } = obj(p);
    if (content !== undefined && (typeof content !== 'string' || content.length > 1024)) throw new ValidationError('Suchtext darf höchstens 1024 Zeichen haben.');
    if (pinned !== undefined && typeof pinned !== 'boolean') throw new ValidationError('Ungültiges Feld "pinned".');
    if (offset !== undefined && (!Number.isInteger(offset) || offset < 0 || offset > 9975)) throw new ValidationError('Ungültiger Offset.');
    const c = typeof content === 'string' ? content.trim() : '';
    if (!c && channelId == null && authorId == null && pinned === undefined) throw new ValidationError('Bitte einen Suchbegriff eingeben.');
    return { guildId: snowflake(guildId, 'guildId'), content: c || undefined, channelId: optionalSnowflake(channelId, 'channelId'), authorId: optionalSnowflake(authorId, 'authorId'), pinned, offset: offset ?? 0 };
  },
  searchMentionables(p) {
    const { guildId, query } = obj(p);
    if (typeof query !== 'string' || query.length > 32) throw new ValidationError('Ungültige Suchanfrage.');
    return { guildId: snowflake(guildId, 'guildId'), query };
  },
  readMarker(p) {
    const { channelId, messageId } = obj(p);
    return { channelId: snowflake(channelId, 'channelId'), messageId: snowflake(messageId, 'messageId') };
  },
  lastLocation(p) {
    const { guildId, channelId } = obj(p);
    return { guildId: optionalSnowflake(guildId, 'guildId') ?? null, channelId: optionalSnowflake(channelId, 'channelId') ?? null };
  },
  inviteInput(p) {
    const { invite } = obj(p);
    const code = parseInviteCode(invite);
    if (!code) throw new ValidationError('Das ist kein gültiger Discord-Einladungslink (z. B. discord.gg/abc123).');
    return { code };
  },
  tokenInput(p) {
    const { token } = obj(p);
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw new ValidationError('Das sieht nicht wie ein Bot-Token aus.');
    return token;
  },
  optionalGuildRef(p) {
    if (p === undefined || p === null) return {};
    const { guildId } = obj(p);
    return guildId === undefined || guildId === null ? {} : { guildId: snowflake(guildId, 'guildId') };
  },
  voiceJoin(p) {
    const { guildId, channelId, listen } = obj(p);
    if (listen !== undefined && typeof listen !== 'boolean') throw new ValidationError('Ungültiges Feld "listen".');
    return { guildId: snowflake(guildId, 'guildId'), channelId: snowflake(channelId, 'channelId'), listen: listen !== false };
  },
  flag(p) {
    const { on } = obj(p);
    if (typeof on !== 'boolean') throw new ValidationError('Ungültiges Feld "on".');
    return on;
  },
  externalUrl(p) {
    const { url } = obj(p);
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new ValidationError('Ungültiger Link.');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new ValidationError('Nur http(s)-Links sind erlaubt.');
    return { url: parsed.toString() };
  },
};

module.exports = { validators, ValidationError, isPlainObject };
