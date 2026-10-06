'use strict';

const { GROUPING_WINDOW_MS } = require('./limits');

function sameLocalDay(a, b) {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/**
 * Bereitet die Nachrichtenliste für die Anzeige vor:
 * - Datumstrenner, wenn ein neuer Tag beginnt
 * - "grouped" = Nachricht folgt demselben Autor innerhalb von 5 Minuten (ohne Kopfzeile anzeigen)
 * Eingabe aufsteigend sortiert (älteste zuerst).
 */
function buildRows(messages) {
  const rows = [];
  let prev = null;
  for (const msg of messages) {
    const newDay = !prev || !sameLocalDay(prev.createdTimestamp, msg.createdTimestamp);
    if (newDay) rows.push({ kind: 'day', key: `day-${msg.id}`, timestamp: msg.createdTimestamp });
    const grouped =
      !newDay &&
      prev &&
      prev.author.id === msg.author.id &&
      !msg.reference &&
      msg.createdTimestamp - prev.createdTimestamp < GROUPING_WINDOW_MS;
    rows.push({ kind: 'message', key: msg.nonce && msg.pending ? `n-${msg.nonce}` : msg.id, message: msg, grouped: Boolean(grouped) });
    prev = msg;
  }
  return rows;
}

module.exports = { buildRows, sameLocalDay };
