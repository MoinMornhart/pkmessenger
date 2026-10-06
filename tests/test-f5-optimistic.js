'use strict';

// F3/F4/F5 im Renderer-Speicher: optimistisches Senden, keine Duplikate, Nachladen älterer Seiten.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMessageStore } = require('../src/shared/message-store');

const CH = '444444444444444401';
const msg = (n, extra = {}) => ({ id: String(1000000000000000000n + BigInt(n)), channelId: CH, author: { id: '1' }, content: `m${n}`, createdTimestamp: n, ...extra });

function fakeApi(total) {
  const all = Array.from({ length: total }, (_, i) => msg(i));
  const calls = [];
  return {
    calls,
    async getMessages({ before, limit }) {
      calls.push({ before, limit });
      let list = before ? all.filter((m) => BigInt(m.id) < BigInt(before)) : all;
      list = list.slice(-limit);
      return { messages: list, hasMore: list.length === limit };
    },
  };
}

test('Initial laden + ältere Seiten nachladen ohne Duplikate', async () => {
  const api = fakeApi(230);
  const store = createMessageStore(api);
  await store.loadInitial(CH);
  assert.equal(store.get(CH).messages.length, 100);
  assert.equal(await store.loadOlder(CH), 100);
  assert.equal(await store.loadOlder(CH), 30);
  assert.equal(store.get(CH).hasMore, false);
  assert.equal(await store.loadOlder(CH), 0, 'kein weiterer Request, wenn nichts mehr da ist');
  const ids = store.get(CH).messages.map((m) => m.id);
  assert.equal(new Set(ids).size, 230);
  assert.equal(api.calls.length, 3);
});

test('Optimistisch: pending erscheint sofort, Gateway-Echo ersetzt es (keine Doppelung)', async () => {
  const store = createMessageStore(fakeApi(3));
  await store.loadInitial(CH);
  store.addPending(CH, { id: 'pending-n1', nonce: 'n1', channelId: CH, content: 'Hallo', author: { id: 'bot' }, createdTimestamp: 99 });
  assert.equal(store.get(CH).messages.at(-1).pending, true);
  // Gateway-Event kommt VOR der REST-Antwort an:
  store.upsertConfirmed(msg(50, { nonce: 'n1', content: 'Hallo' }));
  // REST-Antwort kommt danach mit derselben Nachricht:
  store.upsertConfirmed(msg(50, { nonce: 'n1', content: 'Hallo' }));
  const list = store.get(CH).messages;
  assert.equal(list.filter((m) => m.content === 'Hallo').length, 1);
  assert.equal(list.some((m) => m.pending), false);
});

test('Fehlgeschlagenes Senden bleibt sichtbar (failed) und kann verworfen werden', async () => {
  const store = createMessageStore(fakeApi(1));
  await store.loadInitial(CH);
  store.addPending(CH, { id: 'pending-n2', nonce: 'n2', channelId: CH, content: 'x', author: { id: 'bot' } });
  store.markFailed(CH, 'n2', { message: 'Dem Bot fehlt eine Berechtigung.' });
  assert.equal(store.get(CH).messages.at(-1).failed, true);
  store.discardLocal(CH, 'n2');
  assert.equal(store.get(CH).messages.length, 1);
});

test('Live-Nachrichten bleiben nach ID sortiert, pending immer am Ende', async () => {
  const store = createMessageStore(fakeApi(2));
  await store.loadInitial(CH);
  store.addPending(CH, { id: 'pending-n3', nonce: 'n3', channelId: CH, content: 'p', author: { id: 'bot' } });
  store.upsertConfirmed(msg(10));
  store.upsertConfirmed(msg(5));
  const list = store.get(CH).messages;
  assert.deepEqual(list.map((m) => m.content), ['m0', 'm1', 'm5', 'm10', 'p']);
});

test('Nur Abonnenten des betroffenen Kanals werden benachrichtigt', async () => {
  const store = createMessageStore(fakeApi(1));
  await store.loadInitial(CH);
  let a = 0;
  let b = 0;
  store.subscribe(CH, () => a++);
  store.subscribe('444444444444444499', () => b++);
  store.upsertConfirmed(msg(7));
  assert.equal(a, 1);
  assert.equal(b, 0);
});

test('Ladefehler → status error mit deutscher Meldung', async () => {
  const store = createMessageStore({
    async getMessages() {
      const e = new Error('Kein Zugriff auf diesen Kanal.');
      e.hint = 'Rechte prüfen';
      throw e;
    },
  });
  await store.loadInitial(CH);
  assert.equal(store.get(CH).status, 'error');
  assert.equal(store.get(CH).error.message, 'Kein Zugriff auf diesen Kanal.');
});
