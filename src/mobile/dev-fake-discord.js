// NUR für Bildtests am PC (node scripts/build-mobile.js --demo) – kommt nie in die APK.
// Simuliert Discords Gateway (WebSocket) und REST (fetch) im Browser, damit die Android-Oberfläche mit dem
// echten schlanken Client (lite-discord.js) und dem echten Service getestet werden kann.
const P = { View: 1n << 10n, Send: 1n << 11n, History: 1n << 16n, React: 1n << 6n, Attach: 1n << 15n, Embed: 1n << 14n, Pin: 1n << 51n, Threads: 1n << 35n, InThreads: 1n << 38n, Connect: 1n << 20n, Speak: 1n << 21n, Polls: 1n << 49n, ManageChannels: 1n << 4n };
const BOT = '1200000000000000001';
const G = '1300000000000000001';
const people = {
  anna: { id: '1400000000000000001', username: 'anna', global_name: 'Anna' },
  bernd: { id: '1400000000000000002', username: 'bernd', global_name: 'Bernd' },
  chiara: { id: '1400000000000000003', username: 'chiara', global_name: 'Chiara' },
};
const botUser = { id: BOT, username: 'PKBot', global_name: 'PKBot', bot: true };
const all = String(Object.values(P).reduce((a, b) => a | b, 0n));
const CH = { allgemein: '1500000000000000001', projekt: '1500000000000000002', ankuend: '1500000000000000003', nurlesen: '1500000000000000004', voice: '1500000000000000005', cat: '1500000000000000006', dm: '1500000000000000007' };
const now = Date.now();
const iso = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();
// Nachrichten-IDs passend zum Zeitpunkt (Discord leitet die Zeit aus der ID ab)
const sid = (minsAgo) => String(((BigInt(now - minsAgo * 60000) - 1420070400000n) << 22n) + BigInt(Math.floor(Math.random() * 4000)));
const msg = (ch, author, content, minsAgo, extra = {}) => ({ id: sid(minsAgo), channel_id: ch, guild_id: ch === CH.dm ? undefined : G, author, content, timestamp: iso(minsAgo), edited_timestamp: null, mentions: [], mention_roles: [], attachments: [], embeds: [], type: 0, pinned: false, ...extra });

const store = {
  [CH.allgemein]: [
    msg(CH.allgemein, people.bernd, 'Morgen zusammen! ☀️', 95),
    msg(CH.allgemein, people.chiara, 'Hat jemand den Link zur Planung?', 60, { reactions: [{ emoji: { name: '👀' }, count: 2, me: false }] }),
    msg(CH.allgemein, botUser, 'Hier entlang: #projekt-alpha 🙂', 58),
    msg(CH.allgemein, people.anna, 'Danke! Ich bin gleich wieder da.', 12),
  ],
  [CH.projekt]: [msg(CH.projekt, people.chiara, 'Läuft bei mir flüssig 🚀', 30)],
  [CH.ankuend]: [msg(CH.ankuend, people.bernd, 'Am Freitag ist Spieleabend! 🎲', 300)],
  [CH.nurlesen]: [msg(CH.nurlesen, people.bernd, 'Dieser Kanal ist für den Bot nur lesbar.', 1500)],
  [CH.dm]: [msg(CH.dm, people.chiara, 'Hi Bot, kannst du mich morgen erinnern?', 20), msg(CH.dm, botUser, 'Klar, mach ich! ⏰', 19)],
};
const lastOf = (ch) => store[ch]?.at(-1)?.id ?? null;

const guild = () => ({
  id: G,
  name: 'PK Testserver',
  owner_id: people.anna.id,
  icon: null,
  roles: [
    { id: G, name: '@everyone', position: 0, permissions: String(P.View | P.Send | P.History | P.React), color: 0 },
    { id: '1700000000000000001', name: 'PKBot', position: 2, permissions: all, color: 0x2dd4bf, tags: { bot_id: BOT } },
    { id: '1700000000000000002', name: 'Moderatoren', position: 1, permissions: '0', color: 0xff8800, mentionable: true },
  ],
  members: [
    { user: botUser, roles: ['1700000000000000001'], joined_at: iso(60 * 24 * 30) },
    { user: people.anna, roles: ['1700000000000000002'], joined_at: iso(60 * 24 * 300) },
    { user: people.bernd, roles: [], joined_at: iso(60 * 24 * 200) },
    { user: people.chiara, roles: [], joined_at: iso(60 * 24 * 100) },
  ],
  channels: [
    { id: CH.allgemein, type: 0, name: 'allgemein', position: 0, permission_overwrites: [], last_message_id: lastOf(CH.allgemein), topic: 'Alles Mögliche' },
    { id: CH.cat, type: 4, name: 'Projekte', position: 1, permission_overwrites: [] },
    { id: CH.projekt, type: 0, name: 'projekt-alpha', position: 0, parent_id: CH.cat, permission_overwrites: [], last_message_id: lastOf(CH.projekt) },
    { id: CH.ankuend, type: 5, name: 'ankuendigungen', position: 2, permission_overwrites: [], last_message_id: lastOf(CH.ankuend) },
    { id: CH.nurlesen, type: 0, name: 'nur-lesen', position: 3, permission_overwrites: [{ id: '1700000000000000001', type: 0, allow: '0', deny: String(P.Send) }], last_message_id: lastOf(CH.nurlesen) },
    { id: CH.voice, type: 2, name: 'Sprache', position: 4, permission_overwrites: [] },
  ],
  voice_states: [{ user_id: people.bernd.id, channel_id: CH.voice, self_mute: false, member: { user: people.bernd, roles: [] } }],
  presences: [],
  emojis: [],
});

let socket = null;
const json = (status, body) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
async function fetchImpl(url, opts = {}) {
  const u = new URL(url);
  const route = u.pathname.replace('/api/v10', '');
  const method = opts.method || 'GET';
  const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : null;
  await new Promise((r) => setTimeout(r, 40));
  let m;
  if (method === 'GET' && (m = /^\/channels\/(\d+)\/messages$/.exec(route))) {
    const before = u.searchParams.get('before');
    const limit = Number(u.searchParams.get('limit') || 50);
    const list = (store[m[1]] || []).filter((x) => !before || BigInt(x.id) < BigInt(before));
    return json(200, list.slice(-limit).reverse());
  }
  if (method === 'POST' && (m = /^\/channels\/(\d+)\/messages$/.exec(route))) {
    const x = msg(m[1], botUser, body.content || '', 0, { nonce: body.nonce });
    (store[m[1]] ||= []).push(x);
    setTimeout(() => socket?.dispatch('MESSAGE_CREATE', x), 50);
    return json(200, x);
  }
  if (method === 'POST' && /\/typing$/.test(route)) return json(204);
  if (method === 'PUT' && /\/reactions\//.test(route)) return json(204);
  if (method === 'GET' && route === '/applications/@me') return json(200, { id: BOT, description: 'Testbot', flags: 1 << 18 });
  if (method === 'PUT' && /\/commands$/.test(route)) return json(200, []);
  if (method === 'GET' && (m = /^\/channels\/(\d+)$/.exec(route)) && m[1] === CH.dm) return json(200, { id: CH.dm, type: 1, recipients: [people.chiara], last_message_id: lastOf(CH.dm) });
  if (method === 'GET' && (m = /^\/guilds\/\d+\/members\/search$/.exec(route))) {
    const q = (u.searchParams.get('query') || '').toLowerCase();
    return json(200, Object.values(people).filter((p) => p.username.startsWith(q)).map((p) => ({ user: p, roles: [] })));
  }
  if (method === 'GET' && /\/threads\/active$/.test(route)) return json(200, { threads: [] });
  if (method === 'GET' && /\/threads\/archived\/public$/.test(route)) return json(200, { threads: [] });
  if (method === 'GET' && /\/pins$/.test(route)) return json(200, { items: [], has_more: false });
  return json(404, { code: 10003, message: 'Unknown (Demo)' });
}

class FakeGateway {
  constructor() {
    this.readyState = 1;
    socket = this;
    this.seq = 0;
    setTimeout(() => this.push({ op: 10, d: { heartbeat_interval: 41250 } }), 30);
  }
  push(pkt) {
    this.onmessage?.({ data: JSON.stringify(pkt) });
  }
  dispatch(t, d) {
    this.push({ op: 0, s: ++this.seq, t, d });
  }
  send(raw) {
    const pkt = JSON.parse(raw);
    if (pkt.op === 1) setTimeout(() => this.push({ op: 11 }), 20);
    if (pkt.op === 2) {
      setTimeout(() => {
        this.dispatch('READY', { session_id: 'demo', resume_gateway_url: 'wss://demo', user: botUser, application: { id: BOT, flags: 1 << 18 }, guilds: [{ id: G, unavailable: true }] });
        this.dispatch('GUILD_CREATE', guild());
      }, 60);
      // Live-Leben: Anna tippt und schreibt
      setTimeout(() => this.dispatch('TYPING_START', { channel_id: CH.allgemein, guild_id: G, user_id: people.anna.id, member: { user: people.anna, roles: [] } }), 2500);
      setTimeout(() => {
        const x = msg(CH.allgemein, people.anna, 'Bin zurück 👋 @PKBot kannst du die Liste posten?', 0, { mentions: [botUser] });
        store[CH.allgemein].push(x);
        this.dispatch('MESSAGE_CREATE', x);
      }, 4500);
    }
  }
  close() {
    this.readyState = 3;
  }
}

globalThis.__PK_TEST_DISCORD__ = { fetchImpl, WebSocketImpl: FakeGateway, token: 'MTIwMDAwMDAwMDAwMDAwMDAwMQ.demo.ZGVtby1vbmx5LW5vdC1hLXJlYWwtdG9rZW4', dmChannels: [{ channelId: CH.dm, userId: people.chiara.id }] };
