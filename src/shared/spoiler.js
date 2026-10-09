'use strict';

// #93: Spoiler, die eine Erwähnung umschließen (z. B. ||<@123>||), müssen ZUERST erkannt werden – sonst trennt die
// Erwähnungs-Zerlegung die Erwähnung heraus und das ||…|| zerbricht (dann erscheint der rohe Pipe-Text wie im Bild).
// Reine Spoiler ohne Erwähnung bleiben der normalen Inline-Darstellung überlassen (damit z. B. **||x||** heil bleibt).
const SPOILER_WITH_MENTION = /\|\|((?:(?!\|\|)[\s\S])*?(?:<@!?\d{17,20}>|<@&\d{17,20}>|<#\d{17,20}>|@(?:everyone|here)\b)(?:(?!\|\|)[\s\S])*?)\|\|/g;

/**
 * Zerlegt einen Nachrichtentext in Abschnitte: { text, start, spoiler? }.
 * `spoiler: true` markiert einen Spoiler, der mindestens eine Erwähnung enthält (Inhalt ohne die ||-Zeichen).
 */
function splitSpoilerParts(content) {
  const text = typeof content === 'string' ? content : '';
  const parts = [];
  const re = new RegExp(SPOILER_WITH_MENTION.source, 'g');
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), start: last });
    parts.push({ text: m[1], start: m.index, spoiler: true });
    last = m.index + m[0].length;
  }
  if (last < text.length || parts.length === 0) parts.push({ text: text.slice(last), start: last });
  return parts;
}

module.exports = { splitSpoilerParts, SPOILER_WITH_MENTION };
