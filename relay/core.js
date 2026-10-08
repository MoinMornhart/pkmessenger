'use strict';

// PKMessenger-Relay (Issue #79/#50): vermittelt NUR verschlüsselte Pakete zwischen zwei Geräten – damit Fernzugang
// und Fernhilfe auch außerhalb des WLANs gehen, ohne dass der Nutzer-PC von außen erreichbar sein muss.
//
// Was der Relay NICHT sieht/kann:
//  - Kein Klartext: alles ist in der App Ende-zu-Ende verschlüsselt (tweetnacl). Der Relay leitet nur Bytes weiter.
//  - Kein Bot-Token, keine Passwörter, keine Nachrichten.
//  - Kein Speicher: nichts wird abgelegt. Räume verschwinden, sobald beide weg sind oder der Raum abläuft.
//
// Ein „Raum“ verbindet genau ZWEI Seiten (A = die App des Nutzers, B = Helfer/Handy), die beide dieselbe zufällige
// Raum-ID kennen (die ID steht im Link; der Krypto-Schlüssel steht getrennt im Link-Fragment und erreicht den Relay nie).
// Diese Datei ist reine Logik (ohne Netz), damit sie gut testbar ist. Das WebSocket-Drumherum steht in server.js.

const ROOM_TTL_MS = 30 * 60 * 1000; // ein Raum ohne beide Seiten läuft nach 30 Min ab
const MAX_ROOMS = 2000;
const MAX_MSG_BYTES = 256 * 1024; // ein weitergeleitetes Paket
const ROOM_ID = /^[A-Za-z0-9_-]{8,64}$/;

function createRelay({ now = () => Date.now(), maxRooms = MAX_ROOMS, roomTtlMs = ROOM_TTL_MS, maxMsgBytes = MAX_MSG_BYTES } = {}) {
  const rooms = new Map(); // roomId → { a, b, createdAt }
  const socketRoom = new Map(); // socket → { roomId, role }

  function stats() {
    return { rooms: rooms.size, sockets: socketRoom.size };
  }

  function sweep() {
    for (const [id, room] of rooms) {
      if (!room.a && !room.b) rooms.delete(id);
      else if (now() - room.createdAt > roomTtlMs) {
        try {
          room.a?.close();
          room.b?.close();
        } catch {
          /* egal */
        }
        rooms.delete(id);
      }
    }
  }

  /** Eine Seite betritt einen Raum. role: 'host' (App) oder 'guest' (Helfer/Handy). */
  function join(socket, { room: roomId, role } = {}) {
    if (!ROOM_ID.test(String(roomId || ''))) return { ok: false, error: 'bad-room' };
    if (role !== 'host' && role !== 'guest') return { ok: false, error: 'bad-role' };
    sweep();
    let room = rooms.get(roomId);
    if (!room) {
      if (rooms.size >= maxRooms) return { ok: false, error: 'busy' };
      room = { a: null, b: null, createdAt: now() };
      rooms.set(roomId, room);
    }
    const slot = role === 'host' ? 'a' : 'b';
    if (room[slot]) return { ok: false, error: 'slot-taken' }; // nur einer pro Rolle
    room[slot] = socket;
    socketRoom.set(socket, { roomId, role });
    const peer = room[slot === 'a' ? 'b' : 'a'];
    // beiden Bescheid geben, ob die Gegenseite schon da ist
    safeSend(socket, JSON.stringify({ relay: 'joined', peer: Boolean(peer) }));
    if (peer) safeSend(peer, JSON.stringify({ relay: 'peer', connected: true }));
    return { ok: true, roomId, role };
  }

  /** Paket von einer Seite → unverändert an die andere Seite. */
  function forward(socket, data) {
    const info = socketRoom.get(socket);
    if (!info) return { ok: false, error: 'not-joined' };
    const len = typeof data === 'string' ? Buffer.byteLength(data) : data?.length || data?.byteLength || 0;
    if (len > maxMsgBytes) return { ok: false, error: 'too-large' };
    const room = rooms.get(info.roomId);
    const peer = room && room[info.role === 'host' ? 'b' : 'a'];
    if (!peer) return { ok: false, error: 'no-peer' };
    safeSend(peer, data);
    return { ok: true };
  }

  /** Eine Seite trennt → Raum räumen, Gegenseite informieren. */
  function leave(socket) {
    const info = socketRoom.get(socket);
    socketRoom.delete(socket);
    if (!info) return;
    const room = rooms.get(info.roomId);
    if (!room) return;
    const slot = info.role === 'host' ? 'a' : 'b';
    if (room[slot] === socket) room[slot] = null;
    const peer = room[slot === 'a' ? 'b' : 'a'];
    if (peer) safeSend(peer, JSON.stringify({ relay: 'peer', connected: false }));
    if (!room.a && !room.b) rooms.delete(info.roomId);
  }

  function safeSend(socket, data) {
    try {
      socket.send(data);
    } catch {
      /* Socket evtl. schon zu */
    }
  }

  return { join, forward, leave, stats, sweep, _rooms: rooms };
}

module.exports = { createRelay, ROOM_ID, ROOM_TTL_MS, MAX_MSG_BYTES };
