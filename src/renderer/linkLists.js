// Öffentliche Sperrlisten für den Link-Schutz (geladen vom Hauptprozess, täglich aktualisiert).
import { api, onEvent } from './api';

let lists = null; // { danger: Set, warn: Set }
let loading = null;
const listeners = new Set();

export function getLists() {
  return lists;
}

export function loadLists() {
  if (loading) return loading;
  loading = api
    .blocklistGet()
    .then((r) => {
      lists = { danger: new Set(r.danger || []), warn: new Set(r.warn || []) };
      for (const l of listeners) l(lists);
    })
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
  return loading;
}

export function onListsChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

onEvent((type) => type === 'blocklist' && loadLists());
