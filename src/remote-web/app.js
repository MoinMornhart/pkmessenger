'use strict';

// PKMessenger Fernzugang – Web-Oberfläche (Issue #46/#50). Im WLAN direkt per fetch, unterwegs über den eigenen Relay
// per WebSocket (#104/#105). Beide Wege sind gleich verschlüsselt; der Relay sieht nur Chiffretext.
// Alles wird mit tweetnacl verschlüsselt. Der Kopplungsschlüssel steht im Link hinter „#“ und wird nie gesendet.
// Inhalte werden nur als Text eingesetzt (textContent), nie als HTML.
(function () {
  const STORE = 'pk-remote-device';
  const $ = (id) => document.getElementById(id);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const toB64 = (u8) => btoa(String.fromCharCode(...u8));
  const fromB64 = (s) => Uint8Array.from(atob(String(s || '').replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(s || '').length / 4) * 4, '=')), (c) => c.charCodeAt(0));

  function seal(obj, key) {
    const n = nacl.randomBytes(24);
    return { n: toB64(n), c: toB64(nacl.secretbox(enc.encode(JSON.stringify(obj)), n, key)) };
  }
  function unseal(msg, key) {
    if (!msg || !msg.n || !msg.c) return null;
    const plain = nacl.secretbox.open(fromB64(msg.c), fromB64(msg.n), key);
    return plain ? JSON.parse(dec.decode(plain)) : null;
  }
  let device = null;
  try {
    device = JSON.parse(localStorage.getItem(STORE) || 'null');
  } catch {
    device = null;
  }
  const hash = new URLSearchParams(location.hash.slice(1));
  const relayRoom = () => hash.get('r') || (device && device.room) || null;

  // ---- Unterwegs: Relay-WebSocket (gleicher Server wie diese Seite, Pfad /ws) ----
  let ws = null;
  let wsReady = null;
  let pcOnline = false;
  const waiting = {};
  let nextId = 1;
  function connectRelay() {
    if (ws && ws.readyState === 1) return Promise.resolve();
    if (wsReady) return wsReady;
    wsReady = new Promise((resolve, reject) => {
      const s = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
      const timer = setTimeout(() => {
        reject(new Error('Relay nicht erreichbar.'));
        try {
          s.close();
        } catch (e) {
          /* egal */
        }
      }, 10000);
      s.onopen = () => s.send(JSON.stringify({ room: relayRoom(), role: 'guest' }));
      s.onmessage = (ev) => {
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch (e) {
          return;
        }
        if (m.relay) {
          if (m.relay === 'joined') {
            clearTimeout(timer);
            ws = s;
            pcOnline = Boolean(m.peer);
            resolve();
          } else if (m.relay === 'peer') pcOnline = Boolean(m.connected);
          return;
        }
        if (m.id && waiting[m.id]) {
          waiting[m.id](m.reply);
          delete waiting[m.id];
        }
      };
      s.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Relay nicht erreichbar.'));
      };
      s.onclose = (ev) => {
        clearTimeout(timer);
        if (ws === s) ws = null;
        wsReady = null;
        pcOnline = false;
        const why = ev && ev.reason === 'slot-taken' ? 'Ein anderes Gerät ist gerade unterwegs verbunden. Bitte dort schließen und erneut versuchen.' : 'Verbindung zum PC unterbrochen.';
        if (ev && ev.reason === 'slot-taken') reject(new Error(why));
        for (const k of Object.keys(waiting)) {
          waiting[k]({ error: why });
          delete waiting[k];
        }
      };
    });
    wsReady.catch(() => {
      wsReady = null;
    });
    return wsReady;
  }
  async function viaRelay(path, body) {
    await connectRelay();
    if (!pcOnline) throw new Error('Dein PC ist gerade nicht erreichbar (PKMessenger offen? Fernzugang an? Internet?).');
    return new Promise((resolve) => {
      const id = String(nextId++);
      waiting[id] = resolve;
      ws.send(JSON.stringify({ id, path, body }));
      setTimeout(() => {
        if (waiting[id]) {
          waiting[id]({ error: 'Keine Antwort vom PC.' });
          delete waiting[id];
        }
      }, 100000); // Kopplung wartet bis zu 90 s auf die Bestätigung am PC
    });
  }
  async function post(path, body) {
    if (relayRoom()) return viaRelay(path, body);
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store' });
    return r.json();
  }
  let session = null;
  let botName = 'Bot';
  const views = ['pair', 'login', 'nodevice', 'home', 'chat'];
  const show = (v) => views.forEach((x) => $(x).classList.toggle('hidden', x !== v));
  const nav = [];

  async function call(op, args) {
    const key = fromB64(device.key);
    const res = await post('/api', { d: device.id, ...seal({ op, args, session, t: Date.now() }, key) });
    if (res && res.unpaired) {
      localStorage.removeItem(STORE);
      device = null;
      show('nodevice');
      throw new Error(res.error);
    }
    const msg = res && res.n ? unseal(res, key) : res;
    if (!msg) throw new Error('Antwort nicht lesbar.');
    if (msg.relogin) {
      session = null;
      show('login');
      throw new Error(msg.error);
    }
    if (msg.error) throw new Error(msg.error);
    return msg;
  }

  // ---- Koppeln (Einmal-Code aus dem Link) ----
  const pairId = hash.get('p');
  const pairKey = hash.get('k');
  if (pairId && pairKey) {
    show('pair');
    $('pair-go').onclick = async () => {
      $('pair-msg').textContent = 'Warte auf Bestätigung am PC …';
      $('pair-go').disabled = true;
      try {
        const key = fromB64(pairKey);
        const res = await post('/api/pair', { p: pairId, ...seal({ password: $('pair-pw').value, name: $('pair-name').value || 'Gerät', t: Date.now() }, key) });
        const msg = res && res.n ? unseal(res, key) : res;
        if (!msg || msg.error) throw new Error((msg && msg.error) || 'Fehler');
        device = { id: msg.deviceId, key: msg.deviceKey, name: msg.name, room: hash.get('r') || null }; // Relay-Raum merken (unterwegs)
        localStorage.setItem(STORE, JSON.stringify(device));
        history.replaceState(null, '', location.pathname); // Schlüssel aus der Adresszeile entfernen
        $('pair-pw').value = '';
        show('login');
      } catch (e) {
        $('pair-msg').textContent = `⚠ ${e.message}`;
        $('pair-go').disabled = false;
      }
    };
  } else if (device) show('login');
  else show('nodevice');

  // ---- Anmelden (Passwort bei jeder Sitzung) ----
  $('login-go').onclick = async () => {
    $('login-msg').textContent = 'Prüfe …';
    try {
      const r = await call('login', { password: $('login-pw').value });
      $('login-pw').value = '';
      session = r.session;
      botName = r.bot || 'Bot';
      $('logout').classList.remove('hidden');
      $('login-msg').textContent = '';
      loadHome();
    } catch (e) {
      $('login-msg').textContent = `⚠ ${e.message}`;
    }
  };
  $('logout').onclick = () => {
    session = null;
    $('logout').classList.add('hidden');
    show('login');
  };

  // ---- Server, Kanäle, Chat ----
  function listButtons(items, onClick) {
    const list = $('list');
    list.textContent = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.textContent = it.label;
      b.onclick = () => onClick(it);
      list.appendChild(b);
    }
  }
  async function loadHome() {
    nav.length = 0;
    $('back').classList.add('hidden');
    $('title').textContent = 'Server';
    $('sendas').textContent = `Gesendet wird als „${botName}“ (BOT). Der PC-Besitzer sieht jede Aktivität.`;
    show('home');
    const guilds = (await call('guilds')).data || [];
    listButtons([{ label: '💬 Privatchats', dm: true }, ...guilds.map((g) => ({ label: `🖥 ${g.name}`, id: g.id, name: g.name }))], (it) => (it.dm ? loadDMs() : loadChannels(it)));
  }
  async function loadChannels(g) {
    nav.push(loadHome);
    $('back').classList.remove('hidden');
    $('title').textContent = g.name;
    const groups = (await call('channels', { guildId: g.id })).data || [];
    const chans = groups.flatMap((x) => x.channels).filter((c) => (c.type === 'text' || c.type === 'announcement') && !c.unsupported);
    listButtons(chans.map((c) => ({ label: `# ${c.name}${c.canSend ? '' : ' 🔒'}`, id: c.id, name: `#${c.name}` })), openChat);
  }
  async function loadDMs() {
    nav.push(loadHome);
    $('back').classList.remove('hidden');
    $('title').textContent = 'Privatchats';
    const dms = (await call('dms')).data || [];
    listButtons(dms.map((d) => ({ label: `💬 ${d.name}`, id: d.id, name: d.name })), openChat);
  }
  let poll = null;
  let current = null;
  async function openChat(c) {
    nav.push(() => {
      clearInterval(poll);
      return loadHome();
    });
    current = c;
    $('back').classList.remove('hidden');
    $('title').textContent = c.name;
    show('chat');
    await refreshChat();
    clearInterval(poll);
    poll = setInterval(() => refreshChat().catch(() => {}), 4000);
  }
  async function refreshChat() {
    if (!current) return;
    const r = (await call('messages', { channelId: current.id })).data || { messages: [] };
    const box = $('messages');
    const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 40;
    box.textContent = '';
    for (const m of r.messages.slice(-50)) {
      const d = document.createElement('div');
      d.className = `msg${m.isOwn ? ' own' : ''}`;
      const who = document.createElement('b');
      who.textContent = m.author && m.author.name ? m.author.name : '';
      const text = document.createElement('span');
      text.textContent = m.content || (m.attachments && m.attachments.length ? '📎 Anhang' : '…');
      const time = document.createElement('small');
      time.textContent = new Date(m.createdTimestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      d.append(who, text, time);
      box.appendChild(d);
    }
    if (atBottom) window.scrollTo(0, document.body.scrollHeight);
  }
  async function send() {
    const content = $('text').value.trim();
    if (!content || !current) return;
    $('chat-msg').textContent = 'Sende …';
    try {
      await call('send', { channelId: current.id, content });
      $('text').value = '';
      $('chat-msg').textContent = '';
      await refreshChat();
      window.scrollTo(0, document.body.scrollHeight);
    } catch (e) {
      $('chat-msg').textContent = `⚠ ${e.message}`;
    }
  }
  $('send').onclick = send;
  $('text').onkeydown = (e) => e.key === 'Enter' && send();
  $('back').onclick = () => {
    const f = nav.pop();
    if (f) f();
  };
})();
