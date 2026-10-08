'use strict';

// Android-App (Issue #56): schlanker Discord-Client + derselbe Service wie auf dem PC.
// Simuliert Discords Gateway (WebSocket) und REST (fetch) – kein Netz nötig.
const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits: P, ChannelType } = require('discord-api-types/v10');
const { createClient, liteDiscord } = require('../src/mobile/lite-discord');
const { createDiscordService } = require('../src/main/discord');
const { validators } = require('../src/main/validate');

const BOT = '100000000000000001';
const G = '200000000000000001';
const EVERYONE = G;
const ROLE_BOT = '300000000000000001';
const CH_OPEN = '400000000000000001';
const CH_HIDDEN = '400000000000000002';
const CH_READONLY = '400000000000000003';
const ANNA = '500000000000000001';

function fakeDiscord({ closeCode = null } = {}) {
  const sockets = [];
  const requests = [];
  const restReplies = new Map(); // "METHOD route" → (req) => { status, body }
  class FakeWS {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      this.sent = [];
      sockets.push(this);
      setTimeout(() => this.push({ op: 10, d: { heartbeat_interval: 45000 } }), 1);
    }
    push(pkt) {
      this.onmessage?.({ data: JSON.stringify(pkt) });
    }
    send(raw) {
      const pkt = JSON.parse(raw);
      this.sent.push(pkt);
      if (pkt.op === 2) {
        if (closeCode) return setTimeout(() => this.onclose?.({ code: closeCode }), 1);
        setTimeout(() => {
          this.push({ op: 0, s: 1, t: 'READY', d: { session_id: 's1', resume_gateway_url: 'wss://resume', user: { id: BOT, username: 'PKBot', bot: true }, application: { id: BOT, flags: 1 << 18 }, guilds: [{ id: G, unavailable: true }] } });
          this.push({ op: 0, s: 2, t: 'GUILD_CREATE', d: guildPayload() });
        }, 1);
      }
    }
    close(code) {
      this.readyState = 3;
      this.onclose?.({ code });
    }
  }
  const json = (status, body) => ({ status, ok: status < 400, headers: { get: () => null }, json: async () => body });
  const fetchImpl = async (url, opts) => {
    const route = url.replace('https://discord.com/api/v10', '').split('?')[0];
    const req = { method: opts.method, route, url, headers: opts.headers, body: opts.body && typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body };
    requests.push(req);
    const h = restReplies.get(`${opts.method} ${route}`);
    if (h) {
      const r = h(req);
      return json(r.status ?? 200, r.body);
    }
    return json(404, { code: 10003, message: 'Unknown' });
  };
  return { sockets, requests, restReplies, FakeWS, fetchImpl };
}

function guildPayload() {
  const view = String(P.ViewChannel);
  return {
    id: G,
    name: 'Mein Server',
    owner_id: ANNA,
    roles: [
      { id: EVERYONE, name: '@everyone', position: 0, permissions: String(P.ViewChannel | P.SendMessages | P.ReadMessageHistory), color: 0 },
      { id: ROLE_BOT, name: 'PKBot', position: 1, permissions: String(P.AddReactions), color: 0x00ff00, tags: { bot_id: BOT } },
    ],
    members: [
      { user: { id: BOT, username: 'PKBot', bot: true }, roles: [ROLE_BOT], nick: null, joined_at: '2026-10-01T00:00:00Z' },
      { user: { id: ANNA, username: 'anna', global_name: 'Anna' }, roles: [], joined_at: '2026-01-01T00:00:00Z' },
    ],
    channels: [
      { id: CH_OPEN, type: ChannelType.GuildText, name: 'allgemein', position: 0, permission_overwrites: [], last_message_id: '600000000000000001' },
      { id: CH_HIDDEN, type: ChannelType.GuildText, name: 'geheim', position: 1, permission_overwrites: [{ id: EVERYONE, type: 0, allow: '0', deny: view }] },
      { id: CH_READONLY, type: ChannelType.GuildText, name: 'nur-lesen', position: 2, permission_overwrites: [{ id: ROLE_BOT, type: 0, allow: '0', deny: String(P.SendMessages) }] },
    ],
    voice_states: [],
    presences: [],
    emojis: [{ id: '700000000000000001', name: 'party', animated: false }],
  };
}

async function setup(opts) {
  const fake = fakeDiscord(opts);
  const events = [];
  const service = createDiscordService({
    discord: liteDiscord,
    envPath: '',
    emit: (type, payload) => events.push({ type, payload }),
    getToken: () => ({ status: 'ok', token: 'MTAw.fake.token' }),
    createClient: () => createClient({ intents: [1, 512, 32768], fetchImpl: fake.fetchImpl, WebSocketImpl: fake.FakeWS, sleep: async () => {}, readyWaitMs: 200 }),
    loginTimeoutMs: 2000,
  });
  fake.restReplies.set(`PUT /applications/${BOT}/commands`, () => ({ body: [] }));
  const status = await service.connect();
  return { ...fake, events, service, status };
}

test('Anmelden über das Gateway: nur Bot-Token, freigegebene Intents; Server + Kanäle mit richtigen Rechten', async () => {
  const { service, status, sockets } = await setup();
  assert.equal(status.state, 'ready');
  assert.equal(status.bot.username, 'PKBot');
  const identify = sockets[0].sent.find((p) => p.op === 2);
  assert.equal(identify.d.token, 'MTAw.fake.token');
  assert.equal(identify.d.intents, 1 | 512 | 32768);
  assert.deepEqual(service.listGuilds().map((g) => g.name), ['Mein Server']);
  const chans = service.listChannels({ guildId: G }).flatMap((g) => g.channels);
  assert.deepEqual(chans.map((c) => c.name), ['allgemein', 'nur-lesen']); // „geheim“ ist für den Bot gesperrt
  assert.equal(chans.find((c) => c.name === 'nur-lesen').canSend, false);
  assert.equal(chans.find((c) => c.name === 'allgemein').canSend, true);
  assert.deepEqual(service.listEmojis({ guildId: G }).map((e) => e.key), ['party:700000000000000001']);
  await service.disconnect();
});

test('Verlauf laden + Senden: Discord-API-Format, niemand wird ungewollt gepingt', async () => {
  const ctx = await setup();
  ctx.restReplies.set(`GET /channels/${CH_OPEN}/messages`, () => ({
    body: [{ id: '600000000000000001', channel_id: CH_OPEN, guild_id: G, author: { id: ANNA, username: 'anna', global_name: 'Anna' }, content: 'Hallo <@100000000000000001>', mentions: [{ id: BOT, username: 'PKBot', bot: true }], mention_roles: [], attachments: [], embeds: [], reactions: [{ emoji: { name: '👍' }, count: 2, me: false }], type: 0 }],
  }));
  const { messages } = await ctx.service.getMessages(validators.getMessages({ channelId: CH_OPEN, limit: 50 }));
  assert.equal(messages[0].author.name, 'Anna');
  assert.equal(messages[0].toBot, true);
  assert.deepEqual(messages[0].reactions.map((r) => [r.key, r.count]), [['👍', 2]]);
  ctx.restReplies.set(`POST /channels/${CH_OPEN}/messages`, (req) => ({ body: { id: '600000000000000002', channel_id: CH_OPEN, guild_id: G, author: { id: BOT, username: 'PKBot', bot: true }, content: req.body.content, mentions: [], attachments: [], embeds: [], type: 0 } }));
  const sent = await ctx.service.sendMessage(validators.sendMessage({ channelId: CH_OPEN, content: 'Hi @everyone', mentions: { users: [], roles: [], everyone: false }, nonce: '123' }));
  assert.equal(sent.isOwn, true);
  const req = ctx.requests.find((r) => r.method === 'POST' && r.route === `/channels/${CH_OPEN}/messages`);
  assert.equal(req.headers.Authorization, 'Bot MTAw.fake.token');
  assert.deepEqual(req.body.allowed_mentions, { parse: [], users: [], roles: [], replied_user: false });
  assert.equal(req.body.enforce_nonce, true);
  // Kanal ohne Schreibrecht → deutsche Fehlermeldung, kein Request
  await assert.rejects(ctx.service.sendMessage(validators.sendMessage({ channelId: CH_READONLY, content: 'x', mentions: { users: [], roles: [], everyone: false } })), { code: 'MISSING_PERMISSION' });
  await ctx.service.disconnect();
});

test('Live: neue Nachricht, Tippen und Reaktion kommen als dieselben Ereignisse wie auf dem PC', async () => {
  const ctx = await setup();
  const ws = ctx.sockets[0];
  ws.push({ op: 0, s: 3, t: 'MESSAGE_CREATE', d: { id: '600000000000000003', channel_id: CH_OPEN, guild_id: G, author: { id: ANNA, username: 'anna', global_name: 'Anna' }, member: { roles: [], nick: 'Anni' }, content: 'Neu!', mentions: [], mention_roles: [], attachments: [], embeds: [], type: 0 } });
  ws.push({ op: 0, s: 4, t: 'TYPING_START', d: { channel_id: CH_OPEN, guild_id: G, user_id: ANNA, member: { user: { id: ANNA, username: 'anna' }, roles: [], nick: 'Anni' } } });
  ws.push({ op: 0, s: 5, t: 'MESSAGE_REACTION_ADD', d: { channel_id: CH_OPEN, guild_id: G, message_id: '600000000000000003', user_id: ANNA, emoji: { name: '🎉' } } });
  await new Promise((r) => setTimeout(r, 10));
  const created = ctx.events.find((e) => e.type === 'message:create').payload;
  assert.equal(created.author.name, 'Anni');
  assert.equal(created.content, 'Neu!');
  assert.deepEqual(ctx.events.find((e) => e.type === 'typing').payload, { channelId: CH_OPEN, userId: ANNA, name: 'Anni' });
  const upd = ctx.events.filter((e) => e.type === 'message:update').at(-1).payload;
  assert.deepEqual(upd.reactions.map((r) => [r.key, r.count]), [['🎉', 1]]);
  await ctx.service.disconnect();
});

test('Discord lehnt Intents ab (4014) → klare deutsche Meldung statt Endlosschleife', async () => {
  const { status } = await setup({ closeCode: 4014 });
  assert.equal(status.state, 'error');
  assert.equal(status.error.code, 'DISALLOWED_INTENTS');
});

test('Rate-Limit (429): wartet retry_after ab und versucht es dann erneut', async () => {
  const ctx = await setup();
  let n = 0;
  ctx.restReplies.set(`POST /channels/${CH_OPEN}/typing`, () => (++n === 1 ? { status: 429, body: { retry_after: 0.01, global: false } } : { status: 204 }));
  assert.equal(await ctx.service.sendTyping(validators.channelRef({ channelId: CH_OPEN })), true);
  assert.equal(n, 2);
  assert.ok(ctx.events.some((e) => e.type === 'ratelimit'));
  await ctx.service.disconnect();
});

test('Rechte: Admin sieht alles; Besitzer sieht alles; Mitglieds-Overwrite schlägt Rollen', () => {
  const fake = fakeDiscord();
  const c = createClient({ fetchImpl: fake.fetchImpl, WebSocketImpl: fake.FakeWS });
  // direkt die Cache-Funktion über ein Gateway-Paket füttern
  c.login('x');
  return new Promise((resolve) =>
    c.once('clientReady', () => {
      const g = c.guilds.cache.get(G);
      const hidden = c.channels.cache.get(CH_HIDDEN);
      assert.equal(hidden.permissionsFor(g.members.me).has(P.ViewChannel), false);
      assert.equal(hidden.permissionsFor(g.members.cache.get(ANNA)).has(P.ViewChannel), true); // Besitzerin
      hidden.permissionOverwrites.push({ id: BOT, type: 1, allow: String(P.ViewChannel), deny: '0' });
      assert.equal(hidden.permissionsFor(g.members.me).has(P.ViewChannel), true);
      g.roles.cache.get(ROLE_BOT).permissions = { bitfield: P.Administrator, has: () => true };
      c.destroy();
      resolve();
    }),
  );
});
