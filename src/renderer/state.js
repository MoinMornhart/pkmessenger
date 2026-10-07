import { useSyncExternalStore, createContext } from 'react';
import { createMessageStore, EMPTY } from '../shared/message-store';
import { api } from './api';

export const messageStore = createMessageStore(api);

const noop = () => () => {};

// Abonniert genau EINEN Kanal – andere Kanäle lösen hier kein Re-Rendering aus.
export function useChannelMessages(channelId) {
  return useSyncExternalStore(
    channelId ? (cb) => messageStore.subscribe(channelId, cb) : noop,
    () => (channelId ? messageStore.get(channelId) : EMPTY),
  );
}

// Kleiner Event-Bus für Gateway-Events aus dem Main-Prozess.
const listeners = new Set();
export const bus = {
  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(type, payload) {
    for (const fn of listeners) fn(type, payload);
  },
};

// Navigation & Namensauflösung für Mention-Chips (#kanal anklicken etc.)
export const NavContext = createContext({ channelName: () => null, openChannel: () => {}, openExternal: () => {} });

// Aktionen an einer Nachricht (F7–F13) – per Context, damit die virtualisierte Liste nicht neu gebaut werden muss
export const MessageActionsContext = createContext(null);

// Häufige Reaktionen für die Schnellauswahl (F8)
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '👀', '✅'];

export function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-6);
}
