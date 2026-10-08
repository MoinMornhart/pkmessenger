'use strict';

// Fernhilfe außerhalb des WLANs (Issue #79/#83): Die App verbindet sich AUSGEHEND zum Relay und bedient Helfer über
// Relay-Frames. Hier mit einem Fake-WebSocket (der den Relay nachbildet), damit es deterministisch testbar ist.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const nacl = require('tweetnacl');
const { createHelp } = require('../src/main/help');

const b64 = (u8) => Buffer.from(u8).toString('base64');
const seal = (obj, key) => {
  const n = nacl.randomBytes(nacl.secretbox.nonceLength);
  return { n: b64(n), c: b64(nacl.secretbox(Buffer.from(JSON.stringify(obj)), n, key)) };
};
const unseal = (msg, key) => {
  if (!msg?.c) return msg;
  const plain = nacl.secretbox.open(new Uint8Array(Buffer.from(msg.c, 'base64')), new Uint8Array(Buffer.from(msg.n, 'base64')), key);
  return plain ? JSON.parse(Buffer.from(plain).toString('utf8')) : null;
};

// Fake-WebSocket aus Sicht der App (das, was help.js öffnet). Der Test spielt die Relay-Gegenseite.
class FakeWS extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.sent = [];
    FakeWS.last = this;
    setImmediate(() => this.emit('open'));
  }
  send(s) {
    this.sent.push(JSON.parse(s));
  }
  close() {
    this.emit('close');
  }
  // Relay → App
  deliver(obj) {
    this.emit('message', Buffer.from(JSON.stringify(obj)));
  }
}

function keyFromRelayUrl(url) {
  const h = new URLSearchParams(url.split('#')[1]);
  return { room: h.get('r'), key: new Uint8Array(Buffer.from(h.get('c'), 'base64')) };
}

test('Relay-Modus: Link enthält Raum + Schlüssel, Helfer koppelt und bekommt geschwärzte Sicht + Aktion', async () => {
  const events = [];
  const applied = [];
  let view = { screen: 'setup', fields: [{ id: 'wizard-next', label: 'Weiter' }, { id: 'token-input', label: 'Bot-Token', secret: true }] };
  const help = createHelp({
    emit: (t, p) => {
      events.push({ t, p });
      if (t === 'help:pending' && !p.done) setImmediate(() => help.decide({ id: p.id, allow: true }));
    },
    getView: () => view,
    applyAction: (a) => applied.push(a),
    getRelay: () => ({ wss: 'wss://relay.test/ws', httpBase: 'https://relay.test' }),
    WebSocketImpl: FakeWS,
    hostName: 'pc.local',
    port: 0,
  });

  const info = await help.request();
  assert.equal(info.relay, true);
  assert.match(info.relayUrl, /^https:\/\/relay\.test\/help\/#r=[A-Za-z0-9_-]{8,32}&c=/);
  const { room, key } = keyFromRelayUrl(info.relayUrl);
  const ws = FakeWS.last;
  await new Promise((r) => setTimeout(r, 10));
  // App meldet sich beim Relay als Host für genau diesen Raum
  assert.deepEqual(ws.sent[0], { room, role: 'host' });

  // Helfer koppelt (Relay reicht Frame an die App; die antwortet über den Relay zurück)
  ws.deliver({ id: '1', path: '/pair', body: { code: info.code, ...seal({ name: 'Alex', t: Date.now() }, key) } });
  await new Promise((r) => setTimeout(r, 20));
  const pairReply = ws.sent.find((m) => m.id === '1');
  assert.ok(pairReply && unseal(pairReply.reply, key).ok === true);
  assert.equal(help.status().connected, true);

  // Sicht abholen → Token-Feld ist geheim, Chat verborgen wäre bei screen=workspace
  ws.deliver({ id: '2', path: '/view', body: seal({ t: Date.now() }, key) });
  await new Promise((r) => setTimeout(r, 20));
  const viewReply = unseal(ws.sent.find((m) => m.id === '2').reply, key);
  assert.equal(viewReply.view.fields.find((f) => f.id === 'token-input').secret, true);

  // erlaubte Aktion kommt an; Geheimnis-Feld wird abgelehnt
  ws.deliver({ id: '3', path: '/act', body: seal({ t: Date.now(), action: { type: 'click', target: 'wizard-next' } }, key) });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(applied.at(-1), { type: 'click', target: 'wizard-next' });
  ws.deliver({ id: '4', path: '/act', body: seal({ t: Date.now(), action: { type: 'click', target: 'token-input' } }, key) });
  await new Promise((r) => setTimeout(r, 20));
  assert.match(unseal(ws.sent.find((m) => m.id === '4').reply, key).rejected, /Sicherheits|erlaubt/);

  // Nutzer geht in den Chat → Helfer sieht nichts
  view = { screen: 'workspace', fields: [] };
  ws.deliver({ id: '5', path: '/view', body: seal({ t: Date.now() }, key) });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(unseal(ws.sent.find((m) => m.id === '5').reply, key).view.hidden, true);

  help.stop();
});

test('Ohne Relay-Konfig: nur LAN-Link, kein Relay', async () => {
  const help = createHelp({ getRelay: () => null, hostName: 'pc.local', port: 0, lanAddresses: () => ['127.0.0.1'] });
  const info = await help.request();
  assert.equal(info.relay, false);
  assert.equal(info.relayUrl, null);
  assert.match(info.url, /^http:\/\/pc\.local:\d+\/help\//);
  help.stop();
});
