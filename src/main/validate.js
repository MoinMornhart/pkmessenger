'use strict';

const { isSnowflake } = require('../shared/snowflake');
const { parseInviteCode } = require('../shared/invites');
const { MESSAGE_CONTENT_MAX, MESSAGES_PER_FETCH_MAX, ALLOWED_MENTIONS_IDS_MAX } = require('../shared/limits');

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
    const { channelId, content, mentions, nonce } = obj(p);
    if (typeof content !== 'string') throw new ValidationError('Nachricht fehlt.');
    if (content.trim().length === 0) throw new ValidationError('Leere Nachrichten können nicht gesendet werden.');
    if (content.length > MESSAGE_CONTENT_MAX) throw new ValidationError(`Nachricht ist länger als ${MESSAGE_CONTENT_MAX} Zeichen.`);
    if (nonce !== undefined && !(typeof nonce === 'string' && /^[A-Za-z0-9]{1,25}$/.test(nonce))) throw new ValidationError('Ungültige Nonce.');
    const m = mentions === undefined ? {} : obj(mentions);
    if (m.everyone !== undefined && typeof m.everyone !== 'boolean') throw new ValidationError('Ungültiges Feld "everyone".');
    return {
      channelId: snowflake(channelId, 'channelId'),
      content,
      nonce,
      mentions: { users: idList(m.users, 'users'), roles: idList(m.roles, 'roles'), everyone: m.everyone === true },
    };
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
