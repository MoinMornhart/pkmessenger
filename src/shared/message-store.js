'use strict';

const { compareSnowflakes } = require('./snowflake');
const { MESSAGES_PER_FETCH_MAX } = require('./limits');

const MAX_CACHED_PER_CHANNEL = 5000;
const EMPTY = Object.freeze({ status: 'idle', messages: [], hasMore: true, loadingOlder: false, error: null, version: 0 });

/**
 * Nachrichten-Cache pro Kanal mit Abo-Mechanismus (für useSyncExternalStore).
 * Nur Abonnenten des betroffenen Kanals werden benachrichtigt → keine Re-Render-Stürme bei Gateway-Events.
 * messages = bestätigte Nachrichten (nach ID sortiert) + danach optimistische (pending/failed).
 */
function createMessageStore(api) {
  const channels = new Map();
  const listeners = new Map();

  const get = (id) => channels.get(id) || EMPTY;

  function set(id, patch) {
    const prev = get(id);
    const next = { ...prev, ...patch, version: prev.version + 1 };
    channels.set(id, next);
    const ls = listeners.get(id);
    if (ls) for (const l of ls) l();
    return next;
  }

  function subscribe(id, listener) {
    if (!listeners.has(id)) listeners.set(id, new Set());
    listeners.get(id).add(listener);
    return () => listeners.get(id)?.delete(listener);
  }

  const isLocal = (m) => m.pending || m.failed;

  function split(messages) {
    return [messages.filter((m) => !isLocal(m)), messages.filter(isLocal)];
  }

  function mergeConfirmed(existing, incoming) {
    const byId = new Map(existing.map((m) => [m.id, m]));
    for (const m of incoming) byId.set(m.id, m);
    let merged = [...byId.values()].sort((a, b) => compareSnowflakes(a.id, b.id));
    if (merged.length > MAX_CACHED_PER_CHANNEL) merged = merged.slice(merged.length - MAX_CACHED_PER_CHANNEL);
    return merged;
  }

  async function loadInitial(id) {
    const s = get(id);
    if (s.status === 'loading' || s.status === 'ready') return s;
    set(id, { status: 'loading', error: null });
    try {
      const page = await api.getMessages({ channelId: id, limit: MESSAGES_PER_FETCH_MAX });
      const [confirmed, local] = split(get(id).messages); // live-Nachrichten, die während des Ladens kamen
      return set(id, { status: 'ready', messages: [...mergeConfirmed(page.messages, confirmed), ...local], hasMore: page.hasMore });
    } catch (err) {
      return set(id, { status: 'error', error: { message: err.message, hint: err.hint, code: err.code } });
    }
  }

  async function loadOlder(id) {
    const s = get(id);
    if (s.status !== 'ready' || s.loadingOlder || !s.hasMore) return 0;
    const [confirmed] = split(s.messages);
    if (confirmed.length === 0) return 0;
    set(id, { loadingOlder: true });
    try {
      const page = await api.getMessages({ channelId: id, before: confirmed[0].id, limit: MESSAGES_PER_FETCH_MAX });
      const [nowConfirmed, local] = split(get(id).messages);
      const merged = mergeConfirmed(nowConfirmed, page.messages);
      set(id, { messages: [...merged, ...local], hasMore: page.hasMore && page.messages.length > 0, loadingOlder: false });
      return page.messages.length;
    } catch (err) {
      set(id, { loadingOlder: false, error: { message: err.message, hint: err.hint, code: err.code } });
      return 0;
    }
  }

  // Bestätigte Nachricht einfügen; ersetzt die optimistische Version mit gleicher Nonce.
  function upsertConfirmed(msg) {
    if (!msg?.channelId || !msg.id) return false;
    const s = get(msg.channelId);
    if (s.status !== 'ready') return false; // Kanal noch nie geöffnet → wird beim Öffnen frisch geladen
    const [confirmed, local] = split(s.messages);
    const remainingLocal = msg.nonce ? local.filter((m) => m.nonce !== msg.nonce) : local;
    set(msg.channelId, { messages: [...mergeConfirmed(confirmed, [msg]), ...remainingLocal] });
    return true;
  }

  function remove({ id, channelId } = {}) {
    if (!id || !channelId) return;
    const s = get(channelId);
    if (!s.messages.some((m) => m.id === id)) return;
    set(channelId, { messages: s.messages.filter((m) => m.id !== id) });
  }

  function addPending(channelId, pending) {
    const s = get(channelId);
    set(channelId, { messages: [...s.messages, { ...pending, pending: true, failed: false }] });
  }

  function markFailed(channelId, nonce, error) {
    const s = get(channelId);
    set(channelId, { messages: s.messages.map((m) => (m.nonce === nonce && isLocal(m) ? { ...m, pending: false, failed: true, error } : m)) });
  }

  function discardLocal(channelId, nonce) {
    const s = get(channelId);
    set(channelId, { messages: s.messages.filter((m) => !(isLocal(m) && m.nonce === nonce)) });
  }

  /**
   * Jemand heißt jetzt anders (JoniMoni #53): Autor-Namen und Erwähnungen in allen geladenen Chats ersetzen.
   * Nur wo bisher der alte Name stand (ein Spitzname auf einem anderen Server bleibt unberührt); guildId grenzt
   * Spitznamen auf ihren Server ein.
   */
  function renameUser({ userId, name, oldName, guildId = null } = {}) {
    if (!userId || !name) return 0;
    let changedChannels = 0;
    for (const [id, s] of channels) {
      let hit = false;
      const fix = (n) => !oldName || n === oldName;
      const messages = s.messages.map((m) => {
        if (guildId && m.guildId && m.guildId !== guildId) return m;
        let next = m;
        if (m.author?.id === userId && m.author.name !== name && fix(m.author.name)) next = { ...next, author: { ...m.author, name } };
        const users = m.mentions?.users;
        if (users?.some((u) => u.id === userId && u.name !== name && fix(u.name))) next = { ...next, mentions: { ...m.mentions, users: users.map((u) => (u.id === userId && fix(u.name) ? { ...u, name } : u)) } };
        if (m.reference?.authorName && oldName && m.reference.authorName === oldName && m.author) next = { ...next, reference: { ...next.reference, authorName: name } };
        if (next !== m) hit = true;
        return next;
      });
      if (hit) {
        set(id, { messages });
        changedChannels++;
      }
    }
    return changedChannels;
  }

  function invalidate(channelId) {
    channels.delete(channelId);
  }

  return { get, subscribe, loadInitial, loadOlder, upsertConfirmed, remove, addPending, markFailed, discardLocal, invalidate, renameUser };
}

module.exports = { createMessageStore, EMPTY };
