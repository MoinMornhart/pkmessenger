'use strict';

// EINZIGE Datei, die discord.js importiert. Der Token verlässt diesen Prozess nie Richtung Renderer.
const { loadToken, botIdFromToken } = require('./env');
const { describeError, appError } = require('./errors');
const { buildAllowedMentions } = require('../shared/mentions');
const { compareSnowflakes, timestampOf } = require('../shared/snowflake');
const { isSystemType, systemInfo } = require('../shared/system-messages');
const { TYPING_THROTTLE_MS } = require('../shared/limits');
const { fuzzyFilter } = require('../shared/fuzzy');
const { maskSpoilers } = require('../shared/format-text');
const { bestStatus } = require('../shared/typing');

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
function createDiscordService({ discord, envPath, emit, createClient, loginTimeoutMs = LOGIN_TIMEOUT_MS, statusExtra = {}, getToken = () => loadToken(envPath), dmStore = { list: () => [], add: () => {} }, presence = { get: () => false, set: () => {} } }) {
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

  // Gleiche Optionen für discord.js (PC) und den schlanken Client der Android-App (createClient bekommt sie mit)
  const clientOptions = () => ({
        // Nur was wir brauchen (Datensparsamkeit). KEIN GuildMembers. GuildPresences NUR, wenn in den Einstellungen
        // eingeschaltet (Online-Status, privilegiert, Issue #1) – sonst nicht.
        intents: [
          ...(presence.get() ? [GatewayIntentBits.GuildPresences] : []),
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMessageTyping,
          GatewayIntentBits.GuildVoiceStates, // nicht privilegiert; nötig für Sprachkanäle (wer ist drin, Beitreten)
          GatewayIntentBits.GuildMessageReactions, // F8: Reaktionen live (nicht privilegiert)
          GatewayIntentBits.GuildMessagePolls, // Umfragen: Stimmen live (nicht privilegiert)
          // Privatnachrichten mit dem Bot (offiziell, nicht privilegiert; Inhalt von DMs ist ohne MessageContent-Freigabe lesbar)
          GatewayIntentBits.DirectMessages,
          GatewayIntentBits.DirectMessageTyping,
          GatewayIntentBits.DirectMessageReactions,
          GatewayIntentBits.DirectMessagePolls,
        ],
        // F8: Reaktionen auch an älteren, nicht im Speicher liegenden Nachrichten erkennen
        // Channel: DMs kommen sonst nicht an, wenn der Privatchat (noch) nicht im Speicher liegt
        partials: Partials ? [Partials.Message, Partials.Reaction, Partials.Channel] : [],
        // Sicherheitsnetz: standardmäßig pingt der Bot NIEMANDEN, nur explizit gelistete IDs.
        allowedMentions: { parse: [], repliedUser: false },
      });
  const makeClient = () => (createClient ? createClient(clientOptions()) : new discord.Client(clientOptions()));

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

  // Privatchat (DM) mit einer Person: dort gibt es keine Rollen, Discord erlaubt dem Bot diese Aktionen
  const isDM = (ch) => Boolean(ch) && ch.type === ChannelType.DM;
  const DM_ALLOWED = new Set(
    [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.SendPolls,
      PermissionFlagsBits.PinMessages,
    ].filter((f) => f !== undefined),
  );
  // Nachricht/Event betrifft einen Server-Kanal oder einen Privatchat des Bots?
  const inScope = (m) => Boolean(m?.guildId) || isDM(m?.channel);

  function permsIn(channel) {
    const me = channel.guild?.members?.me;
    return me ? channel.permissionsFor(me) : null;
  }

  function can(channel, flag) {
    if (isDM(channel)) return DM_ALLOWED.has(flag);
    const p = permsIn(channel);
    return Boolean(p && p.has(flag));
  }

  // Liefert nur Kanäle, die der Bot wirklich SEHEN darf.
  const isThread = (ch) => Boolean(ch) && THREAD_TYPES.has(ch.type);
  // In Threads gilt "Nachrichten in Threads senden" statt "Nachrichten senden" (F12)
  const canSendIn = (ch) => can(ch, isThread(ch) ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages);

  function requireTextChannel(channelId) {
    const channel = requireReady().channels.cache.get(channelId);
    const textLike = channel && (TEXT_TYPES.has(channel.type) || isThread(channel) || isDM(channel));
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
      if (!inScope(msg)) return;
      if (!msg.guildId) rememberDM(msg.channel, msg.author?.id === c.user?.id ? null : msg.author?.id);
      emit('message:create', serializeMessage(msg));
    });
    c.on(Events.MessageUpdate, (_old, msg) => {
      if (!inScope(msg) || msg.partial) return;
      emit('message:update', serializeMessage(msg));
    });
    c.on(Events.MessageDelete, (msg) => {
      if (!inScope(msg) || !msg.id) return;
      emit('message:delete', { id: msg.id, channelId: msg.channelId });
    });
    // Online-Status live (nur wenn eingeschaltet; ohne Presence-Intent kommen keine Ereignisse)
    c.on(Events.PresenceUpdate, (_old, now) => {
      if (!presence.get() || !now?.userId) return;
      emit('presence', { userId: now.userId, status: presenceOf(now.userId) });
    });
    c.on(Events.TypingStart, (typing) => {
      if (!(typing?.guild || isDM(typing?.channel)) || !typing.channel?.id || !typing.user?.id || typing.user.id === c.user?.id) return;
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
        if (inScope(m)) emit('message:update', serializeMessage(m));
      } catch {
        /* Nachricht evtl. gelöscht oder nicht mehr sichtbar */
      }
    };
    c.on(Events.MessageReactionAdd, onReaction);
    c.on(Events.MessageReactionRemove, onReaction);
    c.on(Events.MessageReactionRemoveAll, (m) => inScope(m) && !m.partial && emit('message:update', serializeMessage(m)));
    // Umfragen: neue/entfernte Stimme → Nachricht neu an die Oberfläche
    const onVote = async (answer) => {
      try {
        const poll = answer?.poll;
        let m = poll?.channel?.messages?.cache?.get?.(poll.messageId);
        if (!m && poll?.channel?.messages?.fetch) m = await poll.channel.messages.fetch(poll.messageId);
        if (inScope(m)) emit('message:update', serializeMessage(m));
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
    c.on(Events.GuildMemberUpdate, (old, member) => {
      if (member?.id && member.id === c.user?.id) emit('channels:changed', { guildId: member.guild?.id ?? null });
      // Spitzname geändert → überall in der Oberfläche mitziehen (JoniMoni #53)
      const before = old?.displayName;
      if (member?.id && before && member.displayName && before !== member.displayName) emit('user:renamed', { userId: member.id, guildId: member.guild?.id ?? null, oldName: before, name: member.displayName });
    });
    // Name einer Person geändert (Discord meldet das, sobald es die Person neu überträgt) → live überall ersetzen
    c.on(Events.UserUpdate, (old, user) => {
      const before = old ? old.globalName || old.username : null;
      const now = user ? user.globalName || user.username : null;
      if (user?.id && before && now && before !== now) emit('user:renamed', { userId: user.id, guildId: null, oldName: before, name: now });
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

  let retryWithoutPresence = false;
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
        // Online-Status an, aber im Portal nicht erlaubt → Discord lehnt ab (4014): Schalter aus und ohne neu verbinden
        if (error.code === 'DISALLOWED_INTENTS' && presence.get()) {
          presence.set(false);
          retryWithoutPresence = true;
          emit('log', { level: 'warn', message: 'Presence intent rejected by Discord (4014) – online status turned off, reconnecting without it.' });
        }
        return setStatus({ state: error.code === 'TOKEN_INVALID' ? 'setup' : 'error', reason: error.code, error });
      }
    })();
    try {
      return await connecting;
    } finally {
      connecting = null;
      if (retryWithoutPresence) {
        retryWithoutPresence = false;
        setTimeout(() => connect().catch(() => {}), 0);
      }
    }
  }

  /** Online-Status ein/aus (Issue #1). Vorher über die offizielle API prüfen, ob „Presence Intent“ im Portal an ist. */
  async function setPresence({ on }) {
    if (on) {
      const c = requireReady();
      let flags = null;
      try {
        flags = (await c.application.fetch())?.flags;
      } catch {
        flags = null;
      }
      const allowed = Boolean(flags?.has?.('GatewayPresence') || flags?.has?.('GatewayPresenceLimited'));
      if (!allowed)
        throw Object.assign(appError('MISSING_PERMISSION', 'Im Discord-Entwicklerportal ist „Presence Intent“ noch aus.', 'Portal → dein Bot → „Bot“ → „Privileged Gateway Intents“ → „Presence Intent“ einschalten und speichern. Dann hier nochmal.'), {
          url: `https://discord.com/developers/applications/${c.application.id}/bot`,
        });
    }
    presence.set(Boolean(on));
    connect().catch(() => {}); // neu verbinden, damit Discord das Intent übernimmt
    return { on: Boolean(on) };
  }

  /** online | idle | dnd | offline | null (unbekannt/aus) */
  const statusOf = (member) => (presence.get() ? member?.presence?.status || 'offline' : null);
  /** Status einer Person über alle Server des Bots (Privatchats haben selbst keinen Status, Issue #1). */
  const presenceOf = (userId) => {
    if (!presence.get() || !client || !userId) return null;
    const list = [...client.guilds.cache.values()].map((g) => g.presences?.cache?.get?.(userId)?.status || (g.members.cache.has(userId) ? 'offline' : null));
    return bestStatus(list) || 'offline';
  };

  async function disconnect() {
    await destroyClient();
    return setStatus({ state: 'disconnected' });
  }

  // ---------- Daten ----------

  function listGuilds() {
    const c = requireReady();
    return [...c.guilds.cache.values()]
      .map((g) => ({ id: g.id, name: g.name, acronym: g.nameAcronym, iconUrl: g.iconURL({ size: 96, extension: 'png' }), canCreateChannels: Boolean(g.members?.me?.permissions?.has?.(PermissionFlagsBits.ManageChannels)) }))
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
        canManage: can(ch, PermissionFlagsBits.ManageChannels), // umbenennen/verschieben (Rechtsklick)
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
      type: Number.isInteger(msg?.type) ? msg.type : 0,
      system: Boolean(msg?.system) || isSystemType(msg?.type),
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
        users: mentionedUsers(msg, guild),
        roles: valuesOf(msg?.mentions?.roles).map((r) => ({ id: r.id, name: r.name ?? 'Rolle', color: hexOrNull(r.hexColor) })),
        channels: valuesOf(msg?.mentions?.channels).map((ch) => ({ id: ch.id, name: ch.name ?? 'kanal' })),
        everyone: Boolean(msg?.mentions?.everyone),
      },
      reference: msg?.reference?.messageId ? { messageId: msg.reference.messageId, channelId: msg.reference.channelId ?? null, ...replyPreview(msg) } : null,
      toBot: isToBot(msg),
      reactions: valuesOf(msg?.reactions?.cache).map(serializeReaction).filter(Boolean),
      embeds: (Array.isArray(msg?.embeds) ? msg.embeds : []).slice(0, 10).map(serializeEmbed),
      pinned: Boolean(msg?.pinned),
      components: serializeComponents(msg),
      poll: serializePoll(msg?.poll),
      thread: msg?.hasThread && msg.thread ? { id: msg.thread.id, name: msg.thread.name ?? 'Thread', messageCount: msg.thread.messageCount ?? null } : null,
      // Bearbeiten nur eigene (Discord-Regel); Löschen eigene oder mit "Nachrichten verwalten"
      canEdit: Boolean(author?.id) && author.id === client?.user?.id,
      canDelete: (Boolean(author?.id) && author.id === client?.user?.id) || (msg?.channel ? can(msg.channel, PermissionFlagsBits.ManageMessages) : false),
    };
  }

  /**
   * Erwähnte Personen mit ihrem AKTUELLEN Namen. Discord liefert in Privatchats nur Teilnehmer mit – wer sonst
   * mit <@id> im Text steht, wird über alle bekannten Personen aufgelöst (JoniMoni #56: sonst „@Unbekannt“).
   */
  function mentionedUsers(msg, guild) {
    const out = valuesOf(msg?.mentions?.users).map((u) => ({ id: u.id, name: displayNameOf(u, guild?.members?.cache?.get?.(u.id)) }));
    const seen = new Set(out.map((u) => u.id));
    const text = typeof msg?.content === 'string' ? msg.content : '';
    for (const m of text.matchAll(/<@!?(\d{17,20})>/g)) {
      const id = m[1];
      if (seen.has(id)) continue;
      seen.add(id);
      const name = knownName(id, guild);
      if (name) out.push({ id, name });
    }
    return out;
  }

  /** Aktueller Name einer Person: Server-Spitzname → irgendein gemeinsamer Server → Nutzer-Cache. */
  function knownName(id, guild) {
    if (!client) return null;
    const member = guild?.members?.cache?.get?.(id) || [...client.guilds.cache.values()].map((g) => g.members?.cache?.get?.(id)).find(Boolean);
    const user = member?.user || client.users?.cache?.get?.(id);
    return member || user ? displayNameOf(user, member) : null;
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
  /** Ging die Nachricht an den Bot? @Bot, @Bot-Rolle (verwaltete Rolle des Bots) oder Antwort auf eine Bot-Nachricht. */
  function isToBot(msg) {
    const botId = client?.user?.id;
    if (!botId || !msg) return false;
    if (valuesOf(msg.mentions?.users).some((u) => u.id === botId)) return true;
    const botRole = msg.guild?.members?.me?.roles?.botRole?.id;
    if (botRole && valuesOf(msg.mentions?.roles).some((r) => r.id === botRole)) return true;
    if (msg.mentions?.repliedUser?.id === botId) return true;
    const ref = msg.reference?.messageId ? msg.channel?.messages?.cache?.get?.(msg.reference.messageId) : null;
    return ref?.author?.id === botId;
  }

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

  // #86: Knöpfe/Auswahlmenüs einer Nachricht (components) NUR zur Ansicht serialisieren.
  // Ein Bot kann fremde Knöpfe nicht drücken (Discord-Grenze), darum reine Anzeige. Link-Knöpfe tragen ihre URL mit
  // (werden im Renderer über den normalen Link-Schutz geöffnet). Alles null-sicher und gekürzt.
  function serializeComponent(c) {
    const type = Number(c?.type) || 0;
    if (type === 2) {
      const style = Number(c?.style) || 1; // 1 primary, 2 secondary, 3 success, 4 danger, 5 link
      return {
        kind: 'button',
        label: typeof c?.label === 'string' ? c.label.slice(0, 80) : '',
        style,
        url: style === 5 && typeof c?.url === 'string' ? c.url : null,
        emoji: c?.emoji?.name || null,
        disabled: Boolean(c?.disabled),
      };
    }
    if (type === 3 || (type >= 5 && type <= 8)) {
      return { kind: 'select', placeholder: typeof c?.placeholder === 'string' ? c.placeholder.slice(0, 100) : 'Auswahl', disabled: Boolean(c?.disabled) };
    }
    return null;
  }
  function serializeComponents(msg) {
    const rows = Array.isArray(msg?.components) ? msg.components : [];
    return rows
      .slice(0, 5)
      .map((row) => ({ components: (Array.isArray(row?.components) ? row.components : []).slice(0, 5).map(serializeComponent).filter(Boolean) }))
      .filter((r) => r.components.length);
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
      // GIFs (Tenor/Giphy) und Videos: nur die Discord-Proxy-Adresse (Issue #1)
      type: s(e?.data?.type ?? e?.type, 20),
      video: s(e?.video?.proxyURL ?? e?.video?.proxy_url, 2048),
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
    const text = maskSpoilers(typeof raw === 'string' ? raw : '').replace(/\s+/g, ' ').trim();
    // Systemnachricht (Beitritt, Boost …) → verständlicher Satz statt leerer Vorschau
    const sys = systemInfo({ type: msg?.type, author: { name: displayNameOf(msg?.author, msg?.member) }, content: text, embeds: (Array.isArray(msg?.embeds) ? msg.embeds : []).map(serializeEmbed) });
    const ts = Number.isFinite(msg?.createdTimestamp) ? msg.createdTimestamp : 0;
    if (sys) return { channelId: msg?.channelId ?? null, messageId: msg?.id ?? null, authorName: '', isOwn: false, system: true, text: `${sys.icon} ${sys.text}`.slice(0, 120), timestamp: ts };
    return {
      channelId: msg?.channelId ?? null,
      messageId: msg?.id ?? null,
      authorName: displayNameOf(msg?.author, msg?.member),
      isOwn: Boolean(msg?.author?.id) && msg.author.id === client?.user?.id,
      text: text ? text.slice(0, 120) : msg?.poll?.question?.text ? `📊 ${msg.poll.question.text}`.slice(0, 120) : msg?.attachments?.size ? '📎 Anhang' : msg?.embeds?.length ? `▤ ${msg.embeds[0]?.title || 'Embed'}`.slice(0, 120) : '',
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
      let searched = [];
      try {
        // Discords Mitgliedersuche (findet nur Namen, die SO ANFANGEN). Braucht laut Doku kein GuildMembers-Intent.
        searched = [...(await guild.members.search({ query, limit: 8 })).values()];
      } catch {
        searched = [];
      }
      // … plus unscharfe Suche in bekannten Personen: irgendwo im Namen, Abkürzungen, kleine Tippfehler (Issue #1)
      const seen = new Set();
      members = fuzzyFilter([...searched, ...guild.members.cache.values()].filter((m) => !seen.has(m.id) && seen.add(m.id)), query, memberNames, 8);
    }
    const users = members.map((m) => ({
      kind: 'user',
      id: m.id,
      display: m.displayName,
      sub: m.user.username,
      avatarUrl: m.displayAvatarURL({ size: 32, extension: 'png' }),
      bot: Boolean(m.user.bot),
      status: statusOf(m),
    }));
    const roles = fuzzyFilter(
      [...guild.roles.cache.values()].filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position),
      query,
      (r) => [r.name],
      5,
    )
      .map((r) => ({ kind: 'role', id: r.id, display: r.name, color: r.hexColor !== '#000000' ? r.hexColor : null, pingable: r.mentionable || canEveryoneSomewhere }));
    const special = ['everyone', 'here'].filter((s) => s.startsWith(q)).map((s) => ({ kind: s, id: s, display: s }));
    return [...users, ...roles, ...special];
  }

  const memberNames = (m) => [m.displayName, m.user?.globalName, m.user?.username];

  /**
   * Personen über ALLE Server des Bots + bekannte Privatchat-Partner suchen (Issue #1: „überall sollen Namen kommen“,
   * auch @ im Privatchat). Unscharf, ohne Duplikate, Bots zuletzt. Nur Mitglieder, die Discord dem Bot ohnehin zeigt.
   */
  async function searchPeople({ query, guildId = null, limit = 10 }) {
    const c = requireReady();
    const found = new Map(); // userId → { user, member, guilds }
    const add = (user, member, guildName) => {
      if (!user?.id || user.id === c.user.id) return;
      const e = found.get(user.id) || { user, member, guilds: [] };
      if (guildName && !e.guilds.includes(guildName)) e.guilds.push(guildName);
      if (!e.member && member) e.member = member;
      found.set(user.id, e);
    };
    const guilds = guildId ? [requireGuild(guildId)] : [...c.guilds.cache.values()].slice(0, 25);
    await Promise.all(
      guilds.map(async (g) => {
        for (const m of g.members.cache.values()) add(m.user, m, g.name);
        if (!query) return;
        try {
          for (const m of (await g.members.search({ query, limit: 8 })).values()) add(m.user, m, g.name);
        } catch {
          /* Suche nicht erlaubt → nur Cache */
        }
      }),
    );
    if (!guildId) for (const ch of c.channels.cache.values()) if (isDM(ch) && ch.recipient) add(ch.recipient, null, null);
    const list = [...found.values()];
    const names = (e) => [e.member?.displayName, e.user.globalName, e.user.username];
    const ranked = query ? fuzzyFilter(list, query, names) : list.sort((a, b) => names(a)[0]?.localeCompare?.(names(b)[0] || '') || 0);
    return ranked
      .sort((a, b) => Number(Boolean(a.user.bot)) - Number(Boolean(b.user.bot)))
      .slice(0, limit)
      .map((e) => ({
        kind: 'user',
        id: e.user.id,
        display: e.member?.displayName || e.user.globalName || e.user.username,
        sub: e.user.username,
        avatarUrl: (e.member || e.user).displayAvatarURL?.({ size: 32, extension: 'png' }) || null,
        bot: Boolean(e.user.bot),
        guilds: e.guilds.slice(0, 3),
        status: e.member ? statusOf(e.member) : null,
      }));
  }

  /** Profil einer Person (Issue #1: „Profile aufrufen“). Mit guildId: Server-Infos (Rollen, beigetreten). */
  async function getUserProfile({ userId, guildId }) {
    const c = requireReady();
    let member = null;
    const guild = guildId ? c.guilds.cache.get(guildId) : null;
    if (guild) {
      try {
        member = guild.members.cache.get(userId) || (await guild.members.fetch(userId));
      } catch {
        member = null;
      }
    }
    let user = c.users?.cache?.get?.(userId) || member?.user || null;
    if (!user) {
      try {
        user = await c.users.fetch(userId);
      } catch {
        user = null;
      }
    }
    if (!user) user = [...c.guilds.cache.values()].map((g) => g.members.cache.get(userId)?.user).find(Boolean) || null;
    if (!user) throw appError('NOT_FOUND', 'Person nicht gefunden.');
    const mutual = [...c.guilds.cache.values()].filter((g) => g.members.cache.has(userId)).map((g) => g.name).slice(0, 10);
    return {
      id: user.id,
      name: member?.displayName || user.globalName || user.username,
      username: user.username,
      avatarUrl: (member || user).displayAvatarURL?.({ size: 128, extension: 'png' }) || null,
      bannerColor: user.hexAccentColor || null,
      bot: Boolean(user.bot),
      isSelf: user.id === c.user.id,
      status: member ? statusOf(member) : presenceOf(user.id),
      activity: presence.get() ? String(member?.presence?.activities?.find?.((a) => a?.name && a.type !== 4)?.name || '').slice(0, 100) || null : null,
      createdAt: user.createdTimestamp || timestampOf(user.id) || null, // Discord-ID enthält das Erstellungsdatum
      joinedAt: member?.joinedTimestamp || null,
      guildName: guild?.name || null,
      roles: member
        ? valuesOf(member.roles?.cache)
            .filter((r) => r.id !== guild.id)
            .sort((a, b) => b.position - a.position)
            .slice(0, 20)
            .map((r) => ({ id: r.id, name: r.name, color: r.hexColor && r.hexColor !== '#000000' ? r.hexColor : null }))
        : [],
      mutualGuilds: mutual,
    };
  }

  /** Bot-Einladungslink. Mit guildId ist der Server vorausgewählt und fixiert (offizielle Parameter guild_id + disable_guild_select). */
  /**
   * Einrichtungs-Check (Issue #1: „bei der Einrichtung helfen, Status auslesen“) – NUR über die offizielle API,
   * kein Auslesen der Discord-Webseite. Liefert verständliche Punkte mit direktem Link zur passenden Portal-Seite.
   */
  async function setupCheck() {
    const c = client;
    const ready = Boolean(c?.isReady?.());
    const appId = c?.application?.id || null;
    const portal = appId ? `https://discord.com/developers/applications/${appId}` : 'https://discord.com/developers/applications';
    const items = [];
    items.push({ id: 'token', ok: ready, text: ready ? `Bot-Token gültig, angemeldet als ${c.user?.username}` : 'Bot ist nicht angemeldet', fix: ready ? null : 'Token in den Einstellungen prüfen', url: ready ? null : `${portal}/bot` });
    let flags = null;
    try {
      flags = ready ? (await c.application.fetch())?.flags : null;
    } catch {
      flags = null;
    }
    const has = (name) => Boolean(flags?.has?.(name));
    // Ohne „Message Content Intent“ lässt Discord den Bot gar nicht erst rein (Fehler 4014) → angemeldet = an
    items.push({ id: 'content', ok: ready, text: 'Erlaubnis „Message Content Intent“ (Nachrichten lesen)', fix: ready ? null : 'Im Entwicklerportal unter „Bot“ → „Privileged Gateway Intents“ einschalten', url: `${portal}/bot` });
    items.push({
      id: 'presence',
      ok: has('GatewayPresence') || has('GatewayPresenceLimited'),
      optional: true,
      text: 'Erlaubnis „Presence Intent“ (nur für den Online-Status, freiwillig)',
      fix: 'Nur nötig, wenn du sehen willst, wer online ist: Portal → „Bot“ → „Presence Intent“',
      url: `${portal}/bot`,
    });
    const guilds = ready ? [...c.guilds.cache.values()] : [];
    items.push({ id: 'guilds', ok: guilds.length > 0, text: guilds.length ? `Bot ist auf ${guilds.length} ${guilds.length === 1 ? 'Server' : 'Servern'}` : 'Bot ist noch auf keinem Server', fix: guilds.length ? null : 'Bot über „Bot einladen“ (links unten) auf deinen Server holen', url: null, action: guilds.length ? null : 'invite' });
    for (const g of guilds.slice(0, 10)) {
      const text = [...g.channels.cache.values()].filter((ch) => ch && (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement));
      const visible = text.filter((ch) => can(ch, PermissionFlagsBits.ViewChannel));
      const writable = visible.filter((ch) => can(ch, PermissionFlagsBits.SendMessages));
      items.push({
        id: `guild:${g.id}`,
        ok: writable.length > 0,
        text: `„${g.name}“: ${visible.length} von ${text.length} Kanälen sichtbar, in ${writable.length} darf der Bot schreiben`,
        fix: writable.length ? null : 'Der Bot-Rolle in den Servereinstellungen → Rollen „Kanäle ansehen“ und „Nachrichten senden“ geben',
        url: null,
      });
    }
    return { ready, appId, items, portal };
  }

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

  // ---------- Kanäle verwalten (Rechtsklick auf einen Chat, Issue #1) ----------
  function requireManageableChannel(channelId) {
    const ch = requireReady().channels.cache.get(channelId);
    if (!ch || !ch.guild || !can(ch, PermissionFlagsBits.ViewChannel)) throw appError('NOT_FOUND', 'Kanal nicht gefunden.');
    if (!can(ch, PermissionFlagsBits.ManageChannels)) throw appError('MISSING_PERMISSION', 'Der Bot darf diesen Kanal nicht bearbeiten.', 'Gib der Bot-Rolle das Recht „Kanäle verwalten“.');
    return ch;
  }

  async function renameChannel({ channelId, name }) {
    const ch = requireManageableChannel(channelId);
    await ch.setName(name, 'PKMessenger');
    emit('channels:changed', { guildId: ch.guild.id });
    return { channelId, name: ch.name };
  }

  /** Eine Position nach oben/unten innerhalb der Kategorie (Discord sortiert die übrigen selbst nach). */
  async function moveChannel({ channelId, direction }) {
    const ch = requireManageableChannel(channelId);
    await ch.setPosition(direction === 'up' ? -1 : 1, { relative: true, reason: 'PKMessenger' });
    emit('channels:changed', { guildId: ch.guild.id });
    return { channelId };
  }

  /**
   * Neue Gruppe = neuer Text- oder Sprachkanal (Issue #1 „Gruppe erstellen“). Braucht „Kanäle verwalten“.
   * Privat: @everyone sieht ihn nicht, nur der Bot und die ausgewählten Personen. Es werden nur Rechte vergeben,
   * die der Bot selbst auf dem Server hat (sonst lehnt Discord ab).
   */
  async function createChannel({ guildId, name, kind, parentId, isPrivate, memberIds }) {
    const c = requireReady();
    const guild = requireGuild(guildId);
    if (!guild.members?.me?.permissions?.has?.(PermissionFlagsBits.ManageChannels))
      throw appError('MISSING_PERMISSION', 'Der Bot darf auf diesem Server keine Kanäle anlegen.', 'Gib der Bot-Rolle das Recht „Kanäle verwalten“.');
    let parent = null;
    if (parentId) {
      parent = guild.channels.cache.get(parentId);
      if (!parent || parent.type !== ChannelType.GuildCategory) throw appError('NOT_FOUND', 'Kategorie nicht gefunden.');
    }
    const voice = kind === 'voice';
    const wanted = voice
      ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
      : [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory];
    const where = parent?.permissionsFor ? permsIn(parent) : guild.members.me.permissions; // in einer Kategorie zählen deren Rechte
    const botHas = wanted.filter((f) => where?.has(f));
    let permissionOverwrites;
    if (isPrivate) {
      const members = [];
      for (const id of memberIds) {
        if (id === c.user.id) continue;
        members.push(await requireMember(guild, id));
      }
      permissionOverwrites = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }, // @everyone
        { id: c.user.id, allow: botHas }, // der Bot sperrt sich nicht selbst aus
        ...members.map((m) => ({ id: m.id, allow: botHas })),
      ];
    }
    const ch = await guild.channels.create({
      name,
      type: voice ? ChannelType.GuildVoice : ChannelType.GuildText,
      ...(parent ? { parent: parent.id } : {}),
      ...(permissionOverwrites ? { permissionOverwrites } : {}),
      reason: 'PKMessenger: neue Gruppe',
    });
    emit('channels:changed', { guildId: guild.id });
    return { id: ch.id, guildId: guild.id, name: ch.name, type: voice ? 'voice' : 'text', private: Boolean(isPrivate) };
  }

  // ---------- Moderation (Rechtsklick → Person verwalten, Issue #1) ----------
  // Nur was der Bot laut Discord-Rechten wirklich darf. discord.js prüft dabei Rollen-Reihenfolge, Besitzer und Admins
  // (member.manageable / moderatable / kickable / bannable). Mitglied wird per REST geladen – kein privilegiertes Intent nötig.
  const hasPerm = (guild, flag) => Boolean(guild.members.me?.permissions?.has?.(flag));
  const botTopRole = (guild) => guild.members.me?.roles?.highest?.position ?? 0;
  const auditReason = (reason) => (reason ? `PKMessenger: ${reason}` : 'PKMessenger');

  async function requireMember(guild, userId) {
    const m = guild.members.cache.get(userId) || (await Promise.resolve().then(() => guild.members.fetch(userId)).catch(() => null));
    if (!m) throw appError('NOT_FOUND', 'Diese Person ist nicht (mehr) auf dem Server.');
    return m;
  }

  function memberCan(guild, m) {
    return {
      roles: hasPerm(guild, PermissionFlagsBits.ManageRoles),
      timeout: hasPerm(guild, PermissionFlagsBits.ModerateMembers) && Boolean(m.moderatable),
      kick: hasPerm(guild, PermissionFlagsBits.KickMembers) && Boolean(m.kickable),
      ban: hasPerm(guild, PermissionFlagsBits.BanMembers) && Boolean(m.bannable),
    };
  }

  /** Darf diese Person auf dem Server verwalten? (Administrator oder „Server verwalten“) – für „modus …“ im Chat */
  async function isServerAdmin({ guildId, userId }) {
    const guild = requireGuild(guildId);
    if (guild.ownerId === userId) return true;
    const m = await Promise.resolve()
      .then(() => guild.members.cache.get(userId) || guild.members.fetch(userId))
      .catch(() => null);
    const p = m?.permissions;
    return Boolean(p?.has?.(PermissionFlagsBits.Administrator) || p?.has?.(PermissionFlagsBits.ManageGuild));
  }

  async function getMemberInfo({ guildId, userId }) {
    const guild = requireGuild(guildId);
    const m = await requireMember(guild, userId);
    const can = memberCan(guild, m);
    const top = botTopRole(guild);
    const until = Number(m.communicationDisabledUntilTimestamp) || 0;
    return {
      guildId,
      userId,
      name: displayNameOf(m.user, m),
      username: m.user?.username ?? '',
      avatarUrl: avatarOf(m) || avatarOf(m.user),
      isBot: Boolean(m.user?.bot),
      isOwner: guild.ownerId === userId,
      isSelf: userId === client.user.id,
      timeoutUntil: until > Date.now() ? until : null,
      can,
      roles: valuesOf(guild.roles.cache)
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name ?? 'Rolle', color: hexOrNull(r.hexColor), has: Boolean(m.roles?.cache?.has?.(r.id)), editable: can.roles && !r.managed && r.position < top })),
    };
  }

  async function setMemberRole({ guildId, userId, roleId, add, reason }) {
    const guild = requireGuild(guildId);
    const m = await requireMember(guild, userId);
    const role = guild.roles.cache.get(roleId);
    if (!role || role.id === guild.id) throw appError('NOT_FOUND', 'Rolle nicht gefunden.');
    if (!hasPerm(guild, PermissionFlagsBits.ManageRoles)) throw appError('MISSING_PERMISSION', 'Der Bot darf keine Rollen vergeben.', 'Gib der Bot-Rolle das Recht „Rollen verwalten“.');
    if (role.managed || role.position >= botTopRole(guild))
      throw appError('MISSING_PERMISSION', `Die Rolle „${role.name}“ steht über der Bot-Rolle.`, 'Ziehe in den Servereinstellungen → Rollen die Bot-Rolle über diese Rolle.');
    if (add) await m.roles.add(roleId, auditReason(reason));
    else await m.roles.remove(roleId, auditReason(reason));
    return getMemberInfo({ guildId, userId });
  }

  async function timeoutMember({ guildId, userId, minutes, reason }) {
    const guild = requireGuild(guildId);
    const m = await requireMember(guild, userId);
    if (!memberCan(guild, m).timeout) throw appError('MISSING_PERMISSION', 'Der Bot darf diese Person nicht stummschalten (Timeout).', 'Bot-Rolle braucht „Mitglieder im Timeout“ und muss über der Rolle der Person stehen.');
    await m.timeout(minutes > 0 ? minutes * 60000 : null, auditReason(reason));
    return getMemberInfo({ guildId, userId });
  }

  async function kickMember({ guildId, userId, reason }) {
    const guild = requireGuild(guildId);
    const m = await requireMember(guild, userId);
    if (!memberCan(guild, m).kick) throw appError('MISSING_PERMISSION', 'Der Bot darf diese Person nicht kicken.', 'Bot-Rolle braucht „Mitglieder kicken“ und muss über der Rolle der Person stehen.');
    await m.kick(auditReason(reason));
    return { userId, kicked: true };
  }

  async function banMember({ guildId, userId, reason, deleteMessageSeconds }) {
    const guild = requireGuild(guildId);
    const m = await requireMember(guild, userId);
    if (!memberCan(guild, m).ban) throw appError('MISSING_PERMISSION', 'Der Bot darf diese Person nicht bannen.', 'Bot-Rolle braucht „Mitglieder bannen“ und muss über der Rolle der Person stehen.');
    await guild.members.ban(userId, { reason: auditReason(reason), deleteMessageSeconds });
    return { userId, banned: true };
  }

  // ---------- Privatnachrichten (DMs) ----------
  // Discord bietet Bots keine Liste ihrer Privatchats → bekannte Chats (nur IDs) lokal merken.
  function rememberDM(channel, userId) {
    if (!channel?.id) return;
    const known = dmStore.list().some((e) => e.channelId === channel.id);
    const uid = userId || channel.recipientId || null;
    if (!known && uid) {
      dmStore.add({ channelId: channel.id, userId: uid });
      emit('dms:changed', {});
    }
  }

  async function dmEntry(ch) {
    let user = ch.recipient || null;
    if (!user && ch.recipientId) user = await client.users.fetch(ch.recipientId).catch(() => null);
    let preview = null;
    try {
      const last = await ch.messages.fetch({ limit: 1 });
      const m = last?.first?.() ?? [...(last?.values?.() || [])][0];
      if (m) preview = previewOf(m);
    } catch {
      preview = null;
    }
    return {
      id: ch.id,
      guildId: null,
      type: 'dm',
      userId: user?.id ?? ch.recipientId ?? null,
      status: presenceOf(user?.id ?? ch.recipientId),
      name: displayNameOf(user, null),
      avatarUrl: avatarOf(user),
      isBot: Boolean(user?.bot),
      topic: '',
      position: 0,
      lastMessageId: ch.lastMessageId || preview?.messageId || null,
      preview,
      canSend: true,
      canReadHistory: true,
      canMentionEveryone: false,
      canPin: true,
      canCreateThreads: false,
      canAttach: true,
      canEmbed: true,
      canPoll: true,
    };
  }

  /** Alle bekannten Privatchats (gemerkte + gerade im Speicher), neueste zuerst. */
  async function listDMs() {
    const c = requireReady();
    const chans = new Map();
    for (const ch of c.channels.cache.values()) if (isDM(ch)) chans.set(ch.id, ch);
    for (const e of dmStore.list().slice(0, 50)) {
      if (chans.has(e.channelId)) continue;
      const ch = await c.channels.fetch(e.channelId).catch(() => null);
      if (isDM(ch)) chans.set(ch.id, ch);
    }
    const list = await Promise.all([...chans.values()].map(dmEntry));
    return list.sort((a, b) => (b.preview?.timestamp || 0) - (a.preview?.timestamp || 0));
  }

  /** Privatchat mit einer Person öffnen (geht nur, wenn sie einen Server mit dem Bot teilt). */
  async function openDM({ userId }) {
    const c = requireReady();
    if (userId === c.user.id) throw appError('VALIDATION', 'Der Bot kann sich nicht selbst schreiben.');
    const user = await c.users.fetch(userId).catch(() => null);
    if (!user) throw appError('NOT_FOUND', 'Diese Person wurde nicht gefunden.');
    const ch = await user.createDM();
    rememberDM(ch, user.id);
    return dmEntry(ch);
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
    const oldName = c.user.globalName || c.user.username;
    const oldNick = guildId ? c.guilds.cache.get(guildId)?.members?.me?.displayName : null;
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
    // Neuer Name des Bots sofort in allen offenen Chats (auch in Erwähnungen) – nicht erst nach Neuladen
    const newName = c.user.globalName || c.user.username;
    if (changed.includes('username') && oldName !== newName) emit('user:renamed', { userId: c.user.id, guildId: null, oldName, name: newName });
    const newNick = guildId ? c.guilds.cache.get(guildId)?.members?.me?.displayName : null;
    if (changed.includes('nick') && oldNick && newNick && oldNick !== newNick) emit('user:renamed', { userId: c.user.id, guildId, oldName: oldNick, name: newNick });
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
    searchPeople,
    setupCheck,
    setPresence,
    getUserProfile,
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
    listDMs,
    openDM,
    renameChannel,
    createChannel,
    moveChannel,
    getMemberInfo,
    isServerAdmin,
    setMemberRole,
    timeoutMember,
    kickMember,
    banMember,
  };
}

module.exports = { createDiscordService, FATAL_CLOSE_CODES };
