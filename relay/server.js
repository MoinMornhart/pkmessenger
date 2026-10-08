'use strict';

// PKMessenger-Relay – WebSocket-Vermittler (Issue #79/#50). Leitet nur verschlüsselte Pakete weiter (siehe core.js).
// Lauscht hinter einem Reverse-Proxy (z. B. Nginx/Caddy auf dem Proxmox) auf PORT; TLS macht der Proxy (wss://domain).
//
// Umgebungsvariablen (alle optional):
//   PORT         Port (Standard 8787)
//   HOST         Bind-Adresse (Standard 127.0.0.1 – nur lokal, der Reverse-Proxy macht den Rest)
//   MAX_ROOMS    gleichzeitige Räume (Standard 2000)
//   ORIGIN       erlaubte Origin(s) für Browser-Clients, kommagetrennt (leer = alle; App-Clients senden keine Origin)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const { createRelay, MAX_MSG_BYTES } = require('./core');

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 2000;
const ORIGINS = (process.env.ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
const RATE_PER_MIN = 600;

const relay = createRelay({ maxRooms: MAX_ROOMS });
const rate = new Map(); // ip → { count, win }
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

// Die Helfer-Oberfläche liegt im Repo unter src/help-web und wird hier mit ausgeliefert (gleicher Code wie am PC).
const WEB_DIR = path.join(__dirname, '..', 'src', 'help-web');
const STATIC = { '/help/': ['index.html', 'text/html; charset=utf-8'], '/help/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/help/nacl.js': ['nacl.js', 'text/javascript; charset=utf-8'] };
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src wss: 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const server = http.createServer((req, res) => {
  const p = (req.url || '').split('?')[0].split('#')[0];
  if (p === '/' || p === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, service: 'pkmessenger-relay', ...relay.stats() }));
  }
  const hit = STATIC[p] || (p === '/help' ? STATIC['/help/'] : null);
  if (hit) {
    try {
      res.writeHead(200, { 'content-type': hit[1], 'cache-control': 'no-store', 'content-security-policy': CSP, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
      return res.end(fs.readFileSync(path.join(WEB_DIR, hit[0])));
    } catch {
      res.writeHead(500).end();
      return;
    }
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG_BYTES + 1024 });

wss.on('connection', (ws, req) => {
  // einfache Origin-Prüfung für Browser-Helfer (die App schickt keine Origin und ist dadurch nicht betroffen)
  const origin = req.headers.origin;
  if (ORIGINS.length && origin && !ORIGINS.includes(origin)) return ws.close(1008, 'origin');
  const ip = ipOf(req);
  let joined = false;

  ws.on('message', (data, isBinary) => {
    // Rate-Limit pro IP
    const r = rate.get(ip) || { count: 0, win: Date.now() };
    if (Date.now() - r.win > 60000) {
      r.count = 0;
      r.win = Date.now();
    }
    if (++r.count > RATE_PER_MIN) {
      rate.set(ip, r);
      return;
    }
    rate.set(ip, r);

    if (!joined) {
      // erste Nachricht MUSS das Beitreten sein (JSON, Text)
      let msg = null;
      try {
        msg = JSON.parse(isBinary ? '' : data.toString());
      } catch {
        return ws.close(1003, 'join-expected');
      }
      const res = relay.join(ws, { room: msg?.room, role: msg?.role });
      if (!res.ok) return ws.close(1008, res.error);
      joined = true;
      return;
    }
    // danach: alles unverändert an die Gegenseite weiterreichen (Binär bleibt binär)
    relay.forward(ws, isBinary ? data : data.toString());
  });

  ws.on('close', () => relay.leave(ws));
  ws.on('error', () => relay.leave(ws));
  // wer in 20 s nicht beitritt, fliegt raus
  setTimeout(() => {
    if (!joined) ws.close(1008, 'timeout');
  }, 20000).unref?.();
});

setInterval(() => relay.sweep(), 60000).unref?.();

server.listen(PORT, HOST, () => {
  console.log(`PKMessenger-Relay läuft auf http://${HOST}:${PORT} (WebSocket unter /ws). Nur verschlüsselte Pakete, kein Speicher.`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
