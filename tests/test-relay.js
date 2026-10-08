'use strict';

// PKMessenger-Relay (Issue #79/#50): vermittelt nur verschlüsselte Pakete zwischen zwei Seiten, kein Speicher,
// kein Klartext-Zugriff. Reine Kernlogik (relay/core.js) mit Fake-Sockets.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRelay, ROOM_ID } = require('../relay/core');

const makeSocket = () => {
  const sent = [];
  return { sent, closed: false, send: (d) => sent.push(d), close: () => (s.closed = true) };
};
// kleine Hilfe, damit `this` in close stimmt
function sock() {
  const o = { sent: [], closed: false };
  o.send = (d) => o.sent.push(d);
  o.close = () => (o.closed = true);
  return o;
}
void makeSocket;

test('Raum-ID-Format', () => {
  assert.equal(ROOM_ID.test('abcd1234'), true);
  assert.equal(ROOM_ID.test('a_b-C9'.padEnd(8, 'x')), true);
  assert.equal(ROOM_ID.test('short'), false);
  assert.equal(ROOM_ID.test('bad id!'), false);
});

test('Zwei Seiten verbinden sich, Pakete gehen NUR an die Gegenseite (unverändert)', () => {
  const relay = createRelay();
  const host = sock();
  const guest = sock();
  assert.equal(relay.join(host, { room: 'room-1234', role: 'host' }).ok, true);
  assert.deepEqual(JSON.parse(host.sent[0]), { relay: 'joined', peer: false });
  assert.equal(relay.join(guest, { room: 'room-1234', role: 'guest' }).ok, true);
  assert.deepEqual(JSON.parse(guest.sent[0]), { relay: 'joined', peer: true });
  assert.deepEqual(JSON.parse(host.sent[1]), { relay: 'peer', connected: true }); // Host erfährt: Gegenseite da

  // verschlüsseltes Paket (hier nur Bytes) vom Host → nur der Gast bekommt es, unverändert
  const blob = Buffer.from([1, 2, 3, 250]);
  assert.equal(relay.forward(host, blob).ok, true);
  assert.equal(guest.sent.at(-1), blob);
  assert.equal(host.sent.length, 2); // Host bekommt sein eigenes Paket NICHT zurück
  // und zurück
  relay.forward(guest, 'verschlüsselt-xyz');
  assert.equal(host.sent.at(-1), 'verschlüsselt-xyz');
});

test('Nur ein Teilnehmer pro Rolle; unbekannte Rolle/Raum abgelehnt', () => {
  const relay = createRelay();
  assert.equal(relay.join(sock(), { room: 'room-1234', role: 'host' }).ok, true);
  assert.equal(relay.join(sock(), { room: 'room-1234', role: 'host' }).error, 'slot-taken');
  assert.equal(relay.join(sock(), { room: 'bad', role: 'host' }).error, 'bad-room');
  assert.equal(relay.join(sock(), { room: 'room-1234', role: 'admin' }).error, 'bad-role');
});

test('Ohne Gegenseite kein Weiterleiten; zu große Pakete abgelehnt', () => {
  const relay = createRelay({ maxMsgBytes: 10 });
  const host = sock();
  relay.join(host, { room: 'room-1234', role: 'host' });
  assert.equal(relay.forward(host, 'x').error, 'no-peer');
  const guest = sock();
  relay.join(guest, { room: 'room-1234', role: 'guest' });
  assert.equal(relay.forward(host, 'genau-zu-lang!!').error, 'too-large');
  assert.equal(relay.forward(host, '12345').ok, true);
});

test('Trennen räumt den Raum und informiert die Gegenseite; Raum ohne beide verschwindet', () => {
  const relay = createRelay();
  const host = sock();
  const guest = sock();
  relay.join(host, { room: 'room-1234', role: 'host' });
  relay.join(guest, { room: 'room-1234', role: 'guest' });
  relay.leave(guest);
  assert.deepEqual(JSON.parse(host.sent.at(-1)), { relay: 'peer', connected: false });
  assert.equal(relay.stats().rooms, 1); // Host noch drin
  relay.leave(host);
  assert.equal(relay.stats().rooms, 0);
});

test('Abgelaufene Räume werden beim Beitreten aufgeräumt', () => {
  let t = 1000;
  const relay = createRelay({ now: () => t, roomTtlMs: 5000 });
  relay.join(sock(), { room: 'room-old-1', role: 'host' });
  t += 6000;
  relay.join(sock(), { room: 'room-new-1', role: 'host' }); // löst sweep aus
  assert.equal(relay._rooms.has('room-old-1'), false);
  assert.equal(relay._rooms.has('room-new-1'), true);
});

test('Limit: keine neuen Räume über maxRooms', () => {
  const relay = createRelay({ maxRooms: 1 });
  assert.equal(relay.join(sock(), { room: 'room-aaaa', role: 'host' }).ok, true);
  assert.equal(relay.join(sock(), { room: 'room-bbbb', role: 'host' }).error, 'busy');
});
