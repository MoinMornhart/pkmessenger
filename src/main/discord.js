'use strict';

// EINZIGE Datei, die discord.js importiert. Der Token verlässt diesen Prozess nie Richtung Renderer.
const { loadToken, botIdFromToken } = require('./env');
const { describeError, appError } = require('./errors');
const { buildAllowedMentions } = require('../shared/mentions');
const { compareSnowflakes } = require('../shared/snowflake');
const { TYPING_THROTTLE_MS } = require('../shared/limits');

const LOGIN_TIMEOUT_MS = 45000;
// Gateway-Close-Codes, bei denen ein Reconnect sinnlos ist (falscher Token, Intent nicht freigeschaltet, ...).
const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

/**
 * @param {object} opts
 * @param {object} opts.discord   discord.js-Modul (in Tests ein Fake mit gleicher Form)
 * @param {string} opts.envPath   Pfad zur .env-Datei
 * @param {(type: string, payload: any) => void} opts.emit  Events an den Renderer
 * @param {() => object} [opts.createClient]  Fabrik für den Client (Tests)
 */
function createDiscordService({ discord, envPath, emit, createClient, loginTimeoutMs = LOGIN_TIMEOUT_MS, statusExtra = {} }) {
  const { GatewayIntentBits, PermissionFlagsBits, ChannelType, Events, RESTEvents } = discord;
  const TEXT_TYPES = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
  // Sprachkanäle (Stage-Kanäle bewusst nicht – dort gelten Sprecher-Regeln).
  const VOICE_TYPES = new Set([ChannelType.GuildVoice]);

  const makeClient =
    createClient ||
    (() =>
      new discord.Client({
        // Nur was wir brauchen (Datensparsamkeit). KEIN GuildMembers, KEIN GuildPresences.
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMessageTyping,
          GatewayIntentBits.GuildVoiceStates, // nicht privilegiert; nötig für Sprachkanäle (wer ist drin, Beitreten)
        ],
        // Sicherheitsnetz: standardmäßig pingt der Bot NIEMANDEN, nur explizit gelistete IDs.
        allowedMentions: { parse: [], repliedUser: false },
      }));

  let client = null;
  let connecting = null;
  let status = { state: 'idle' };
  const lastTyping = new Map();

  function setStatus(next) {
    status = { ...next, ...statusExtra, envPath, updatedAt: Date.now() };
    emit('status', status);
    return status;
  }

  function getStatus() {
    return status;
  }

  function requireReady() {
    if (!client || status.state !== 'ready' || !client.isReady?.()) throw appError('NOT_READY', 'Nicht verbunden.');
    return client;
  }

  function requireGuild(guildId) {
    const guild = requireReady().guilds.cache.get(guildId);
    if (!guild) throw appError('NOT_FOUND', 'Server nicht gefunden oder Bot nicht (mehr) Mitglied.');
    return guild;
  }

  function permsIn(channel) {
    const me = channel.guild?.members?.me;
    return me ? channel.permissionsFor(me) : null;
  }

  function can(channel, flag) {
    const p = permsIn(channel);
    return Boolean(p && p.has(flag));
  }

  // Liefert nur Kanäle, die der Bot wirklich SEHEN darf.
  function requireTextChannel(channelId) {
    const channel = requireReady().channels.cache.get(channelId);
    if (!channel || !TEXT_TYPES.has(channel.type) || !can(channel, PermissionFlagsBits.ViewChannel))
      throw appError('NOT_FOUND', 'Kanal nicht gefunden oder für den Bot nicht sichtbar.');
    return channel;
  }

  function botInfo() {
    const u = client.user;
    return { id: u.id, username: u.username, displayName: u.globalName || u.username, avatarUrl: u.displayAvatarURL({ size: 64, extension: 'png' }) };
  }

  // ---------- Verbindung ----------

  async function destroyClient() {
    const old = client;
    client = null;
    if (old) {
      old.removeAllListeners();
      try {
        await old.destroy();
      } catch {
        /* beim Aufräumen egal */
      }
    }
  }

  function attachEvents(c) {
    c.on(Events.ShardReconnecting, () => {
      if (status.state === 'ready') setStatus({ ...status, state: 'reconnecting' });
    });
    c.on(Events.ShardResume, () => setStatus({ state: 'ready', bot: botInfo() }));
    c.on(Events.ShardReady, () => {
      if (status.state === 'reconnecting') setStatus({ state: 'ready', bot: botInfo() });
    });
    c.on(Events.ShardDisconnect, (ev) => {
      if (status.state === 'ready' || status.state === 'reconnecting') {
        const error = describeError({ code: ev?.code });
        setStatus({ state: 'error', error: error.code === 'UNKNOWN' ? describeError({ code: 'ECONNRESET' }) : error });
      }
    });
    c.on(Events.Error, (err) => emit('log', { level: 'error', message: describeError(err).message }));

    c.on(Events.MessageCreate, (msg) => {
      if (!msg.guildId) return; // keine DMs (nicht Teil des Produkts)
      emit('message:create', serializeMessage(msg));
    });
    c.on(Events.MessageUpdate, (_old, msg) => {
      if (!msg.guildId || msg.partial) return;
      emit('message:update', serializeMessage(msg));
    });
    c.on(Events.MessageDelete, (msg) => {
      if (!msg.guildId) return;
      emit('message:delete', { id: msg.id, channelId: msg.channelId });
    });
    c.on(Events.TypingStart, (typing) => {
      if (!typing.guild || typing.user?.id === c.user?.id) return;
      emit('typing', {
        channelId: typing.channel.id,
        userId: typing.user.id,
        name: typing.member?.displayName || typing.user.globalName || typing.user.username || 'Jemand',
      });
    });
    const guildsChanged = () => emit('guilds:changed', {});
    c.on(Events.GuildCreate, guildsChanged);
    c.on(Events.GuildDelete, guildsChanged);
    c.on(Events.GuildUpdate, guildsChanged);
    const channelsChanged = (ch) => emit('channels:changed', { guildId: ch.guildId ?? ch.guild?.id ?? null });
    c.on(Events.ChannelCreate, channelsChanged);
    c.on(Events.ChannelUpdate, (_o, ch) => channelsChanged(ch));
    c.on(Events.ChannelDelete, channelsChanged);
    c.on(Events.GuildRoleUpdate, (role) => emit('channels:changed', { guildId: role.guild.id }));
    // Wer ist in welchem Sprachkanal? Renderer lädt die Liste daraufhin neu.
    c.on(Events.VoiceStateUpdate, (_old, now) => emit('voice:members', { guildId: now.guild.id }));

    // discord.js/@discordjs/rest wartet bei 429 selbst retry_after ab – wir zeigen es nur an.
    c.rest?.on?.(RESTEvents.RateLimited, (info) => {
      emit('ratelimit', { retryAfterMs: info.retryAfter ?? info.timeToReset, global: Boolean(info.global), route: info.route });
    });
  }

  async function connect() {
    if (connecting) return connecting;
    connecting = (async () => {
      await destroyClient();
      const tokenResult = loadToken(envPath);
      if (tokenResult.status !== 'ok') return setStatus({ state: 'setup', reason: tokenResult.status });

      setStatus({ state: 'connecting' });
      const c = makeClient();
      client = c;
      attachEvents(c);
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(appError('LOGIN_TIMEOUT', 'Login-Timeout')), loginTimeoutMs);
          const done = (fn, v) => {
            clearTimeout(timer);
            c.off(Events.ShardDisconnect, onDisconnect);
            fn(v);
          };
          const onDisconnect = (ev) => {
            if (FATAL_CLOSE_CODES.has(ev?.code)) done(reject, { code: ev.code });
          };
          c.on(Events.ShardDisconnect, onDisconnect);
          c.once(Events.ClientReady, () => done(resolve));
          c.login(tokenResult.token).catch((err) => done(reject, err));
        });
        return setStatus({ state: 'ready', bot: botInfo() });
      } catch (err) {
        const error = describeError(err);
        await destroyClient();
        return setStatus({ state: error.code === 'TOKEN_INVALID' ? 'setup' : 'error', reason: error.code, error });
      }
    })();
    try {
      return await connecting;
    } finally {
      connecting = null;
    }
  }

  async function disconnect() {
    await destroyClient();
    return setStatus({ state: 'disconnected' });
  }

  // ---------- Daten ----------

  function listGuilds() {
    const c = requireReady();
    return [...c.guilds.cache.values()]
      .map((g) => ({ id: g.id, name: g.name, acronym: g.nameAcronym, iconUrl: g.iconURL({ size: 96, extension: 'png' }) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  function listChannels({ guildId }) {
    const guild = requireGuild(guildId);
    const all = [...guild.channels.cache.values()];
    const visible = all.filter((ch) => (TEXT_TYPES.has(ch.type) || VOICE_TYPES.has(ch.type)) && can(ch, PermissionFlagsBits.ViewChannel));
    const groups = new Map();
    for (const ch of visible) {
      const key = ch.parentId || '';
      if (!groups.has(key)) {
        const parent = ch.parentId ? guild.channels.cache.get(ch.parentId) : null;
        groups.set(key, { category: parent ? { id: parent.id, name: parent.name } : null, position: parent ? parent.position : -1, channels: [] });
      }
      groups.get(key).channels.push({
        id: ch.id,
        guildId: guild.id,
        name: ch.name,
        type: VOICE_TYPES.has(ch.type) ? 'voice' : ch.type === ChannelType.GuildAnnouncement ? 'announcement' : 'text',
        canConnect: VOICE_TYPES.has(ch.type) && can(ch, PermissionFlagsBits.Connect),
        canSpeak: VOICE_TYPES.has(ch.type) && can(ch, PermissionFlagsBits.Speak),
        topic: ch.topic || '',
        position: ch.position,
        lastMessageId: ch.lastMessageId || null,
        canSend: can(ch, PermissionFlagsBits.SendMessages),
        canReadHistory: can(ch, PermissionFlagsBits.ReadMessageHistory),
        canMentionEveryone: can(ch, PermissionFlagsBits.MentionEveryone),
      });
    }
    return [...groups.values()]
      .sort((a, b) => a.position - b.position)
      .map((g) => ({ category: g.category, channels: g.channels.sort((a, b) => a.position - b.position) }));
  }

  function displayNameOf(user, member) {
    return member?.displayName || user?.globalName || user?.username || 'Unbekannt';
  }

  function serializeMessage(msg) {
    const member = msg.member;
    const roleColor = member?.displayHexColor && member.displayHexColor !== '#000000' ? member.displayHexColor : null;
    const guild = msg.guild;
    return {
      id: msg.id,
      channelId: msg.channelId,
      guildId: msg.guildId,
      nonce: typeof msg.nonce === 'string' ? msg.nonce : msg.nonce != null ? String(msg.nonce) : null,
      author: {
        id: msg.author.id,
        name: displayNameOf(msg.author, member),
        username: msg.author.username,
        avatarUrl: (member || msg.author).displayAvatarURL({ size: 64, extension: 'png' }),
        bot: Boolean(msg.author.bot),
        color: roleColor,
      },
      content: msg.content || '',
      createdTimestamp: msg.createdTimestamp,
      editedTimestamp: msg.editedTimestamp || null,
      system: Boolean(msg.system),
      isOwn: msg.author.id === client?.user?.id,
      attachments: [...msg.attachments.values()].map((a) => ({
        id: a.id,
        name: a.name,
        url: a.url,
        size: a.size,
        contentType: a.contentType || null,
        width: a.width || null,
        height: a.height || null,
      })),
      embedsCount: msg.embeds.length,
      mentions: {
        users: [...msg.mentions.users.values()].map((u) => ({ id: u.id, name: displayNameOf(u, guild?.members?.cache?.get(u.id)) })),
        roles: [...msg.mentions.roles.values()].map((r) => ({ id: r.id, name: r.name, color: r.hexColor !== '#000000' ? r.hexColor : null })),
        channels: [...msg.mentions.channels.values()].map((ch) => ({ id: ch.id, name: ch.name })),
        everyone: Boolean(msg.mentions.everyone),
      },
      reference: msg.reference?.messageId ? { messageId: msg.reference.messageId, channelId: msg.reference.channelId } : null,
    };
  }

  async function getMessages({ channelId, before, limit }) {
    const channel = requireTextChannel(channelId);
    if (!can(channel, PermissionFlagsBits.ReadMessageHistory))
      throw appError('MISSING_PERMISSION', 'Der Bot darf den Verlauf dieses Kanals nicht lesen.', 'Gib der Bot-Rolle hier "Nachrichtenverlauf lesen".');
    const fetched = await channel.messages.fetch({ limit, ...(before ? { before } : {}) });
    const messages = [...fetched.values()].sort((a, b) => compareSnowflakes(a.id, b.id)).map(serializeMessage);
    return { messages, hasMore: fetched.size === limit };
  }

  function previewOf(msg) {
    const text = (msg.cleanContent ?? msg.content ?? '').replace(/\s+/g, ' ').trim();
    return {
      channelId: msg.channelId,
      messageId: msg.id,
      authorName: displayNameOf(msg.author, msg.member),
      isOwn: msg.author.id === client?.user?.id,
      text: text ? text.slice(0, 120) : msg.attachments?.size ? '📎 Anhang' : msg.embeds?.length ? '[Embed]' : '',
      timestamp: msg.createdTimestamp,
    };
  }

  /**
   * Letzte Nachricht pro Kanal für die Chat-Liste (wie in Messenger-Apps).
   * Je Kanal max. 1 Nachricht, nur Kanäle mit Verlaufs-Recht; nacheinander, damit Rate-Limits geschont werden.
   * Nichts davon wird gespeichert.
   */
  async function getPreviews({ guildId }) {
    const guild = requireGuild(guildId);
    const out = {};
    const channels = [...guild.channels.cache.values()].filter(
      (ch) => TEXT_TYPES.has(ch.type) && ch.lastMessageId && can(ch, PermissionFlagsBits.ViewChannel) && can(ch, PermissionFlagsBits.ReadMessageHistory),
    );
    for (const ch of channels) {
      try {
        const cached = ch.messages.cache?.get?.(ch.lastMessageId);
        const msg = cached || (await ch.messages.fetch({ limit: 1 })).values().next().value;
        if (msg) out[ch.id] = previewOf(msg);
      } catch {
        /* einzelner Kanal ohne Vorschau ist kein Fehler */
      }
    }
    return out;
  }

  async function sendMessage({ channelId, content, mentions, nonce }) {
    const channel = requireTextChannel(channelId);
    if (!can(channel, PermissionFlagsBits.SendMessages))
      throw appError('MISSING_PERMISSION', 'Der Bot darf in diesem Kanal nicht schreiben.', 'Gib der Bot-Rolle hier "Nachrichten senden".');
    if (mentions.everyone && !can(channel, PermissionFlagsBits.MentionEveryone))
      throw appError('MISSING_PERMISSION', 'Der Bot darf hier nicht @everyone/@here pingen.', 'Bot-Rolle braucht "@everyone, @here und alle Rollen erwähnen" – oder ohne Ping senden.');
    const sent = await channel.send({
      content,
      ...(nonce ? { nonce, enforceNonce: true } : {}),
      allowedMentions: buildAllowedMentions(mentions),
    });
    return serializeMessage(sent);
  }

  async function sendTyping({ channelId }) {
    const channel = requireTextChannel(channelId);
    if (!can(channel, PermissionFlagsBits.SendMessages)) return false;
    const now = Date.now();
    if (now - (lastTyping.get(channelId) || 0) < TYPING_THROTTLE_MS) return false; // nicht spammen
    lastTyping.set(channelId, now);
    await channel.sendTyping();
    return true;
  }

  async function searchMentionables({ guildId, query }) {
    const guild = requireGuild(guildId);
    const q = query.toLowerCase();
    const canEveryoneSomewhere = Boolean(guild.members.me?.permissions?.has(PermissionFlagsBits.MentionEveryone));
    let members;
    if (q.length === 0) {
      members = [...guild.members.cache.values()].slice(0, 8);
    } else {
      try {
        // "Search Guild Members" braucht laut Doku KEIN privilegiertes GuildMembers-Intent.
        members = [...(await guild.members.search({ query, limit: 8 })).values()];
      } catch {
        members = [...guild.members.cache.values()].filter((m) => m.displayName.toLowerCase().includes(q) || m.user.username.toLowerCase().includes(q)).slice(0, 8);
      }
    }
    const users = members.map((m) => ({
      kind: 'user',
      id: m.id,
      display: m.displayName,
      sub: m.user.username,
      avatarUrl: m.displayAvatarURL({ size: 32, extension: 'png' }),
      bot: Boolean(m.user.bot),
    }));
    const roles = [...guild.roles.cache.values()]
      .filter((r) => r.id !== guild.id && r.name.toLowerCase().includes(q))
      .sort((a, b) => b.position - a.position)
      .slice(0, 5)
      .map((r) => ({ kind: 'role', id: r.id, display: r.name, color: r.hexColor !== '#000000' ? r.hexColor : null, pingable: r.mentionable || canEveryoneSomewhere }));
    const special = ['everyone', 'here'].filter((s) => s.startsWith(q)).map((s) => ({ kind: s, id: s, display: s }));
    return [...users, ...roles, ...special];
  }

  function getInviteUrl() {
    const appId = client?.application?.id || (() => {
      const t = loadToken(envPath);
      return t.status === 'ok' ? botIdFromToken(t.token) : null;
    })();
    if (!appId) return null;
    const P = PermissionFlagsBits;
    const permissions = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AddReactions, P.AttachFiles, P.EmbedLinks, P.Connect, P.Speak].reduce((a, b) => a | b, 0n);
    return `https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot+applications.commands&permissions=${permissions}`;
  }

  // ---------- Sprachkanäle ----------

  /** Teilnehmer aller Sprachkanäle eines Servers: { [channelId]: [{ id, name, avatarUrl, bot, muted, deafened }] } */
  async function listVoiceMembers({ guildId }) {
    const guild = requireGuild(guildId);
    const out = {};
    for (const vs of guild.voiceStates.cache.values()) {
      if (!vs.channelId) continue;
      const ch = guild.channels.cache.get(vs.channelId);
      if (!ch || !can(ch, PermissionFlagsBits.ViewChannel)) continue; // nur Kanäle, die der Bot sehen darf
      let member = vs.member || guild.members.cache.get(vs.id) || (vs.id === client.user.id ? guild.members.me : null);
      // "Get Guild Member" braucht kein privilegiertes Intent. Fehler (auch synchrone) dürfen die Liste nie abbrechen.
      if (!member) member = await Promise.resolve().then(() => guild.members.fetch(vs.id)).catch(() => null);
      const user = member?.user || (vs.id === client.user.id ? client.user : client.users?.cache?.get(vs.id));
      (out[vs.channelId] ||= []).push({
        id: vs.id,
        name: displayNameOf(user, member),
        avatarUrl: (member || user)?.displayAvatarURL?.({ size: 64, extension: 'png' }) || null,
        bot: Boolean(user?.bot),
        isMe: vs.id === client.user.id,
        muted: Boolean(vs.selfMute || vs.serverMute),
        deafened: Boolean(vs.selfDeaf || vs.serverDeaf),
      });
    }
    return out;
  }

  /** Für voice.js: prüft Sichtbarkeit und Rechte und liefert die Objekte zum Beitreten. */
  function getVoiceTarget({ guildId, channelId }) {
    const guild = requireGuild(guildId);
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !VOICE_TYPES.has(channel.type) || !can(channel, PermissionFlagsBits.ViewChannel))
      throw appError('NOT_FOUND', 'Sprachkanal nicht gefunden oder für den Bot nicht sichtbar.');
    if (!can(channel, PermissionFlagsBits.Connect))
      throw appError('MISSING_PERMISSION', 'Der Bot darf diesem Sprachkanal nicht beitreten.', 'Gib der Bot-Rolle im Sprachkanal das Recht „Verbinden“.');
    return { guild, channel, canSpeak: can(channel, PermissionFlagsBits.Speak), botId: client.user.id, channelName: channel.name };
  }

  return {
    connect,
    disconnect,
    getStatus,
    listGuilds,
    listChannels,
    getPreviews,
    getMessages,
    sendMessage,
    sendTyping,
    searchMentionables,
    getInviteUrl,
    serializeMessage,
    listVoiceMembers,
    getVoiceTarget,
  };
}

module.exports = { createDiscordService, FATAL_CLOSE_CODES };
