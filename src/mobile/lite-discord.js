'use strict';

// Schlanker Discord-Bot-Client für die Android-App (Issue #56). Läuft ohne Node (WebView): REST über fetch
// (auf Android nativ über CapacitorHttp), Gateway über WebSocket. Er bildet genau die Teile von discord.js nach,
// die src/main/discord.js benutzt – damit läuft dort derselbe Service mit allen Rechte-Prüfungen unverändert.
// Regeln wie auf dem PC: nur als Bot, nur die freigegebenen Intents, Rate-Limits werden abgewartet, nie umgangen.

const { PermissionFlagsBits, ChannelType, GatewayIntentBits, MessageFlags, Routes } = require('discord-api-types/v10');

const API = 'https://discord.com/api/v10';
const CDN = 'https://cdn.discordapp.com';
const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';

const Events = {
  ClientReady: 'clientReady',
  ShardReady: 'shardReady',
  ShardResume: 'shardResume',
  ShardReconnecting: 'shardReconnecting',
  ShardDisconnect: 'shardDisconnect',
  Error: 'error',
  MessageCreate: 'messageCreate',
  MessageUpdate: 'messageUpdate',
  MessageDelete: 'messageDelete',
  PresenceUpdate: 'presenceUpdate',
  TypingStart: 'typingStart',
  GuildCreate: 'guildCreate',
  GuildDelete: 'guildDelete',
  GuildUpdate: 'guildUpdate',
  ChannelCreate: 'channelCreate',
  ChannelUpdate: 'channelUpdate',
  ChannelDelete: 'channelDelete',
  GuildRoleCreate: 'roleCreate',
  GuildRoleUpdate: 'roleUpdate',
  GuildRoleDelete: 'roleDelete',
  GuildMemberUpdate: 'guildMemberUpdate',
  UserUpdate: 'userUpdate',
  MessageReactionAdd: 'messageReactionAdd',
  MessageReactionRemove: 'messageReactionRemove',
  MessageReactionRemoveAll: 'messageReactionRemoveAll',
  MessagePollVoteAdd: 'messagePollVoteAdd',
  MessagePollVoteRemove: 'messagePollVoteRemove',
  ThreadCreate: 'threadCreate',
  ThreadUpdate: 'threadUpdate',
  ThreadDelete: 'threadDelete',
  InteractionCreate: 'interactionCreate',
  VoiceStateUpdate: 'voiceStateUpdate',
};
const RESTEvents = { RateLimited: 'rateLimited' };
const Partials = { User: 0, Channel: 1, GuildMember: 2, Message: 3, Reaction: 4 };
// Gateway-Close-Codes ohne Sinn für einen neuen Versuch (falscher Token, Intent nicht freigeschaltet …)
const FATAL = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

// ---------- Hilfen ----------

class Emitter {
  constructor() {
    this._l = new Map();
  }
  on(ev, fn) {
    if (!this._l.has(ev)) this._l.set(ev, []);
    this._l.get(ev).push(fn);
    return this;
  }
  once(ev, fn) {
    const w = (...a) => {
      this.off(ev, w);
      fn(...a);
    };
    w.orig = fn;
    return this.on(ev, w);
  }
  off(ev, fn) {
    const list = this._l.get(ev);
    if (list) this._l.set(ev, list.filter((f) => f !== fn && f.orig !== fn));
    return this;
  }
  emit(ev, ...a) {
    for (const fn of [...(this._l.get(ev) || [])]) {
      try {
        fn(...a);
      } catch (err) {
        if (ev !== 'error') this.emit('error', err);
      }
    }
    return true;
  }
  removeAllListeners() {
    this._l.clear();
    return this;
  }
}

class Collection extends Map {
  first() {
    return this.values().next().value;
  }
  filter(fn) {
    return new Collection([...this].filter(([, v]) => fn(v)));
  }
}

const ALL = Object.values(PermissionFlagsBits).reduce((a, b) => a | b, 0n);
class Permissions {
  constructor(bits) {
    this.bitfield = BigInt(bits || 0);
  }
  has(flag) {
    if (flag === undefined) return false;
    if ((this.bitfield & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator) return true;
    const f = BigInt(flag);
    return (this.bitfield & f) === f;
  }
}

const tsOf = (id) => Number((BigInt(id) >> 22n) + 1420070400000n);
const parseTs = (s) => (s ? Date.parse(s) || null : null);
const avatarUrl = (path, hash, { size = 64, extension = 'png' } = {}) => (hash ? `${CDN}/${path}/${hash}.${hash.startsWith('a_') ? 'gif' : extension}?size=${size}` : null);
const hex = (n) => `#${Number(n || 0).toString(16).padStart(6, '0')}`;
const emojiRoute = (e) => encodeURIComponent(String(e).replace(/^<a?:/, '').replace(/>$/, ''));
const bits = (list) => (Array.isArray(list) ? list.reduce((a, b) => a | BigInt(b), 0n) : BigInt(list || 0)).toString();

// discord.js-artige Sende-Daten → Discord-API-Format
function toApiMessage(p) {
  const body = {};
  if (p.content !== undefined) body.content = p.content;
  if (p.nonce) {
    body.nonce = p.nonce;
    if (p.enforceNonce) body.enforce_nonce = true;
  }
  if (p.allowedMentions) {
    const a = p.allowedMentions;
    body.allowed_mentions = { parse: a.parse || [], ...(a.users ? { users: a.users } : {}), ...(a.roles ? { roles: a.roles } : {}), replied_user: Boolean(a.repliedUser) };
  }
  if (p.reply?.messageReference) body.message_reference = { message_id: p.reply.messageReference, fail_if_not_exists: p.reply.failIfNotExists !== false };
  if (p.embeds) body.embeds = p.embeds;
  if (p.flags) body.flags = p.flags;
  if (p.poll) body.poll = { question: p.poll.question, answers: p.poll.answers.map((a) => ({ poll_media: { text: a.text } })), duration: p.poll.duration, allow_multiselect: Boolean(p.poll.allowMultiselect) };
  return body;
}

// ---------- REST ----------

function createRest({ fetchImpl, emitter, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let token = null;
  async function request(method, route, { body, query, files, reason } = {}) {
    const qs = query ? `?${query instanceof URLSearchParams ? query : new URLSearchParams(query)}` : '';
    for (let attempt = 0; attempt < 4; attempt++) {
      const headers = { Authorization: `Bot ${token}` };
      if (reason) headers['X-Audit-Log-Reason'] = encodeURIComponent(reason);
      let payload;
      if (files?.length) {
        const fd = new FormData();
        fd.append('payload_json', JSON.stringify({ ...body, attachments: files.map((f, i) => ({ id: i, filename: f.name })) }));
        files.forEach((f, i) => fd.append(`files[${i}]`, new Blob([f.attachment]), f.name));
        payload = fd;
      } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }
      let res;
      try {
        res = await fetchImpl(`${API}${route}${qs}`, { method, headers, body: payload });
      } catch (err) {
        throw Object.assign(new Error(err?.message || 'Netzwerkfehler'), { code: 'ECONNRESET', cause: err });
      }
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const retryAfter = Math.ceil((Number(data.retry_after) || Number(res.headers.get('retry-after')) || 1) * 1000);
        emitter.emit(RESTEvents.RateLimited, { retryAfter, global: Boolean(data.global), route, method });
        await sleep(retryAfter); // Discord-Vorgabe abwarten – nie umgehen
        continue;
      }
      if (res.status === 204) return null;
      const data = await res.json().catch(() => null);
      if (!res.ok) throw Object.assign(new Error(data?.message || `HTTP ${res.status}`), { code: data?.code ?? res.status, status: res.status, rawError: data, method, url: route });
      return data;
    }
    throw Object.assign(new Error('Zu viele Anfragen.'), { status: 429, name: 'RateLimitError' });
  }
  const r = (m) => (route, opts) => request(m, route, opts);
  return Object.assign(emitter, { setToken: (t) => (token = t), get: r('GET'), post: r('POST'), patch: r('PATCH'), put: r('PUT'), delete: r('DELETE') });
}

// ---------- Strukturen ----------

function createClient({ intents = [], fetchImpl = globalThis.fetch?.bind(globalThis), WebSocketImpl = globalThis.WebSocket, sleep, readyWaitMs = 4000 } = {}) {
  const client = new Emitter();
  const rest = createRest({ fetchImpl, emitter: new Emitter(), sleep });
  client.rest = rest;
  const guilds = new Collection();
  const channels = new Collection();
  const users = new Collection();
  let ready = false;

  // --- Nutzer ---
  function upsertUser(d) {
    if (!d?.id) return null;
    let u = users.get(d.id);
    if (!u) {
      u = {
        id: d.id,
        createdTimestamp: tsOf(d.id),
        // Ohne eigenes Bild: null → die App zeigt Initialen (keine Discord-Standardbilder mit Logo, Regel §2)
        displayAvatarURL: (o) => avatarUrl(`avatars/${u.id}`, u.avatar, o),
        createDM: async () => upsertChannel(await rest.post('/users/@me/channels', { body: { recipient_id: u.id } })),
        toString: () => `<@${u.id}>`,
      };
      users.set(d.id, u);
    }
    const before = u.username ? { id: u.id, username: u.username, globalName: u.globalName } : null;
    Object.assign(u, { username: d.username ?? u.username, globalName: d.global_name !== undefined ? d.global_name : (u.globalName ?? null), bot: Boolean(d.bot ?? u.bot), avatar: d.avatar ?? u.avatar ?? null });
    if (before && (before.username !== u.username || before.globalName !== u.globalName)) client.emit(Events.UserUpdate, before, u);
    if (d.accent_color != null) u.hexAccentColor = hex(d.accent_color);
    return u;
  }
  client.users = { cache: users, fetch: async (id) => upsertUser(await rest.get(`/users/${id}`)) };

  // --- Rollen ---
  function upsertRole(guild, d) {
    let r = guild.roles.cache.get(d.id);
    if (!r) {
      r = { id: d.id, guild };
      guild.roles.cache.set(d.id, r);
    }
    Object.assign(r, { name: d.name, position: d.position ?? 0, permissions: new Permissions(d.permissions), hexColor: hex(d.color), mentionable: Boolean(d.mentionable), managed: Boolean(d.managed), tags: d.tags ? { botId: d.tags.bot_id ?? null } : null });
    return r;
  }

  // --- Mitglieder ---
  function guildPerms(guild, member) {
    if (!member) return new Permissions(0);
    if (guild.ownerId === member.id) return new Permissions(ALL);
    let p = guild.roles.cache.get(guild.id)?.permissions.bitfield ?? 0n;
    for (const id of member._roles) p |= guild.roles.cache.get(id)?.permissions.bitfield ?? 0n;
    return new Permissions(p & PermissionFlagsBits.Administrator ? ALL : p);
  }
  function highestPos(guild, m) {
    return Math.max(0, ...m._roles.map((id) => guild.roles.cache.get(id)?.position ?? 0));
  }
  function upsertMember(guild, d) {
    const user = upsertUser(d.user);
    if (!user) return null;
    let m = guild.members.cache.get(user.id);
    if (!m) {
      m = { id: user.id, guild, user, _roles: [] };
      const roleColl = () => new Collection([guild.roles.cache.get(guild.id), ...m._roles.map((id) => guild.roles.cache.get(id))].filter(Boolean).map((r) => [r.id, r]));
      const manageable = () => {
        const me = guild.members.me;
        if (!me || m.id === guild.ownerId || m.id === me.id) return false;
        if (me.id === guild.ownerId) return true;
        return highestPos(guild, me) > highestPos(guild, m);
      };
      Object.defineProperties(m, {
        displayName: { get: () => m.nickname || user.globalName || user.username },
        permissions: { get: () => guildPerms(guild, m) },
        presence: { get: () => guild.presences.cache.get(m.id) || null },
        displayHexColor: {
          get: () => {
            const r = [...roleColl().values()].filter((x) => x.hexColor !== '#000000').sort((a, b) => b.position - a.position)[0];
            return r ? r.hexColor : '#000000';
          },
        },
        manageable: { get: manageable },
        moderatable: { get: () => manageable() && !guildPerms(guild, m).has(PermissionFlagsBits.Administrator) },
        kickable: { get: manageable },
        bannable: { get: manageable },
        roles: {
          get: () => ({
            cache: roleColl(),
            highest: [...roleColl().values()].sort((a, b) => b.position - a.position)[0] || null,
            botRole: [...guild.roles.cache.values()].find((r) => r.tags?.botId === m.id) || null,
            add: (id, reason) => rest.put(`/guilds/${guild.id}/members/${m.id}/roles/${id}`, { reason }).then(() => (m._roles = [...new Set([...m._roles, id])])),
            remove: (id, reason) => rest.delete(`/guilds/${guild.id}/members/${m.id}/roles/${id}`, { reason }).then(() => (m._roles = m._roles.filter((x) => x !== id))),
          }),
        },
      });
      m.displayAvatarURL = (o) => (m.avatar ? avatarUrl(`guilds/${guild.id}/users/${m.id}/avatars`, m.avatar, o) : user.displayAvatarURL(o));
      m.timeout = async (ms, reason) => {
        const until = ms ? new Date(Date.now() + ms).toISOString() : null;
        await rest.patch(`/guilds/${guild.id}/members/${m.id}`, { body: { communication_disabled_until: until }, reason });
        m.communicationDisabledUntilTimestamp = until ? Date.parse(until) : null;
      };
      m.kick = (reason) => rest.delete(`/guilds/${guild.id}/members/${m.id}`, { reason });
      guild.members.cache.set(user.id, m);
    }
    if (d.roles) m._roles = d.roles;
    if ('nick' in d) m.nickname = d.nick ?? null;
    if ('avatar' in d) m.avatar = d.avatar ?? null;
    if (d.joined_at) m.joinedTimestamp = parseTs(d.joined_at);
    if ('communication_disabled_until' in d) m.communicationDisabledUntilTimestamp = parseTs(d.communication_disabled_until);
    return m;
  }

  // --- Kanäle ---
  const THREADS = new Set([ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread]);
  function permissionsFor(ch, member) {
    if (THREADS.has(ch.type)) {
      const parent = channels.get(ch.parentId);
      return parent ? permissionsFor(parent, member) : new Permissions(0);
    }
    const guild = ch.guild;
    if (!guild || !member) return new Permissions(0);
    const base = guildPerms(guild, member);
    if (base.has(PermissionFlagsBits.Administrator)) return new Permissions(ALL);
    let p = base.bitfield;
    const ow = ch.permissionOverwrites || [];
    const everyone = ow.find((o) => o.id === guild.id);
    if (everyone) p = (p & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
    let allow = 0n;
    let deny = 0n;
    for (const o of ow) if (o.type === 0 && o.id !== guild.id && member._roles.includes(o.id)) (allow |= BigInt(o.allow)), (deny |= BigInt(o.deny));
    p = (p & ~deny) | allow;
    const own = ow.find((o) => o.type === 1 && o.id === member.id);
    if (own) p = (p & ~BigInt(own.deny)) | BigInt(own.allow);
    return new Permissions(p);
  }

  function upsertChannel(d, guildHint) {
    if (!d?.id) return null;
    const guild = guildHint || (d.guild_id ? guilds.get(d.guild_id) : null);
    let ch = channels.get(d.id);
    if (!ch) {
      ch = { id: d.id, createdTimestamp: tsOf(d.id), partial: false };
      const msgs = new Collection();
      ch.messages = {
        cache: msgs,
        fetch: async (opt) => {
          if (typeof opt === 'string') return upsertMessage(await rest.get(`/channels/${ch.id}/messages/${opt}`));
          const q = { limit: String(opt?.limit ?? 50), ...(opt?.before ? { before: opt.before } : {}) };
          const list = await rest.get(`/channels/${ch.id}/messages`, { query: q });
          return new Collection((list || []).map((m) => [m.id, upsertMessage(m)]));
        },
        fetchPins: async () => {
          const res = await rest.get(`/channels/${ch.id}/messages/pins`, { query: { limit: '50' } });
          return { items: (res?.items || []).map((it) => ({ pinnedTimestamp: parseTs(it.pinned_at), message: upsertMessage(it.message) })), hasMore: Boolean(res?.has_more) };
        },
      };
      ch.permissionsFor = (member) => permissionsFor(ch, member);
      ch.send = async (p) => {
        const files = p.files?.map((f) => ({ attachment: f.attachment, name: f.name }));
        return upsertMessage(await rest.post(`/channels/${ch.id}/messages`, { body: toApiMessage(p), files }));
      };
      ch.sendTyping = () => rest.post(`/channels/${ch.id}/typing`);
      ch.setName = async (name, reason) => upsertChannel(await rest.patch(`/channels/${ch.id}`, { body: { name }, reason }));
      ch.setPosition = async (delta, { relative, reason } = {}) => {
        const pos = relative ? Math.max(0, (ch.position ?? 0) + delta) : delta;
        await rest.patch(`/guilds/${ch.guildId}/channels`, { body: [{ id: ch.id, position: pos }], reason });
        ch.position = pos;
      };
      ch.threads = {
        create: async ({ name, message }) => {
          const body = message ? { name, message: toApiMessage(message) } : { name, type: ChannelType.PublicThread };
          return upsertChannel(await rest.post(`/channels/${ch.id}/threads`, { body }));
        },
        fetchActive: async () => {
          const res = await rest.get(`/guilds/${ch.guildId}/threads/active`);
          return { threads: new Collection((res?.threads || []).filter((t) => t.parent_id === ch.id).map((t) => [t.id, upsertChannel(t)])) };
        },
        fetchArchived: async ({ limit = 25 } = {}) => {
          const res = await rest.get(`/channels/${ch.id}/threads/archived/public`, { query: { limit: String(limit) } });
          return { threads: new Collection((res?.threads || []).map((t) => [t.id, upsertChannel(t)])) };
        },
      };
      channels.set(d.id, ch);
    }
    Object.assign(ch, {
      type: d.type,
      name: d.name ?? ch.name ?? null,
      guild: guild || ch.guild || null,
      guildId: guild?.id ?? d.guild_id ?? ch.guildId ?? null,
      parentId: 'parent_id' in d ? d.parent_id : (ch.parentId ?? null),
      position: d.position ?? ch.position ?? 0,
      topic: d.topic ?? ch.topic ?? '',
      lastMessageId: d.last_message_id ?? ch.lastMessageId ?? null,
      permissionOverwrites: d.permission_overwrites ?? ch.permissionOverwrites ?? [],
    });
    if (d.thread_metadata) Object.assign(ch, { archived: Boolean(d.thread_metadata.archived), locked: Boolean(d.thread_metadata.locked) });
    if (d.message_count != null) ch.messageCount = d.message_count;
    if (d.type === ChannelType.DM && d.recipients?.[0]) {
      ch.recipient = upsertUser(d.recipients[0]);
      ch.recipientId = ch.recipient.id;
    }
    if (ch.guild && ch.type !== ChannelType.DM) ch.guild.channels.cache.set(ch.id, ch);
    return ch;
  }

  // --- Nachrichten ---
  function makeReaction(msg, d) {
    const e = d.emoji || {};
    const r = {
      message: msg,
      partial: false,
      count: d.count ?? 0,
      me: Boolean(d.me),
      emoji: { id: e.id ?? null, name: e.name ?? null, animated: Boolean(e.animated), imageURL: ({ size = 48 } = {}) => (e.id ? `${CDN}/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=${size}` : null) },
      users: { remove: (uid) => rest.delete(`/channels/${msg.channelId}/messages/${msg.id}/reactions/${emojiRoute(e.id ? `${e.name}:${e.id}` : e.name)}/${uid === client.user?.id ? '@me' : uid}`) },
      fetch: async () => r,
    };
    return r;
  }
  const reactionKey = (e) => (e?.id ? `${e.name}:${e.id}` : e?.name);

  function upsertMessage(d) {
    if (!d?.id) return null;
    let channel = channels.get(d.channel_id);
    if (!channel && !d.guild_id) channel = upsertChannel({ id: d.channel_id, type: ChannelType.DM, recipients: d.author && d.author.id !== client.user?.id ? [d.author] : [] });
    const guild = d.guild_id ? guilds.get(d.guild_id) : channel?.guild || null;
    let m = channel?.messages.cache.get(d.id);
    if (!m) {
      m = { id: d.id, channelId: d.channel_id, partial: false, createdTimestamp: tsOf(d.id) };
      m.edit = async (p) => upsertMessage(await rest.patch(`/channels/${m.channelId}/messages/${m.id}`, { body: toApiMessage(p) }));
      m.delete = () => rest.delete(`/channels/${m.channelId}/messages/${m.id}`);
      m.react = async (emoji) => {
        await rest.put(`/channels/${m.channelId}/messages/${m.id}/reactions/${emojiRoute(emoji)}/@me`);
        const [name, id] = String(emoji).includes(':') ? String(emoji).split(':') : [emoji, null];
        const key = id ? `${name}:${id}` : name;
        const r = m.reactions.cache.get(key) || makeReaction(m, { emoji: { id, name }, count: 0 });
        if (!r.me) Object.assign(r, { me: true, count: r.count + 1 });
        m.reactions.cache.set(key, r);
      };
      m.pin = () => rest.put(`/channels/${m.channelId}/messages/pins/${m.id}`).then(() => (m.pinned = true));
      m.unpin = () => rest.delete(`/channels/${m.channelId}/messages/pins/${m.id}`).then(() => (m.pinned = false));
      m.startThread = async ({ name }) => upsertChannel(await rest.post(`/channels/${m.channelId}/messages/${m.id}/threads`, { body: { name } }));
      m.fetch = async () => upsertMessage(await rest.get(`/channels/${m.channelId}/messages/${m.id}`));
      channel?.messages.cache.set(d.id, m);
      // Speicher klein halten (wie discord.js: begrenzter Cache pro Kanal)
      if (channel && channel.messages.cache.size > 200) channel.messages.cache.delete(channel.messages.cache.keys().next().value);
    }
    const author = d.author ? upsertUser(d.author) : m.author || null;
    let member = m.member || null;
    if (guild && d.member && author) member = upsertMember(guild, { ...d.member, user: d.author });
    else if (guild && author) member = guild.members.cache.get(author.id) || member;
    const mentionUsers = new Collection((d.mentions || []).map((u) => [u.id, upsertUser(u)]));
    if (guild) for (const u of d.mentions || []) if (u.member) upsertMember(guild, { ...u.member, user: u });
    Object.assign(m, {
      channel,
      guild,
      guildId: d.guild_id ?? guild?.id ?? null,
      author,
      member,
      content: d.content ?? m.content ?? '',
      editedTimestamp: 'edited_timestamp' in d ? parseTs(d.edited_timestamp) : (m.editedTimestamp ?? null),
      type: d.type ?? m.type ?? 0,
      system: d.type != null && ![0, 19, 20, 23].includes(d.type),
      nonce: d.nonce ?? m.nonce ?? null,
      pinned: d.pinned ?? m.pinned ?? false,
      embeds: d.embeds ?? m.embeds ?? [],
      attachments: d.attachments ? new Collection(d.attachments.map((a) => [a.id, { id: a.id, name: a.filename, url: a.url, size: a.size, contentType: a.content_type ?? null, width: a.width ?? null, height: a.height ?? null }])) : (m.attachments ?? new Collection()),
    });
    m.cleanContent = m.content;
    if (d.mentions || d.mention_roles || 'mention_everyone' in d)
      m.mentions = {
        users: mentionUsers,
        roles: new Collection((d.mention_roles || []).map((id) => guild?.roles.cache.get(id)).filter(Boolean).map((r) => [r.id, r])),
        channels: new Collection((d.content || '').match(/<#(\d{17,20})>/g)?.map((x) => channels.get(x.slice(2, -1))).filter(Boolean).map((c) => [c.id, c]) || []),
        everyone: Boolean(d.mention_everyone),
        repliedUser: d.referenced_message?.author ? upsertUser(d.referenced_message.author) : null,
      };
    m.mentions ||= { users: new Collection(), roles: new Collection(), channels: new Collection(), everyone: false, repliedUser: null };
    if (d.message_reference?.message_id) m.reference = { messageId: d.message_reference.message_id, channelId: d.message_reference.channel_id ?? null };
    if (d.referenced_message) upsertMessage(d.referenced_message);
    if (d.reactions) m.reactions = { cache: new Collection(d.reactions.map((r) => [reactionKey(r.emoji), makeReaction(m, r)])) };
    m.reactions ||= { cache: new Collection() };
    if (d.poll) {
      const counts = new Map((d.poll.results?.answer_counts || []).map((c) => [c.id, c.count]));
      m.poll = {
        question: { text: d.poll.question?.text ?? '' },
        answers: new Collection((d.poll.answers || []).map((a) => [a.answer_id, { id: a.answer_id, text: a.poll_media?.text ?? '', emoji: a.poll_media?.emoji ?? null, voteCount: counts.get(a.answer_id) || 0 }])),
        allowMultiselect: Boolean(d.poll.allow_multiselect),
        expiresTimestamp: parseTs(d.poll.expiry),
        resultsFinalized: Boolean(d.poll.results?.is_finalized),
        end: () => rest.post(`/channels/${m.channelId}/polls/${m.id}/expire`),
      };
    }
    if (d.thread) {
      m.thread = upsertChannel(d.thread);
      m.hasThread = true;
    }
    return m;
  }

  // --- Server ---
  function upsertGuild(d) {
    let g = guilds.get(d.id);
    if (!g) {
      g = { id: d.id, client };
      g.roles = { cache: new Collection(), fetch: async () => ((await rest.get(`/guilds/${g.id}/roles`)) || []).forEach((r) => upsertRole(g, r)) };
      g.channels = {
        cache: new Collection(),
        fetch: async () => ((await rest.get(`/guilds/${g.id}/channels`)) || []).forEach((c) => upsertChannel({ ...c, guild_id: g.id }, g)),
        create: async ({ name, type, parent, permissionOverwrites, reason }) => {
          const body = { name, type, ...(parent ? { parent_id: parent } : {}) };
          if (permissionOverwrites)
            body.permission_overwrites = permissionOverwrites.map((o) => ({ id: o.id, type: o.id === g.id || g.roles.cache.has(o.id) ? 0 : 1, allow: bits(o.allow || []), deny: bits(o.deny || []) }));
          return upsertChannel(await rest.post(`/guilds/${g.id}/channels`, { body, reason }), g);
        },
      };
      g.members = {
        cache: new Collection(),
        get me() {
          return client.user ? g.members.cache.get(client.user.id) || null : null;
        },
        fetch: async (id) => g.members.cache.get(id) || upsertMember(g, await rest.get(`/guilds/${g.id}/members/${id}`)),
        fetchMe: async () => upsertMember(g, await rest.get(`/guilds/${g.id}/members/${client.user.id}`)),
        search: async ({ query, limit = 8 }) => new Collection(((await rest.get(`/guilds/${g.id}/members/search`, { query: { query, limit: String(limit) } })) || []).map((m) => [m.user.id, upsertMember(g, m)])),
        ban: (id, { reason, deleteMessageSeconds } = {}) => rest.put(`/guilds/${g.id}/bans/${id}`, { body: deleteMessageSeconds ? { delete_message_seconds: deleteMessageSeconds } : {}, reason }),
        editMe: async ({ nick }) => upsertMember(g, await rest.patch(`/guilds/${g.id}/members/@me`, { body: { nick } })),
      };
      g.emojis = { cache: new Collection() };
      g.voiceStates = { cache: new Collection() };
      g.presences = { cache: new Collection() };
      g.iconURL = (o) => avatarUrl(`icons/${g.id}`, g.icon, o);
      guilds.set(d.id, g);
    }
    Object.assign(g, { name: d.name ?? g.name, icon: d.icon ?? g.icon ?? null, ownerId: d.owner_id ?? g.ownerId, description: d.description ?? g.description ?? null });
    g.nameAcronym = (g.name || '')
      .split(/\s+/)
      .map((w) => w[0] || '')
      .join('')
      .slice(0, 4);
    for (const r of d.roles || []) upsertRole(g, r);
    for (const e of d.emojis || []) g.emojis.cache.set(e.id, { id: e.id, name: e.name, animated: Boolean(e.animated), available: e.available !== false, imageURL: ({ size = 48 } = {}) => `${CDN}/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=${size}` });
    for (const m of d.members || []) upsertMember(g, m);
    for (const c of d.channels || []) upsertChannel({ ...c, guild_id: g.id }, g);
    for (const t of d.threads || []) upsertChannel({ ...t, guild_id: g.id }, g);
    for (const v of d.voice_states || []) setVoiceState(g, v);
    for (const p of d.presences || []) setPresence(g, p);
    return g;
  }
  function setVoiceState(g, v) {
    if (v.member) upsertMember(g, v.member);
    if (!v.channel_id) return g.voiceStates.cache.delete(v.user_id);
    g.voiceStates.cache.set(v.user_id, { id: v.user_id, channelId: v.channel_id, guild: g, member: g.members.cache.get(v.user_id) || null, selfMute: Boolean(v.self_mute), serverMute: Boolean(v.mute), selfDeaf: Boolean(v.self_deaf), serverDeaf: Boolean(v.deaf) });
  }
  function setPresence(g, p) {
    const p2 = { userId: p.user.id, status: p.status, activities: p.activities || [], guild: g };
    g.presences.cache.set(p.user.id, p2);
    return p2;
  }
  client.guilds = { cache: guilds };
  client.channels = { cache: channels, fetch: async (id) => channels.get(id) || upsertChannel(await rest.get(`/channels/${id}`)) };

  // --- Anwendung (Slash-Befehle, Beschreibung, Intents-Flags) ---
  const FLAG_NAMES = { GatewayPresence: 1 << 12, GatewayPresenceLimited: 1 << 13, GatewayGuildMembers: 1 << 14, GatewayGuildMembersLimited: 1 << 15, GatewayMessageContent: 1 << 18, GatewayMessageContentLimited: 1 << 19 };
  client.application = {
    id: null,
    description: '',
    flags: null,
    fetch: async () => {
      const a = await rest.get('/applications/@me');
      client.application.description = a?.description || '';
      const f = Number(a?.flags) || 0;
      client.application.flags = { bitfield: f, has: (name) => Boolean(f & (FLAG_NAMES[name] || 0)) };
      return client.application;
    },
    edit: async ({ description }) => {
      await rest.patch('/applications/@me', { body: { description } });
      client.application.description = description;
      return client.application;
    },
    commands: { set: (cmds) => rest.put(`/applications/${client.application.id}/commands`, { body: cmds }) },
  };
  client.fetchInvite = async (code) => {
    const d = await rest.get(`/invites/${encodeURIComponent(code)}`, { query: { with_counts: 'true' } });
    const g = d?.guild ? { id: d.guild.id, name: d.guild.name, description: d.guild.description ?? null, iconURL: (o) => avatarUrl(`icons/${d.guild.id}`, d.guild.icon, o) } : null;
    return { code: d?.code, guild: g, memberCount: d?.approximate_member_count, presenceCount: d?.approximate_presence_count, channel: d?.channel ? { name: d.channel.name } : null, expiresTimestamp: parseTs(d?.expires_at) };
  };
  client.ws = { ping: -1 };
  client.isReady = () => ready;

  // ---------- Gateway ----------
  let ws = null;
  let seq = null;
  let sessionId = null;
  let resumeUrl = null;
  let hbTimer = null;
  let acked = true;
  let lastBeat = 0;
  let destroyed = false;
  let pending = new Set();
  let readyTimer = null;
  let attempt = 0;

  const send = (op, d) => ws && ws.readyState === 1 && ws.send(JSON.stringify({ op, d }));
  function stopHeartbeat() {
    clearInterval(hbTimer);
    hbTimer = null;
  }
  function beat() {
    if (!acked) return ws?.close(4000, 'zombie'); // keine Antwort auf den letzten Herzschlag → neu verbinden
    acked = false;
    lastBeat = Date.now();
    send(1, seq);
  }
  function finishReady() {
    clearTimeout(readyTimer);
    if (ready) return;
    ready = true;
    client.emit(Events.ShardReady, 0);
    client.emit(Events.ClientReady, client);
  }

  function open(url) {
    if (destroyed) return;
    ws = new WebSocketImpl(url);
    ws.onmessage = (ev) => {
      let pkt;
      try {
        pkt = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data));
      } catch {
        return;
      }
      if (pkt.s != null) seq = pkt.s;
      if (pkt.op === 10) {
        stopHeartbeat();
        acked = true;
        hbTimer = setInterval(beat, pkt.d.heartbeat_interval);
        if (sessionId && url !== GATEWAY) send(6, { token: client.token, session_id: sessionId, seq });
        else send(2, { token: client.token, intents: intents.reduce((a, b) => a | b, 0), properties: { os: 'android', browser: 'PKMessenger', device: 'PKMessenger' } });
      } else if (pkt.op === 11) {
        acked = true;
        client.ws.ping = Date.now() - lastBeat;
      } else if (pkt.op === 1) beat();
      else if (pkt.op === 7) ws.close(4000, 'reconnect');
      else if (pkt.op === 9) {
        if (!pkt.d) sessionId = null; // nicht fortsetzbar → neu anmelden
        setTimeout(() => ws?.close(4000, 'invalid session'), 1000 + Math.random() * 4000);
      } else if (pkt.op === 0) dispatch(pkt.t, pkt.d);
    };
    ws.onclose = (ev) => {
      stopHeartbeat();
      const code = ev?.code ?? 1006;
      if (destroyed) return;
      if (FATAL.has(code)) {
        ready = false;
        client.emit(Events.ShardDisconnect, { code }, 0);
        return;
      }
      client.emit(Events.ShardReconnecting, 0);
      const wait = Math.min(30000, 1000 * 2 ** attempt++) + Math.random() * 1000;
      setTimeout(() => open(sessionId && resumeUrl ? `${resumeUrl}/?v=10&encoding=json` : GATEWAY), wait);
    };
    ws.onerror = () => {};
  }

  function dispatch(t, d) {
    switch (t) {
      case 'READY': {
        attempt = 0;
        sessionId = d.session_id;
        resumeUrl = d.resume_gateway_url;
        client.user = upsertUser(d.user);
        client.user.edit = async (body) => upsertUser(await rest.patch('/users/@me', { body }));
        client.application.id = d.application?.id ?? d.user.id;
        if (d.application?.flags != null) client.application.flags = { bitfield: d.application.flags, has: (n) => Boolean(d.application.flags & (FLAG_NAMES[n] || 0)) };
        pending = new Set((d.guilds || []).map((g) => g.id));
        if (!pending.size) finishReady();
        else readyTimer = setTimeout(finishReady, readyWaitMs);
        break;
      }
      case 'RESUMED':
        attempt = 0;
        client.emit(Events.ShardResume, 0, 0);
        break;
      case 'GUILD_CREATE': {
        if (d.unavailable) break;
        const g = upsertGuild(d);
        if (pending.delete(d.id) && pending.size === 0) finishReady();
        else if (ready) client.emit(Events.GuildCreate, g);
        break;
      }
      case 'GUILD_UPDATE':
        client.emit(Events.GuildUpdate, null, upsertGuild(d));
        break;
      case 'GUILD_DELETE': {
        const g = guilds.get(d.id);
        if (!g || d.unavailable) break;
        for (const id of g.channels.cache.keys()) channels.delete(id);
        guilds.delete(d.id);
        client.emit(Events.GuildDelete, g);
        break;
      }
      case 'CHANNEL_CREATE':
        client.emit(Events.ChannelCreate, upsertChannel(d));
        break;
      case 'CHANNEL_UPDATE':
        client.emit(Events.ChannelUpdate, null, upsertChannel(d));
        break;
      case 'CHANNEL_DELETE': {
        const ch = channels.get(d.id) || upsertChannel(d);
        channels.delete(d.id);
        ch.guild?.channels.cache.delete(d.id);
        client.emit(Events.ChannelDelete, ch);
        break;
      }
      case 'THREAD_CREATE':
        client.emit(Events.ThreadCreate, upsertChannel(d), Boolean(d.newly_created));
        break;
      case 'THREAD_UPDATE':
        client.emit(Events.ThreadUpdate, null, upsertChannel(d));
        break;
      case 'THREAD_DELETE': {
        const t2 = channels.get(d.id) || { id: d.id, parentId: d.parent_id };
        channels.delete(d.id);
        guilds.get(d.guild_id)?.channels.cache.delete(d.id);
        client.emit(Events.ThreadDelete, t2);
        break;
      }
      case 'GUILD_ROLE_CREATE':
      case 'GUILD_ROLE_UPDATE': {
        const g = guilds.get(d.guild_id);
        if (g) client.emit(t === 'GUILD_ROLE_CREATE' ? Events.GuildRoleCreate : Events.GuildRoleUpdate, upsertRole(g, d.role));
        break;
      }
      case 'GUILD_ROLE_DELETE': {
        const g = guilds.get(d.guild_id);
        const r = g?.roles.cache.get(d.role_id);
        if (r) {
          g.roles.cache.delete(d.role_id);
          client.emit(Events.GuildRoleDelete, r);
        }
        break;
      }
      case 'GUILD_MEMBER_UPDATE': {
        const g = guilds.get(d.guild_id);
        const before = g?.members.cache.get(d.user?.id)?.displayName;
        if (g) client.emit(Events.GuildMemberUpdate, before ? { displayName: before } : null, upsertMember(g, d));
        break;
      }
      case 'MESSAGE_CREATE': {
        const m = upsertMessage(d);
        if (m.channel) m.channel.lastMessageId = m.id;
        client.emit(Events.MessageCreate, m);
        break;
      }
      case 'MESSAGE_UPDATE': {
        const m = upsertMessage(d);
        client.emit(Events.MessageUpdate, null, m);
        break;
      }
      case 'MESSAGE_DELETE': {
        const ch = channels.get(d.channel_id);
        const m = ch?.messages.cache.get(d.id) || { id: d.id, channelId: d.channel_id, guildId: d.guild_id ?? null, channel: ch || null, partial: true };
        ch?.messages.cache.delete(d.id);
        client.emit(Events.MessageDelete, m);
        break;
      }
      case 'MESSAGE_REACTION_ADD':
      case 'MESSAGE_REACTION_REMOVE': {
        const ch = channels.get(d.channel_id) || (d.guild_id ? null : upsertChannel({ id: d.channel_id, type: ChannelType.DM }));
        if (!ch) break;
        const add = t === 'MESSAGE_REACTION_ADD';
        let m = ch.messages.cache.get(d.message_id);
        let r;
        if (m) {
          const key = reactionKey(d.emoji);
          r = m.reactions.cache.get(key) || makeReaction(m, { emoji: d.emoji, count: 0 });
          r.count = Math.max(0, r.count + (add ? 1 : -1));
          if (d.user_id === client.user?.id) r.me = add;
          if (r.count > 0) m.reactions.cache.set(key, r);
          else m.reactions.cache.delete(key);
        } else {
          // Nachricht nicht im Speicher → „Teil-Reaktion“; der Service lädt die Nachricht selbst nach
          m = { id: d.message_id, channelId: d.channel_id, guildId: d.guild_id ?? null, channel: ch, partial: true, fetch: () => ch.messages.fetch(d.message_id) };
          r = { partial: false, message: m };
        }
        client.emit(add ? Events.MessageReactionAdd : Events.MessageReactionRemove, r, { id: d.user_id });
        break;
      }
      case 'MESSAGE_REACTION_REMOVE_ALL': {
        const m = channels.get(d.channel_id)?.messages.cache.get(d.message_id);
        if (m) {
          m.reactions.cache.clear();
          client.emit(Events.MessageReactionRemoveAll, m);
        }
        break;
      }
      case 'MESSAGE_POLL_VOTE_ADD':
      case 'MESSAGE_POLL_VOTE_REMOVE': {
        const ch = channels.get(d.channel_id);
        if (!ch) break;
        // Stimmenzahl frisch laden (Discord schickt nur „wer hat was gewählt“)
        ch.messages.cache.delete(d.message_id);
        client.emit(t === 'MESSAGE_POLL_VOTE_ADD' ? Events.MessagePollVoteAdd : Events.MessagePollVoteRemove, { poll: { channel: ch, messageId: d.message_id } }, d.user_id);
        break;
      }
      case 'TYPING_START': {
        const ch = channels.get(d.channel_id) || (d.guild_id ? null : upsertChannel({ id: d.channel_id, type: ChannelType.DM }));
        const g = d.guild_id ? guilds.get(d.guild_id) : null;
        const member = g && d.member ? upsertMember(g, d.member) : null;
        const user = member?.user || users.get(d.user_id) || { id: d.user_id };
        client.emit(Events.TypingStart, { channel: ch, user, member, guild: g });
        break;
      }
      case 'PRESENCE_UPDATE': {
        const g = guilds.get(d.guild_id);
        if (g && d.user?.id) client.emit(Events.PresenceUpdate, null, setPresence(g, d));
        break;
      }
      case 'VOICE_STATE_UPDATE': {
        const g = guilds.get(d.guild_id);
        if (!g) break;
        setVoiceState(g, d);
        client.emit(Events.VoiceStateUpdate, null, { guild: g, id: d.user_id, channelId: d.channel_id });
        break;
      }
      case 'INTERACTION_CREATE': {
        const i = {
          id: d.id,
          guildId: d.guild_id ?? null,
          commandName: d.data?.name,
          user: upsertUser(d.member?.user || d.user),
          isChatInputCommand: () => d.type === 2 && (d.data?.type ?? 1) === 1,
          reply: (p) => rest.post(`/interactions/${d.id}/${d.token}/callback`, { body: { type: 4, data: toApiMessage(p) } }),
        };
        client.emit(Events.InteractionCreate, i);
        break;
      }
      default:
        break;
    }
  }

  client.login = async (token) => {
    destroyed = false;
    client.token = token;
    rest.setToken(token);
    open(GATEWAY);
    return token;
  };
  client.destroy = async () => {
    destroyed = true;
    ready = false;
    stopHeartbeat();
    clearTimeout(readyTimer);
    try {
      ws?.close(1000);
    } catch {
      /* egal */
    }
    ws = null;
  };
  return client;
}

// Gleiche Form wie das discord.js-Modul (für createDiscordService({ discord }))
const liteDiscord = { PermissionFlagsBits, ChannelType, GatewayIntentBits, MessageFlags, Routes, Events, RESTEvents, Partials };

module.exports = { createClient, liteDiscord, Collection, Permissions, toApiMessage, Events, FATAL };
