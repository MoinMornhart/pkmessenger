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
function createDiscordService({ discord, envPath, emit, createClient, loginTimeoutMs = LOGIN_TIMEOUT_MS, statusExtra = {}, getToken = () => loadToken(envPath) }) {
  const { GatewayIntentBits, PermissionFlagsBits, ChannelType, Events, RESTEvents, Partials, MessageFlags, Routes } = discord;
  const TEXT_TYPES = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
  // Sprachkanäle (Stage-Kanäle bewusst nicht – dort gelten Sprecher-Regeln).
  const VOICE_TYPES = new Set([ChannelType.GuildVoice]);
  // Erkannt, aber (noch) nicht bedienbar – werden angezeigt statt stillschweigend zu fehlen (Issue #1: „alle Kanäle erkennen“).
  const OTHER_TYPES = new Map([
    [ChannelType.GuildForum, 'forum'],
    [ChannelType.GuildMedia, 'media'],
    [ChannelType.GuildStageVoice, 'stage'],
  ]);
  const THREAD_TYPES = new Set([ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread]);

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
          GatewayIntentBits.GuildMessageReactions, // F8: Reaktionen live (nicht privilegiert)
          GatewayIntentBits.GuildMessagePolls, // Umfragen: Stimmen live (nicht privilegiert)
        ],
        // F8: Reaktionen auch an älteren, nicht im Speicher liegenden Nachrichten erkennen
        partials: Partials ? [Partials.Message, Partials.Reaction] : [],
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
  const isThread = (ch) => Boolean(ch) && THREAD_TYPES.has(ch.type);
  // In Threads gilt "Nachrichten in Threads senden" statt "Nachrichten senden" (F12)
  const canSendIn = (ch) => can(ch, isThread(ch) ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages);

  function requireTextChannel(channelId) {
    const channel = requireReady().channels.cache.get(channelId);
    const textLike = channel && (TEXT_TYPES.has(channel.type) || isThread(channel));
    if (!textLike || !can(channel, PermissionFlagsBits.ViewChannel)) throw appError('NOT_FOUND', 'Kanal nicht gefunden oder für den Bot nicht sichtbar.');
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
      if (!msg?.guildId) return; // keine DMs (nicht Teil des Produkts)
      emit('message:create', serializeMessage(msg));
    });
    c.on(Events.MessageUpdate, (_old, msg) => {
      if (!msg?.guildId || msg.partial) return;
      emit('message:update', serializeMessage(msg));
    });
    c.on(Events.MessageDelete, (msg) => {
      if (!msg?.guildId || !msg.id) return;
      emit('message:delete', { id: msg.id, channelId: msg.channelId });
    });
    c.on(Events.TypingStart, (typing) => {
      if (!typing?.guild || !typing.channel?.id || !typing.user?.id || typing.user.id === c.user?.id) return;
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
    // F8: Reaktionen live – Nachricht (ggf. nachgeladen) neu an die Oberfläche geben
    const onReaction = async (reaction) => {
      try {
        if (reaction?.partial) await reaction.fetch();
        let m = reaction?.message;
        if (m?.partial) m = await m.fetch();
        if (m?.guildId) emit('message:update', serializeMessage(m));
      } catch {
        /* Nachricht evtl. gelöscht oder nicht mehr sichtbar */
      }
    };
    c.on(Events.MessageReactionAdd, onReaction);
    c.on(Events.MessageReactionRemove, onReaction);
    c.on(Events.MessageReactionRemoveAll, (m) => m?.guildId && !m.partial && emit('message:update', serializeMessage(m)));
    // Umfragen: neue/entfernte Stimme → Nachricht neu an die Oberfläche
    const onVote = async (answer) => {
      try {
        const poll = answer?.poll;
        let m = poll?.channel?.messages?.cache?.get?.(poll.messageId);
        if (!m && poll?.channel?.messages?.fetch) m = await poll.channel.messages.fetch(poll.messageId);
        if (m?.guildId) emit('message:update', serializeMessage(m));
      } catch {
        /* Nachricht nicht mehr erreichbar */
      }
    };
    c.on(Events.MessagePollVoteAdd, onVote);
    c.on(Events.MessagePollVoteRemove, onVote);
    // F12: Threads geändert → Thread-Liste des Kanals neu laden
    const threadsChanged = (t) => {
      if (t?.parentId) emit('threads:changed', { channelId: t.parentId, threadId: t.id });
    };
    c.on(Events.ThreadCreate, threadsChanged);
    c.on(Events.ThreadDelete, threadsChanged);
    c.on(Events.ThreadUpdate, (_o, t) => threadsChanged(t));
    // F15: Slash-Befehle – Antwort innerhalb von 3 Sekunden (Discord-Vorgabe)
    c.on(Events.InteractionCreate, (i) => handleInteraction(i, c));
    // Rechte des Bots können sich ändern (neue Rolle, Rolle gelöscht) → Kanalliste neu berechnen (Issue #1).
    c.on(Events.GuildMemberUpdate, (_old, member) => {
      if (member?.id && member.id === c.user?.id) emit('channels:changed', { guildId: member.guild?.id ?? null });
    });
    c.on(Events.GuildRoleCreate, (role) => emit('channels:changed', { guildId: role?.guild?.id ?? null }));
    c.on(Events.GuildRoleDelete, (role) => emit('channels:changed', { guildId: role?.guild?.id ?? null }));
    // Wer ist in welchem Sprachkanal? Renderer lädt die Liste daraufhin neu.
    c.on(Events.VoiceStateUpdate, (old, now) => {
      const guildId = now?.guild?.id ?? old?.guild?.id;
      if (guildId) emit('voice:members', { guildId });
    });

    // discord.js/@discordjs/rest wartet bei 429 selbst retry_after ab – wir zeigen es nur an.
    c.rest?.on?.(RESTEvents.RateLimited, (info) => {
      emit('ratelimit', { retryAfterMs: info.retryAfter ?? info.timeToReset, global: Boolean(info.global), route: info.route });
    });
  }

  async function connect() {
    if (connecting) return connecting;
    connecting = (async () => {
      await destroyClient();
      const tokenResult = getToken(); // verschlüsselter Tresor (secrets.js) oder .env
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
        registerCommands(c); // F15, läuft im Hintergrund
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
    const all = [...guild.channels.cache.values()].filter(Boolean);
    const known = (ch) => TEXT_TYPES.has(ch.type) || VOICE_TYPES.has(ch.type) || OTHER_TYPES.has(ch.type);
    const visible = all.filter((ch) => known(ch) && can(ch, PermissionFlagsBits.ViewChannel));
    const groups = new Map();
    for (const ch of visible) {
      const key = ch.parentId || '';
      if (!groups.has(key)) {
        const parent = ch.parentId ? guild.channels.cache.get(ch.parentId) : null;
        groups.set(key, { category: parent ? { id: parent.id, name: parent.name ?? '' } : null, position: parent ? (parent.position ?? 0) : -1, channels: [] });
      }
      const other = OTHER_TYPES.get(ch.type);
      groups.get(key).channels.push({
        id: ch.id,
        guildId: guild.id,
        name: ch.name ?? '(ohne Namen)',
        type: other || (VOICE_TYPES.has(ch.type) ? 'voice' : ch.type === ChannelType.GuildAnnouncement ? 'announcement' : 'text'),
        unsupported: Boolean(other), // Forum/Medien/Stage: angezeigt, aber noch nicht bedienbar
        canConnect: VOICE_TYPES.has(ch.type) && can(ch, PermissionFlagsBits.Connect),
        canSpeak: VOICE_TYPES.has(ch.type) && can(ch, PermissionFlagsBits.Speak),
        topic: ch.topic || '',
        position: ch.position ?? 0,
        lastMessageId: other ? null : ch.lastMessageId || null,
        canSend: !other && can(ch, PermissionFlagsBits.SendMessages),
        canReadHistory: !other && can(ch, PermissionFlagsBits.ReadMessageHistory),
        canMentionEveryone: can(ch, PermissionFlagsBits.MentionEveryone),
        // F7–F13: damit die Oberfläche nur Knöpfe zeigt, die auch funktionieren
        canPin: !other && can(ch, PermissionFlagsBits.PinMessages ?? PermissionFlagsBits.ManageMessages),
        canCreateThreads: other === 'forum' ? can(ch, PermissionFlagsBits.SendMessages) : !other && can(ch, PermissionFlagsBits.CreatePublicThreads),
        canAttach: !other && can(ch, PermissionFlagsBits.AttachFiles),
        canEmbed: !other && can(ch, PermissionFlagsBits.EmbedLinks),
        canPoll: !other && can(ch, PermissionFlagsBits.SendPolls ?? PermissionFlagsBits.SendMessages),
      });
    }
    return [...groups.values()]
      .sort((a, b) => a.position - b.position)
      .map((g) => ({ category: g.category, channels: g.channels.sort((a, b) => a.position - b.position) }));
  }

  function displayNameOf(user, member) {
    return member?.displayName || user?.globalName || user?.username || 'Unbekannt';
  }

  // Null-sichere Helfer: Discord-Objekte können je nach Nachrichtentyp (System, Webhook, gelöschter Nutzer) Lücken haben.
  const valuesOf = (coll) => (coll && typeof coll.values === 'function' ? [...coll.values()].filter(Boolean) : []);
  const avatarOf = (obj) => {
    try {
      return typeof obj?.displayAvatarURL === 'function' ? obj.displayAvatarURL({ size: 64, extension: 'png' }) || null : null;
    } catch {
      return null;
    }
  };
  const hexOrNull = (hex) => (typeof hex === 'string' && hex !== '#000000' ? hex : null);

  function serializeMessage(msg) {
    const author = msg?.author ?? null;
    const member = msg?.member ?? null;
    const guild = msg?.guild ?? null;
    const ts = Number.isFinite(msg?.createdTimestamp) ? msg.createdTimestamp : Date.now();
    return {
      id: String(msg?.id ?? ''),
      channelId: msg?.channelId ?? null,
      guildId: msg?.guildId ?? null,
      nonce: typeof msg?.nonce === 'string' ? msg.nonce : msg?.nonce != null ? String(msg.nonce) : null,
      author: {
        id: author?.id ?? '0',
        name: displayNameOf(author, member),
        username: author?.username ?? 'unbekannt',
        avatarUrl: avatarOf(member) || avatarOf(author),
        bot: Boolean(author?.bot),
        color: hexOrNull(member?.displayHexColor),
      },
      content: typeof msg?.content === 'string' ? msg.content : '',
      createdTimestamp: ts,
      editedTimestamp: msg?.editedTimestamp || null,
      system: Boolean(msg?.system),
      isOwn: Boolean(author?.id) && author.id === client?.user?.id,
      attachments: valuesOf(msg?.attachments).map((a) => ({
        id: a.id ?? '',
        name: a.name ?? 'Datei',
        url: a.url ?? '',
        size: Number(a.size) || 0,
        contentType: a.contentType || null,
        width: a.width || null,
        height: a.height || null,
      })),
      embedsCount: Array.isArray(msg?.embeds) ? msg.embeds.length : 0,
      mentions: {
        users: valuesOf(msg?.mentions?.users).map((u) => ({ id: u.id, name: displayNameOf(u, guild?.members?.cache?.get?.(u.id)) })),
        roles: valuesOf(msg?.mentions?.roles).map((r) => ({ id: r.id, name: r.name ?? 'Rolle', color: hexOrNull(r.hexColor) })),
        channels: valuesOf(msg?.mentions?.channels).map((ch) => ({ id: ch.id, name: ch.name ?? 'kanal' })),
        everyone: Boolean(msg?.mentions?.everyone),
      },
      reference: msg?.reference?.messageId ? { messageId: msg.reference.messageId, channelId: msg.reference.channelId ?? null, ...replyPreview(msg) } : null,
      reactions: valuesOf(msg?.reactions?.cache).map(serializeReaction).filter(Boolean),
      embeds: (Array.isArray(msg?.embeds) ? msg.embeds : []).slice(0, 10).map(serializeEmbed),
      pinned: Boolean(msg?.pinned),
      poll: serializePoll(msg?.poll),
      thread: msg?.hasThread && msg.thread ? { id: msg.thread.id, name: msg.thread.name ?? 'Thread', messageCount: msg.thread.messageCount ?? null } : null,
      // Bearbeiten nur eigene (Discord-Regel); Löschen eigene oder mit "Nachrichten verwalten"
      canEdit: Boolean(author?.id) && author.id === client?.user?.id,
      canDelete: (Boolean(author?.id) && author.id === client?.user?.id) || (msg?.channel ? can(msg.channel, PermissionFlagsBits.ManageMessages) : false),
    };
  }

  // Umfragen: Frage, Antworten mit Stimmen, Ende, ob ausgezählt
  function serializePoll(p) {
    if (!p) return null;
    const answers = valuesOf(p.answers).map((a) => ({ id: a.id, text: a.text ?? '', emoji: a.emoji?.name ?? null, count: Number(a.voteCount) || 0 }));
    return {
      question: p.question?.text ?? '',
      answers,
      total: answers.reduce((n, a) => n + a.count, 0),
      allowMultiselect: Boolean(p.allowMultiselect),
      expiresTimestamp: p.expiresTimestamp ?? null,
      finalized: Boolean(p.resultsFinalized),
    };
  }

  // F7: Vorschau der Nachricht, auf die geantwortet wurde (nur wenn sie im Speicher liegt – kein Extra-Request)
  function replyPreview(msg) {
    const ref = msg?.channel?.messages?.cache?.get?.(msg.reference.messageId);
    if (!ref) return { authorName: null, text: null };
    const t = (typeof ref.content === 'string' ? ref.content : '').replace(/\s+/g, ' ').trim();
    return { authorName: displayNameOf(ref.author, ref.member), text: t ? t.slice(0, 100) : ref.attachments?.size ? '📎 Anhang' : '…' };
  }

  // F8: Reaktion → { key, name, id, url, count, me }. key = Unicode-Emoji oder "name:id" (eigene Server-Emojis)
  function serializeReaction(r) {
    const e = r?.emoji;
    if (!e?.name && !e?.id) return null;
    let url = null;
    try {
      url = e.id && typeof e.imageURL === 'function' ? e.imageURL({ size: 48 }) : null;
    } catch {
      url = null;
    }
    return { key: e.id ? `${e.name ?? 'emoji'}:${e.id}` : e.name, name: e.name ?? '', id: e.id ?? null, animated: Boolean(e.animated), url, count: Number(r.count) || 0, me: Boolean(r.me) };
  }

  // F11: Embed anzeigen (nur Anzeige-Felder, alles null-sicher und gekürzt)
  function serializeEmbed(e) {
    const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
    return {
      title: s(e?.title, 256),
      description: s(e?.description, 4096),
      url: s(e?.url, 2048),
      color: Number.isFinite(e?.color) ? `#${e.color.toString(16).padStart(6, '0')}` : null,
      author: e?.author?.name ? { name: s(e.author.name, 256), url: s(e.author.url, 2048), iconUrl: s(e.author.iconURL ?? e.author.icon_url, 2048) } : null,
      fields: (Array.isArray(e?.fields) ? e.fields : []).slice(0, 25).map((f) => ({ name: s(f?.name, 256) ?? '', value: s(f?.value, 1024) ?? '', inline: Boolean(f?.inline) })),
      // Discord-Proxy-Adresse bevorzugen (CSP erlaubt nur Discord-CDN; schützt vor Tracking durch fremde Server)
      image: s(e?.image?.proxyURL ?? e?.image?.proxy_url ?? e?.image?.url, 2048),
      thumbnail: s(e?.thumbnail?.proxyURL ?? e?.thumbnail?.proxy_url ?? e?.thumbnail?.url, 2048),
      footer: e?.footer?.text ? s(e.footer.text, 2048) : null,
      timestamp: e?.timestamp ? Date.parse(e.timestamp) || null : null,
    };
  }

  // F11: Embed aus dem Baukasten der Oberfläche → Discord-API-Format
  function toApiEmbed(e) {
    const out = {};
    if (e.title) out.title = e.title;
    if (e.description) out.description = e.description;
    if (e.url) out.url = e.url;
    if (e.color) out.color = parseInt(e.color.slice(1), 16);
    if (e.footer) out.footer = { text: e.footer };
    if (e.image) out.image = { url: e.image };
    return out;
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
    const raw = msg?.cleanContent ?? msg?.content ?? '';
    const text = (typeof raw === 'string' ? raw : '').replace(/\s+/g, ' ').trim();
    return {
      channelId: msg?.channelId ?? null,
      messageId: msg?.id ?? null,
      authorName: displayNameOf(msg?.author, msg?.member),
      isOwn: Boolean(msg?.author?.id) && msg.author.id === client?.user?.id,
      text: text ? text.slice(0, 120) : msg?.attachments?.size ? '📎 Anhang' : msg?.embeds?.length ? '[Embed]' : '',
      timestamp: Number.isFinite(msg?.createdTimestamp) ? msg.createdTimestamp : 0,
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

  async function sendMessage({ channelId, content, mentions, nonce, replyTo = null, pingReply = false, files = [], embeds = [], poll = null }) {
    const channel = requireTextChannel(channelId);
    if (!canSendIn(channel))
      throw appError('MISSING_PERMISSION', 'Der Bot darf in diesem Kanal nicht schreiben.', 'Gib der Bot-Rolle hier "Nachrichten senden".');
    if (mentions.everyone && !can(channel, PermissionFlagsBits.MentionEveryone))
      throw appError('MISSING_PERMISSION', 'Der Bot darf hier nicht @everyone/@here pingen.', 'Bot-Rolle braucht "@everyone, @here und alle Rollen erwähnen" – oder ohne Ping senden.');
    const payload = {
      ...(content ? { content } : {}),
      ...(nonce ? { nonce, enforceNonce: true } : {}),
      // Antworten (F7): Antwort-Ping nur, wenn ausdrücklich gewünscht
      allowedMentions: { ...buildAllowedMentions(mentions), repliedUser: Boolean(pingReply) },
    };
    if (replyTo) payload.reply = { messageReference: replyTo, failIfNotExists: false };
    if (files.length) {
      if (!can(channel, PermissionFlagsBits.AttachFiles))
        throw appError('MISSING_PERMISSION', 'Der Bot darf hier keine Dateien senden.', 'Gib der Bot-Rolle hier "Dateien anhängen".');
      payload.files = files.map((f) => ({ attachment: Buffer.from(f.data), name: f.name }));
    }
    if (embeds.length) {
      if (!can(channel, PermissionFlagsBits.EmbedLinks))
        throw appError('MISSING_PERMISSION', 'Der Bot darf hier keine Embeds senden.', 'Gib der Bot-Rolle hier "Links einbetten".');
      payload.embeds = embeds.map(toApiEmbed);
    }
    if (poll) {
      if (!can(channel, PermissionFlagsBits.SendPolls ?? PermissionFlagsBits.SendMessages))
        throw appError('MISSING_PERMISSION', 'Der Bot darf hier keine Umfragen erstellen.', 'Gib der Bot-Rolle hier "Umfragen erstellen".');
      payload.poll = { question: { text: poll.question }, answers: poll.answers.map((text) => ({ text })), duration: poll.durationHours, allowMultiselect: poll.allowMultiselect };
    }
    const sent = await channel.send(payload);
    return serializeMessage(sent);
  }

  async function sendTyping({ channelId }) {
    const channel = requireTextChannel(channelId);
    if (!canSendIn(channel)) return false;
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

  /** Bot-Einladungslink. Mit guildId ist der Server vorausgewählt und fixiert (offizielle Parameter guild_id + disable_guild_select). */
  function getInviteUrl({ guildId } = {}) {
    const appId = client?.application?.id || (() => {
      const t = getToken();
      return t.status === 'ok' ? botIdFromToken(t.token) : null;
    })();
    if (!appId) return null;
    const P = PermissionFlagsBits;
    const permissions = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AddReactions, P.AttachFiles, P.EmbedLinks, P.Connect, P.Speak, P.PinMessages, P.CreatePublicThreads, P.SendMessagesInThreads, P.SendPolls].filter((x) => typeof x === "bigint").reduce((a, b) => a | b, 0n);
    const preselect = guildId ? `&guild_id=${guildId}&disable_guild_select=true` : '';
    return `https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot+applications.commands&permissions=${permissions}${preselect}`;
  }

  /**
   * Vorschau einer Server-Einladung (offizieller Endpoint GET /invites/{code}). Der Bot tritt dabei NICHT bei –
   * beitreten tut der Nutzer selbst in der offiziellen Discord-App mit seinem Account.
   */
  async function previewInvite({ code }) {
    const c = requireReady();
    const inv = await c.fetchInvite(code);
    const g = inv?.guild ?? null;
    if (!g?.id) throw appError('NOT_FOUND', 'Diese Einladung führt zu keinem Server (z. B. Gruppen-DM).', 'Nur Server-Einladungen werden unterstützt.');
    let iconUrl = null;
    try {
      iconUrl = typeof g.iconURL === 'function' ? g.iconURL({ size: 128, extension: 'png' }) : null;
    } catch {
      iconUrl = null;
    }
    return {
      code: inv.code ?? code,
      guild: { id: g.id, name: g.name ?? 'Unbekannter Server', iconUrl, description: g.description ?? null },
      memberCount: Number.isFinite(inv.memberCount) ? inv.memberCount : null,
      onlineCount: Number.isFinite(inv.presenceCount) ? inv.presenceCount : null,
      channelName: inv.channel?.name ?? null,
      expiresAt: inv.expiresTimestamp ?? null,
      botAlreadyThere: c.guilds.cache.has(g.id),
    };
  }

  // ---------- F15 Slash-Befehle ----------
  const COMMANDS = [
    { name: 'ping', description: 'Prüft, ob der Bot (PKMessenger) erreichbar ist' },
    { name: 'pkmessenger', description: 'Was ist dieser Bot? Infos zu PKMessenger' },
  ];
  let commandsState = { registered: false, error: null };

  /** Globale Befehle setzen (Bulk-Overwrite = idempotent, keine Doppelungen). */
  async function registerCommands(c) {
    try {
      if (!c?.application?.commands?.set) return;
      await c.application.commands.set(COMMANDS);
      commandsState = { registered: true, error: null };
    } catch (err) {
      commandsState = { registered: false, error: describeError(err).message };
      emit('log', { level: 'warn', message: `Slash-Befehle konnten nicht registriert werden: ${commandsState.error}` });
    }
  }

  async function handleInteraction(i, c) {
    try {
      if (!i?.isChatInputCommand?.()) return;
      const ephemeral = MessageFlags?.Ephemeral ? { flags: MessageFlags.Ephemeral } : {};
      if (i.commandName === 'ping') {
        const ms = Number.isFinite(c?.ws?.ping) && c.ws.ping >= 0 ? `${Math.round(c.ws.ping)} ms` : 'unbekannt';
        await i.reply({ content: `🏓 Pong! Verbindung zu Discord: ${ms}`, allowedMentions: { parse: [] }, ...ephemeral });
      } else if (i.commandName === 'pkmessenger') {
        await i.reply({
          content: 'Dieser Bot wird über **PKMessenger** gesteuert – ein Bot-Control-Center. Nachrichten von ihm schreibt eine echte Person über die App, gekennzeichnet als Bot.',
          allowedMentions: { parse: [] },
          ...ephemeral,
        });
      }
      emit('interaction', { command: i.commandName, user: i.user?.username ?? null, guildId: i.guildId ?? null });
    } catch {
      /* Antwort zu spät oder Interaktion abgelaufen – nichts weiter zu tun */
    }
  }

  // ---------- Aktualisieren & Kanalzugriff (Issue #1) ----------

  /**
   * Holt Bot-Mitgliedschaft (Rollen), Rollen-Rechte und Kanäle (inkl. Rechte-Overwrites) frisch per REST.
   * Hilft, wenn Discord eine Rechteänderung nicht per Gateway-Event gemeldet hat.
   */
  async function refresh({ guildId } = {}) {
    const c = requireReady();
    const guilds = guildId ? [requireGuild(guildId)] : [...c.guilds.cache.values()];
    let refreshed = 0;
    const failed = [];
    for (const g of guilds) {
      try {
        await g.members.fetchMe({ force: true });
        await g.roles.fetch(undefined, { force: true });
        await g.channels.fetch(undefined, { force: true });
        refreshed++;
      } catch {
        failed.push(g.name ?? g.id);
      }
    }
    emit('guilds:changed', {});
    for (const g of guilds) emit('channels:changed', { guildId: g.id });
    return { refreshed, failed };
  }

  /** Welche Text-/Sprachkanäle sind für den Bot gesperrt oder nur lesbar? (zum Anzeigen + Erklären) */
  function getChannelAccess({ guildId }) {
    const guild = requireGuild(guildId);
    const all = [...guild.channels.cache.values()].filter(Boolean);
    const relevant = all.filter((ch) => TEXT_TYPES.has(ch.type) || VOICE_TYPES.has(ch.type) || OTHER_TYPES.has(ch.type));
    const describe = (ch) => ({
      id: ch.id,
      name: ch.name ?? '(ohne Namen)',
      type: OTHER_TYPES.get(ch.type) || (VOICE_TYPES.has(ch.type) ? 'voice' : 'text'),
      category: (ch.parentId && guild.channels.cache.get(ch.parentId)?.name) || null,
    });
    // Sichtbare, aber noch nicht bedienbare Kanäle + aktive Threads (kommen mit F12)
    const unsupported = relevant.filter((ch) => OTHER_TYPES.has(ch.type) && can(ch, PermissionFlagsBits.ViewChannel)).map(describe);
    const threads = all.filter((ch) => THREAD_TYPES.has(ch.type)).length;
    const byPos = (a, b) => (a.position ?? 0) - (b.position ?? 0);
    const hidden = relevant.filter((ch) => !can(ch, PermissionFlagsBits.ViewChannel)).sort(byPos).map(describe);
    const readOnly = relevant
      .filter((ch) => TEXT_TYPES.has(ch.type) && can(ch, PermissionFlagsBits.ViewChannel) && !can(ch, PermissionFlagsBits.SendMessages))
      .sort(byPos)
      .map(describe);
    return { total: relevant.length, hidden, readOnly, unsupported, threads };
  }

  // ---------- F9 Bearbeiten/Löschen, F8 Reaktionen, F13 Pins ----------

  async function requireMessage(channelId, messageId) {
    const channel = requireTextChannel(channelId);
    const cached = channel.messages?.cache?.get?.(messageId);
    const msg = cached || (await channel.messages.fetch(messageId).catch(() => null));
    if (!msg) throw appError('NOT_FOUND', 'Nachricht nicht gefunden (evtl. gelöscht).');
    return { channel, msg };
  }

  async function editMessage({ channelId, messageId, content, mentions }) {
    const { msg } = await requireMessage(channelId, messageId);
    if (msg.author?.id !== client.user.id) throw appError('MISSING_PERMISSION', 'Nur eigene Nachrichten des Bots können bearbeitet werden.', 'Das ist eine Discord-Regel.');
    const edited = await msg.edit({ content, allowedMentions: buildAllowedMentions(mentions) });
    return serializeMessage(edited);
  }

  async function deleteMessage({ channelId, messageId }) {
    const { channel, msg } = await requireMessage(channelId, messageId);
    const own = msg.author?.id === client.user.id;
    if (!own && !can(channel, PermissionFlagsBits.ManageMessages))
      throw appError('MISSING_PERMISSION', 'Der Bot darf fremde Nachrichten hier nicht löschen.', 'Dafür braucht die Bot-Rolle "Nachrichten verwalten".');
    await msg.delete();
    return { id: messageId, channelId };
  }

  const reactionKey = (r) => (r?.emoji?.id ? `${r.emoji.name}:${r.emoji.id}` : r?.emoji?.name);

  async function react({ channelId, messageId, emoji, add }) {
    const { channel, msg } = await requireMessage(channelId, messageId);
    if (add) {
      const existing = valuesOf(msg.reactions?.cache).find((r) => reactionKey(r) === emoji);
      if (!existing && !can(channel, PermissionFlagsBits.AddReactions))
        throw appError('MISSING_PERMISSION', 'Der Bot darf hier keine neuen Reaktionen hinzufügen.', 'Gib der Bot-Rolle "Reaktionen hinzufügen".');
      await msg.react(emoji);
    } else {
      const r = valuesOf(msg.reactions?.cache).find((x) => reactionKey(x) === emoji);
      if (r) await r.users.remove(client.user.id);
    }
    return serializeMessage(msg);
  }

  async function listPins({ channelId }) {
    const channel = requireTextChannel(channelId);
    if (!can(channel, PermissionFlagsBits.ReadMessageHistory)) throw appError('MISSING_PERMISSION', 'Der Bot darf den Verlauf hier nicht lesen.', 'Gib der Bot-Rolle "Nachrichtenverlauf lesen".');
    const res = await channel.messages.fetchPins();
    return { items: (res?.items || []).map((it) => ({ pinnedAt: it.pinnedTimestamp ?? null, message: serializeMessage(it.message) })), hasMore: Boolean(res?.hasMore) };
  }

  async function setPinned({ channelId, messageId, pin }) {
    const { channel, msg } = await requireMessage(channelId, messageId);
    const flag = PermissionFlagsBits.PinMessages ?? PermissionFlagsBits.ManageMessages;
    if (!can(channel, flag)) throw appError('MISSING_PERMISSION', 'Der Bot darf hier nichts anheften.', 'Gib der Bot-Rolle "Nachrichten anheften".');
    if (pin) await msg.pin();
    else await msg.unpin();
    return serializeMessage(msg);
  }

  /** Eigene Umfrage vorzeitig beenden (Discord erlaubt nur eigene). */
  async function endPoll({ channelId, messageId }) {
    const { msg } = await requireMessage(channelId, messageId);
    if (!msg.poll) throw appError('NOT_FOUND', 'Diese Nachricht enthält keine Umfrage.');
    if (msg.author?.id !== client.user.id) throw appError('MISSING_PERMISSION', 'Nur eigene Umfragen des Bots können beendet werden.', 'Das ist eine Discord-Regel.');
    await msg.poll.end();
    const fresh = await msg.fetch?.().catch(() => msg) ?? msg;
    return serializeMessage(fresh);
  }

  // ---------- F12 Threads & Forum-Beiträge ----------

  function serializeThread(t) {
    return {
      id: t.id,
      name: t.name ?? 'Thread',
      parentId: t.parentId ?? null,
      guildId: t.guildId ?? t.guild?.id ?? null,
      archived: Boolean(t.archived),
      locked: Boolean(t.locked),
      messageCount: Number.isFinite(t.messageCount) ? t.messageCount : null,
      lastMessageId: t.lastMessageId ?? null,
      createdTimestamp: t.createdTimestamp ?? null,
      canSend: canSendIn(t),
      canReadHistory: can(t, PermissionFlagsBits.ReadMessageHistory),
    };
  }

  /** Aktive (+ zuletzt archivierte) Threads eines Text-/Forum-Kanals. */
  async function listThreads({ channelId }) {
    const parent = requireReady().channels.cache.get(channelId);
    if (!parent || !can(parent, PermissionFlagsBits.ViewChannel) || !parent.threads) throw appError('NOT_FOUND', 'Kanal nicht gefunden oder ohne Threads.');
    const active = await parent.threads.fetchActive().catch(() => null);
    const archived = await parent.threads.fetchArchived({ limit: 25 }).catch(() => null);
    const all = [...valuesOf(active?.threads), ...valuesOf(archived?.threads)];
    const seen = new Set();
    return all
      .filter((t) => t && !seen.has(t.id) && seen.add(t.id) && can(t, PermissionFlagsBits.ViewChannel))
      .map(serializeThread)
      .sort((a, b) => Number(a.archived) - Number(b.archived) || compareSnowflakes(b.lastMessageId || b.id, a.lastMessageId || a.id));
  }

  /** Thread erstellen: aus einer Nachricht, frei im Textkanal, oder als Forum-Beitrag (mit erster Nachricht). */
  async function createThread({ channelId, name, messageId, content }) {
    const parent = requireReady().channels.cache.get(channelId);
    if (!parent || !can(parent, PermissionFlagsBits.ViewChannel)) throw appError('NOT_FOUND', 'Kanal nicht gefunden.');
    const isForum = parent.type === ChannelType.GuildForum || parent.type === ChannelType.GuildMedia;
    const needed = isForum ? PermissionFlagsBits.SendMessages : PermissionFlagsBits.CreatePublicThreads;
    if (!can(parent, needed)) throw appError('MISSING_PERMISSION', 'Der Bot darf hier keine Threads erstellen.', isForum ? 'Gib der Bot-Rolle im Forum "Beiträge erstellen".' : 'Gib der Bot-Rolle "Öffentliche Threads erstellen".');
    let thread;
    if (isForum) {
      if (!content) throw appError('VALIDATION', 'Ein Forum-Beitrag braucht eine erste Nachricht.');
      thread = await parent.threads.create({ name, message: { content, allowedMentions: { parse: [] } } });
    } else if (messageId) {
      const { msg } = await requireMessage(channelId, messageId);
      thread = await msg.startThread({ name });
    } else {
      thread = await parent.threads.create({ name });
    }
    return serializeThread(thread);
  }

  function getThread({ threadId }) {
    const t = requireReady().channels.cache.get(threadId);
    if (!t || !isThread(t) || !can(t, PermissionFlagsBits.ViewChannel)) throw appError('NOT_FOUND', 'Thread nicht gefunden.');
    return serializeThread(t);
  }

  // ---------- F14 Serverweite Suche ----------

  /** Offizieller Endpoint GET /guilds/{id}/messages/search (max. 25 Treffer, braucht Message Content Intent). */
  async function searchMessages({ guildId, content, channelId, authorId, pinned, offset = 0 }) {
    const guild = requireGuild(guildId);
    const query = new URLSearchParams();
    if (content) query.set('content', content);
    if (channelId) query.append('channel_id', channelId);
    if (authorId) query.append('author_id', authorId);
    if (pinned !== undefined) query.set('pinned', String(pinned));
    query.set('limit', '25');
    if (offset) query.set('offset', String(offset));
    const route = Routes?.guildMessagesSearch ? Routes.guildMessagesSearch(guild.id) : `/guilds/${guild.id}/messages/search`;
    const data = await client.rest.get(route, { query });
    // Discord indiziert neue Server erst: Antwort ohne Ergebnisse + retry_after
    if (data && data.messages === undefined && data.retry_after !== undefined) return { pending: true, retryAfterMs: Math.ceil(Number(data.retry_after) * 1000) || 2000, total: 0, results: [] };
    const results = (Array.isArray(data?.messages) ? data.messages : [])
      .map((group) => (Array.isArray(group) ? group[0] : group))
      .filter(Boolean)
      .filter((m) => {
        const ch = guild.channels.cache.get(m.channel_id) || client.channels.cache.get(m.channel_id);
        return ch && can(ch, PermissionFlagsBits.ViewChannel);
      })
      .map((m) => ({
        id: m.id,
        channelId: m.channel_id,
        channelName: (guild.channels.cache.get(m.channel_id) || client.channels.cache.get(m.channel_id))?.name ?? null,
        authorName: m.member?.nick || m.author?.global_name || m.author?.username || 'Unbekannt',
        content: typeof m.content === 'string' ? readableMentions(guild, m.content).slice(0, 300) : '',
        timestamp: Date.parse(m.timestamp) || null,
        hasAttachments: Array.isArray(m.attachments) && m.attachments.length > 0,
      }));
    return { pending: false, total: Number(data?.total_results) || results.length, results };
  }

  // Suchtreffer kommen als rohe API-Daten: <@id>, <@&id>, <#id> lesbar machen (Namen aus dem Cache)
  function readableMentions(guild, text) {
    return text
      .replace(/<@!?(\d{17,20})>/g, (_, id) => `@${displayNameOf(client.users?.cache?.get?.(id), guild.members?.cache?.get?.(id))}`)
      .replace(/<@&(\d{17,20})>/g, (_, id) => `@${guild.roles?.cache?.get?.(id)?.name ?? 'Rolle'}`)
      .replace(/<#(\d{17,20})>/g, (_, id) => `#${guild.channels?.cache?.get?.(id)?.name ?? 'kanal'}`);
  }

  // ---------- F8 Emoji-Auswahl: eigene Server-Emojis ----------
  function listEmojis({ guildId }) {
    const guild = requireGuild(guildId);
    return valuesOf(guild.emojis?.cache)
      .filter((e) => e?.id && e.name && e.available !== false)
      .slice(0, 100)
      .map((e) => {
        let url = null;
        try {
          url = typeof e.imageURL === 'function' ? e.imageURL({ size: 48 }) : null;
        } catch {
          url = null;
        }
        return { key: `${e.name}:${e.id}`, name: e.name, url, animated: Boolean(e.animated) };
      });
  }

  function getCommandsState() {
    return { ...commandsState, commands: COMMANDS.map((c) => `/${c.name}`) };
  }

  // ---------- Bot-Profil (Name, Bild, Beschreibung, Spitzname je Server) ----------
  // Offizielle Endpunkte: PATCH /users/@me, PATCH /applications/@me, PATCH /guilds/{id}/members/@me
  async function getProfile({ guildId } = {}) {
    const c = requireReady();
    let description = '';
    try {
      const app = await c.application.fetch();
      description = app?.description || '';
    } catch {
      description = c.application?.description || '';
    }
    const out = { ...botInfo(), avatarUrl: c.user.displayAvatarURL({ size: 256, extension: 'png' }), description, server: null };
    if (guildId) {
      const guild = requireGuild(guildId);
      const me = guild.members.me;
      out.server = { guildId, guildName: guild.name, nick: me?.nickname || '', canChangeNick: Boolean(me?.permissions?.has?.(PermissionFlagsBits.ChangeNickname)) };
    }
    return out;
  }

  async function updateProfile({ username, avatar, description, guildId, nick }) {
    const c = requireReady();
    const changed = [];
    try {
      if (username !== undefined || avatar !== undefined) {
        const body = {};
        if (username !== undefined && username !== c.user.username) body.username = username;
        if (avatar !== undefined) body.avatar = avatar; // Data-URI oder null (= Standardbild)
        if (Object.keys(body).length) {
          await c.user.edit(body);
          changed.push(...Object.keys(body));
        }
      }
      if (description !== undefined) {
        await c.application.edit({ description });
        changed.push('description');
      }
      if (guildId && nick !== undefined) {
        const guild = requireGuild(guildId);
        if (!guild.members.me?.permissions?.has?.(PermissionFlagsBits.ChangeNickname))
          throw appError('MISSING_PERMISSION', 'Der Bot darf seinen Spitznamen auf diesem Server nicht ändern.', 'Gib der Bot-Rolle das Recht „Nickname ändern“.');
        await guild.members.editMe({ nick: nick || null });
        changed.push('nick');
      }
    } catch (err) {
      if (err?.code === 50035 && /username/i.test(JSON.stringify(err.rawError || err.message || '')))
        throw appError('VALIDATION', 'Discord hat den Namen abgelehnt.', 'Der Name ist vergeben oder wurde zu oft geändert (max. 2× pro Stunde).');
      throw err;
    }
    if (changed.some((k) => k === 'username' || k === 'avatar')) setStatus({ ...status, bot: botInfo() });
    return { changed, profile: await getProfile({ guildId }) };
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
    refresh,
    getChannelAccess,
    previewInvite,
    editMessage,
    endPoll,
    deleteMessage,
    react,
    listPins,
    setPinned,
    listThreads,
    createThread,
    getThread,
    searchMessages,
    listEmojis,
    getCommandsState,
    getProfile,
    updateProfile,
  };
}

module.exports = { createDiscordService, FATAL_CLOSE_CODES };
