'use strict';

// Nachbau der discord.js-Objekte, die src/main/discord.js benutzt – ohne Netzwerk, ohne Token.
// Konstanten (Events, Intents, Permissions, ChannelType) kommen aus dem ECHTEN discord.js.
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const discord = require('discord.js');
const { createDiscordService } = require('../../src/main/discord');

const { PermissionFlagsBits: P, ChannelType, Events } = discord;

const BOT_ID = '111111111111111111';
const GUILD_ID = '222222222222222222';

// Formal gültiger, aber ausgedachter Token (Teil 1 = Base64 der Bot-ID).
const FAKE_TOKEN = `${Buffer.from(BOT_ID).toString('base64url')}.AbCdEf.${'x'.repeat(27)}`;

function avatar() {
  return 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function makeUser(id, username, extra = {}) {
  return { id, username, globalName: null, bot: false, displayAvatarURL: avatar, ...extra };
}

function makeMessage({ id, channel, author, content = '', createdTimestamp = Date.now(), nonce = null, mentions = {}, type = 0, embeds }) {
  // Reaktionen wie bei discord.js: cache (Map) + users.remove()
  const reactionCache = new Map();
  const keyOf = (e) => (e.includes(':') ? e : e);
  const msg = {
    id,
    channelId: channel.id,
    guildId: channel.guild?.id ?? null,
    guild: channel.guild ?? null,
    channel,
    member: null,
    author,
    content,
    type,
    system: ![0, 19, 20, 23].includes(type), // wie discord.js Message#system
    createdTimestamp,
    editedTimestamp: null,
    system: false,
    nonce,
    partial: false,
    attachments: new Map(),
    embeds: embeds || [],
    reference: null,
    mentions: {
      users: new Map((mentions.users || []).map((u) => [u.id, u])),
      roles: new Map((mentions.roles || []).map((r) => [r.id, r])),
      channels: new Map((mentions.channels || []).map((c) => [c.id, c])),
      everyone: Boolean(mentions.everyone),
    },
    pinned: false,
    hasThread: false,
    thread: null,
    deleted: false,
    actions: [],
    reactions: {
      cache: reactionCache,
      resolve: (k) => reactionCache.get(keyOf(k)) || null,
    },
    async react(emoji) {
      msg.actions.push(['react', emoji]);
      const [name, id] = emoji.includes(':') ? emoji.split(':') : [emoji, null];
      const r = reactionCache.get(emoji) || { emoji: { name, id }, count: 0, me: false, users: { remove: async (uid) => { msg.actions.push(['unreact', emoji, uid]); r.count -= 1; r.me = false; if (r.count <= 0) reactionCache.delete(emoji); } } };
      if (!r.me) { r.count += 1; r.me = true; }
      reactionCache.set(emoji, r);
    },
    async edit(opts) {
      msg.actions.push(['edit', opts]);
      msg.content = opts.content;
      msg.editedTimestamp = Date.now();
      return msg;
    },
    async delete() {
      msg.actions.push(['delete']);
      msg.deleted = true;
      channel.store = channel.store.filter((m) => m.id !== msg.id);
    },
    async pin() { msg.actions.push(['pin']); msg.pinned = true; },
    async unpin() { msg.actions.push(['unpin']); msg.pinned = false; },
    async startThread({ name }) {
      msg.actions.push(['startThread', name]);
      msg.hasThread = true;
      msg.thread = { id: '555000000000000001', name, messageCount: 0, parentId: channel.id, guildId: channel.guild.id, permissionsFor: channel.permissionsFor, type: 11, guild: channel.guild };
      return msg.thread;
    },
  };
  return msg;
}

function makeChannel(guild, { id, name, type = ChannelType.GuildText, parentId = null, position = 0, perms = [] }) {
  const permSet = new Set(perms);
  const channel = {
    id,
    name,
    type,
    guild,
    guildId: guild.id,
    parentId,
    position,
    topic: '',
    lastMessageId: null,
    store: [], // simulierte Kanalhistorie (aufsteigend)
    sent: [],
    typingCalls: 0,
    permissionsFor: () => ({ has: (flag) => permSet.has(flag) }),
    messages: {
      fetchCalls: [],
      get cache() {
        return new Map(channel.store.map((m) => [m.id, m]));
      },
      async fetchPins() {
        return { items: channel.store.filter((m) => m.pinned).map((m) => ({ pinnedTimestamp: 1700000000000, message: m })), hasMore: false };
      },
      async fetch(opts) {
        if (typeof opts === 'string') return channel.store.find((m) => m.id === opts) || Promise.reject(Object.assign(new Error('Unknown Message'), { code: 10008 }));
        channel.messages.fetchCalls.push(opts);
        let list = [...channel.store].sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1)); // neueste zuerst, wie die API
        if (opts.before) list = list.filter((m) => BigInt(m.id) < BigInt(opts.before));
        list = list.slice(0, opts.limit);
        return new Map(list.map((m) => [m.id, m]));
      },
    },
    manageCalls: [],
    async setName(n, reason) {
      channel.manageCalls.push(['name', n, reason]);
      channel.name = n;
      return channel;
    },
    async setPosition(p, opts) {
      channel.manageCalls.push(['position', p, opts]);
      channel.position += opts?.relative ? p : p - channel.position;
      return channel;
    },
    async send(options) {
      channel.sent.push(options);
      // Wie bei Discord: zeitbasierte, monoton steigende Snowflake-ID (siehe error.md #3).
      const msg = makeMessage({ id: discord.SnowflakeUtil.generate().toString(), channel, author: guild.client.user, content: options.content ?? '', nonce: options.nonce ?? null });
      channel.store.push(msg);
      // wie Discord: Antwort-Verknüpfung kommt mit der gesendeten Nachricht zurück
      if (options.reply?.messageReference) msg.reference = { messageId: options.reply.messageReference, channelId: channel.id };
      // Umfrage wie discord.js: answers als Map, voteCount, end()
      if (options.poll) {
        const poll = { question: { text: options.poll.question.text }, allowMultiselect: options.poll.allowMultiselect, expiresTimestamp: Date.now() + options.poll.duration * 3600000, resultsFinalized: false, channel, messageId: msg.id, answers: new Map() };
        options.poll.answers.forEach((a, i) => poll.answers.set(i + 1, { id: i + 1, text: a.text, voteCount: 0, poll }));
        poll.end = async () => { poll.resultsFinalized = true; poll.expiresTimestamp = Date.now(); };
        msg.poll = poll;
      }
      return msg;
    },
    async sendTyping() {
      channel.typingCalls += 1;
    },
    // Threads (F12)
    threads: {
      created: [],
      list: [],
      async fetchActive() {
        return { threads: new Map(channel.threads.list.filter((t) => !t.archived).map((t) => [t.id, t])) };
      },
      async fetchArchived() {
        return { threads: new Map(channel.threads.list.filter((t) => t.archived).map((t) => [t.id, t])) };
      },
      async create(opts) {
        channel.threads.created.push(opts);
        // Wie discord.js: vollwertiger Kanal (senden/lesen), Rechte vom Eltern-Kanal, landet im Kanal-Speicher
        const t = makeChannel(guild, { id: discord.SnowflakeUtil.generate().toString(), name: opts.name, type: 11, parentId: channel.id });
        Object.assign(t, { archived: false, messageCount: 0, permissionsFor: (me) => channel.permissionsFor(me) });
        channel.threads.list.push(t);
        guild.channels?.cache?.set?.(t.id, t);
        return t;
      },
    },
  };
  return channel;
}

/**
 * Baut einen Fake-Client mit einem Server und typischen Kanälen:
 * - #allgemein (sehen+schreiben+verlauf), #nur-lesen (sehen+verlauf), #geheim (unsichtbar), #ankuendigungen (Ankündigung),
 *   ein Sprachkanal (wird nie gelistet), Kategorie "Projekte" mit #projekt-a.
 */
function createFakeWorld({ loginBehavior = 'ready', withExtraTypes = false } = {}) {
  const client = new EventEmitter();
  client.user = makeUser(BOT_ID, 'PKBot', { bot: true });
  client.profileCalls = [];
  client.user.edit = async (body) => {
    client.profileCalls.push(["user", body]);
    if (body.username) client.user.username = body.username;
    return client.user;
  };
  client.application = {
    id: BOT_ID,
    description: "Testbot",
    fetch: async () => client.application,
    edit: async ({ description }) => {
      client.profileCalls.push(["app", { description }]);
      client.application.description = description;
      return client.application;
    },
  };
  client.rest = new EventEmitter();
  client._ready = false;
  client.isReady = () => client._ready;
  client.destroyed = false;
  client.loginCalls = [];
  client.login = async (token) => {
    client.loginCalls.push(token);
    if (loginBehavior === 'ready') {
      setImmediate(() => {
        client._ready = true;
        client.emit(Events.ClientReady, client);
      });
      return token;
    }
    if (loginBehavior === 'invalid-token') {
      const err = new Error('An invalid token was provided.');
      err.code = 'TokenInvalid';
      throw err;
    }
    if (loginBehavior === 'disallowed-intents') {
      setImmediate(() => client.emit(Events.ShardDisconnect, { code: 4014 }, 0));
      return token; // Promise löst sich in discord.js NICHT – genau diesen Fall fangen wir ab
    }
    if (loginBehavior === 'hang') return new Promise(() => {});
    throw new Error('unbekanntes loginBehavior');
  };
  client.destroy = async () => {
    client.destroyed = true;
    client._ready = false;
  };

  const world = {};
  const guild = { id: GUILD_ID, name: 'Testserver', nameAcronym: 'T', client, iconURL: () => null };
  const me = { id: BOT_ID, nickname: null, permissions: { has: (flag) => me.permFlags.has(flag) }, permFlags: new Set(), roles: { highest: { position: 3 } } };
  guild.ownerId = '999999999999999999';
  guild.bans = [];
  const members = new Map();
  guild.members = {
    me,
    async editMe({ nick }) {
      client.profileCalls.push(["member", { nick }]);
      me.nickname = nick;
      return me;
    },
    cache: members,
    async fetch(id) {
      const m = members.get(id);
      if (!m) throw Object.assign(new Error('Unknown Member'), { code: 10007 });
      return m;
    },
    async ban(id, opts) {
      guild.bans.push({ id, ...opts });
      members.delete(id);
    },
    searchCalls: [],
    searchShouldFail: false,
    async search({ query, limit }) {
      guild.members.searchCalls.push({ query, limit });
      if (guild.members.searchShouldFail) throw new Error('Missing Access');
      return new Map([...members.values()].filter((m) => m.displayName.toLowerCase().startsWith(query.toLowerCase())).slice(0, limit).map((m) => [m.id, m]));
    },
  };
  const addMember = (id, name) => {
    const user = makeUser(id, name.toLowerCase());
    // Wie discord.js GuildMember: Rollen, Timeout, Kick; manageable/moderatable/kickable/bannable steuerbar für Tests
    const roleIds = new Set();
    const member = {
      id,
      user,
      displayName: name,
      displayAvatarURL: avatar,
      manageable: true,
      moderatable: true,
      kickable: true,
      bannable: true,
      communicationDisabledUntilTimestamp: null,
      modCalls: [],
      roles: {
        cache: { has: (r) => roleIds.has(r) },
        add: async (r, reason) => (member.modCalls.push(['role+', r, reason]), roleIds.add(r)),
        remove: async (r, reason) => (member.modCalls.push(['role-', r, reason]), roleIds.delete(r)),
      },
      async timeout(ms, reason) {
        member.modCalls.push(['timeout', ms, reason]);
        member.communicationDisabledUntilTimestamp = ms ? Date.now() + ms : null;
      },
      async kick(reason) {
        member.modCalls.push(['kick', reason]);
        members.delete(id);
      },
    };
    members.set(id, member);
    user.createDM = async () => [...client.channels.cache.values()].find((c) => c.type === ChannelType.DM && c.recipientId === user.id) || world.makeDM(user);
    return user;
  };
  guild.roles = {
    cache: new Map([
      [GUILD_ID, { id: GUILD_ID, name: '@everyone', position: 0, mentionable: false, hexColor: '#000000' }],
      ['333333333333333301', { id: '333333333333333301', name: 'Moderatoren', position: 2, mentionable: true, hexColor: '#ff8800' }],
      ['333333333333333302', { id: '333333333333333302', name: 'Mods-Geheim', position: 1, mentionable: false, hexColor: '#000000' }],
    ]),
  };

  const category = { id: '444444444444444400', name: 'Projekte', type: ChannelType.GuildCategory, position: 1, guild };
  const all = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory];
  const channels = {
    allgemein: makeChannel(guild, { id: '444444444444444401', name: 'allgemein', position: 0, perms: all }),
    nurLesen: makeChannel(guild, { id: '444444444444444402', name: 'nur-lesen', position: 1, perms: [P.ViewChannel, P.ReadMessageHistory] }),
    geheim: makeChannel(guild, { id: '444444444444444403', name: 'geheim', position: 2, perms: [] }),
    ankuendigungen: makeChannel(guild, { id: '444444444444444404', name: 'ankuendigungen', type: ChannelType.GuildAnnouncement, position: 3, perms: [...all, P.MentionEveryone] }),
    voice: makeChannel(guild, { id: '444444444444444405', name: 'Sprache', type: ChannelType.GuildVoice, position: 4, perms: all }),
    projektA: makeChannel(guild, { id: '444444444444444406', name: 'projekt-a', parentId: category.id, position: 0, perms: all }),
    blindHistory: makeChannel(guild, { id: '444444444444444407', name: 'ohne-verlauf', position: 5, perms: [P.ViewChannel, P.SendMessages] }),
  };
  // Kanaltypen, die erkannt, aber (noch) nicht bedient werden – nur in Tests, die sie ausdrücklich anfordern
  if (withExtraTypes) {
    channels.forum = makeChannel(guild, { id: '444444444444444408', name: 'ideen-forum', type: ChannelType.GuildForum, position: 6, perms: all });
    channels.stage = makeChannel(guild, { id: '444444444444444409', name: 'bühne', type: ChannelType.GuildStageVoice, position: 7, perms: all });
    channels.thread = makeChannel(guild, { id: '444444444444444410', name: 'ein-thread', type: ChannelType.PublicThread, parentId: '444444444444444401', perms: all });
  }
  guild.channels = { cache: new Map([[category.id, category], ...Object.values(channels).map((c) => [c.id, c])]) };
  guild.voiceStates = { cache: new Map() };
  // REST-Nachladen (für "Aktualisieren"): zählt Aufrufe, kann zum Scheitern gebracht werden.
  guild.refreshCalls = [];
  guild.refreshShouldFail = false;
  const track = (name) => async () => {
    guild.refreshCalls.push(name);
    if (guild.refreshShouldFail) throw new Error('Missing Access');
  };
  guild.members.fetchMe = track('fetchMe');
  guild.roles.fetch = track('roles');
  guild.channels.fetch = track('channels');
  guild.voiceAdapterCreator = () => ({ sendPayload: () => true, destroy: () => {} });
  client.guilds = { cache: new Map([[GUILD_ID, guild]]) };
  client.channels = {
    cache: guild.channels.cache,
    fetchCalls: [],
    async fetch(id) {
      client.channels.fetchCalls.push(id);
      return client.channels.cache.get(id) || dmArchive.get(id) || Promise.reject(Object.assign(new Error('Unknown Channel'), { code: 10003 }));
    },
  };
  // Privatchats: wie discord.js ein Kanal vom Typ DM mit recipientId; "dmArchive" = nicht im Speicher, nur per fetch erreichbar
  const dmArchive = new Map();
  const allUsers = () => [client.user, ...[...members.values()].map((m) => m.user)];
  client.users = {
    async fetch(id) {
      const u = allUsers().find((x) => x.id === id);
      if (!u) throw Object.assign(new Error('Unknown User'), { code: 10013 });
      return u;
    },
  };
  function makeDM(user, { cached = true, id } = {}) {
    const ch = makeChannel(guild, { id: id || discord.SnowflakeUtil.generate().toString(), name: undefined, type: ChannelType.DM, perms: [] });
    delete ch.guild;
    ch.guildId = null;
    ch.recipientId = user.id;
    ch.recipient = user;
    if (cached) client.channels.cache.set(ch.id, ch);
    else dmArchive.set(ch.id, ch);
    return ch;
  }
  world.makeDM = makeDM;

  return Object.assign(world, { client, guild, channels, category, addMember, makeUser, makeMessage, makeDM, dmArchive });
}

function tmpEnv(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-test-'));
  const envPath = path.join(dir, '.env');
  if (content !== null) fs.writeFileSync(envPath, content, 'utf8');
  return envPath;
}

/** Service + Fake-Welt + Event-Recorder in einem. */
function createTestService(opts = {}) {
  const world = createFakeWorld(opts);
  const events = [];
  const envPath = tmpEnv(opts.envContent === undefined ? `DISCORD_TOKEN=${FAKE_TOKEN}\n` : opts.envContent);
  const service = createDiscordService({
    discord,
    envPath,
    emit: (type, payload) => events.push({ type, payload }),
    createClient: () => world.client,
    loginTimeoutMs: opts.loginTimeoutMs ?? 300,
    ...(opts.dmStore ? { dmStore: opts.dmStore } : {}),
    ...(opts.presence ? { presence: opts.presence } : {}),
  });
  return { service, world, events, envPath };
}

async function readyService(opts) {
  const ctx = createTestService(opts);
  const st = await ctx.service.connect();
  if (st.state !== 'ready') throw new Error(`Service nicht bereit: ${JSON.stringify(st)}`);
  return ctx;
}

module.exports = { discord, P, ChannelType, Events, BOT_ID, GUILD_ID, FAKE_TOKEN, createFakeWorld, createTestService, readyService, tmpEnv, makeMessage };
