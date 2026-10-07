'use strict';

// Systemnachrichten (Wunsch JoniMoni, Issue #1): Beitritte, Boosts, Pins, Threads, Umfrage-Ergebnisse …
// Discord liefert dafür oft KEINEN Text (content ist leer) – nur einen Nachrichtentyp. Hier wird daraus ein
// verständlicher deutscher Satz. Typ-Nummern laut docs.discord.com/developers/resources/message#message-object-message-types
// (geprüft gegen MessageType in discord.js 14.27.0).

// Typen, die normale Nachrichten sind (wie discord.js Message#system)
const NORMAL_TYPES = new Set([0, 19, 20, 23]);

const isSystemType = (type) => Number.isInteger(type) && !NORMAL_TYPES.has(type);

const BOOST_LEVEL = { 9: 1, 10: 2, 11: 3 };

function pollResultText(embeds) {
  const fields = Object.fromEntries((embeds?.[0]?.fields || []).map((f) => [f.name, f.value]));
  const q = fields.poll_question_text;
  const win = fields.victor_answer_text;
  const votes = Number(fields.victor_answer_votes);
  if (!q) return 'Eine Umfrage ist beendet.';
  if (!win) return `Umfrage „${q}“ ist beendet – ohne Gewinner.`;
  return `Umfrage „${q}“ ist beendet – Gewinner: ${win}${Number.isFinite(votes) ? ` (${votes} ${votes === 1 ? 'Stimme' : 'Stimmen'})` : ''}.`;
}

/**
 * @param {{ type:number, author?:{name?:string}, content?:string, mentions?:{users?:{name:string}[]}, embeds?:any[] }} m
 * @returns {{ icon: string, text: string } | null}  null = keine Systemnachricht
 */
function systemInfo(m) {
  const type = m?.type;
  if (!isSystemType(type)) return null;
  const a = m.author?.name || 'Jemand';
  const c = typeof m.content === 'string' ? m.content.trim() : '';
  const other = m.mentions?.users?.[0]?.name || 'jemanden';
  switch (type) {
    case 1:
      return { icon: '➕', text: `${a} hat ${other} hinzugefügt.` };
    case 2:
      return { icon: '➖', text: other === 'jemanden' || other === a ? `${a} ist gegangen.` : `${a} hat ${other} entfernt.` };
    case 3:
      return { icon: '📞', text: `${a} hat einen Anruf gestartet.` };
    case 4:
      return { icon: '✏️', text: c ? `${a} hat den Namen geändert in „${c}“.` : `${a} hat den Namen geändert.` };
    case 5:
      return { icon: '🖼', text: `${a} hat das Bild geändert.` };
    case 6:
      return { icon: '📌', text: `${a} hat eine Nachricht angeheftet.` };
    case 7:
      return { icon: '👋', text: `${a} ist dem Server beigetreten. Willkommen!` };
    case 8: {
      const n = Number(c);
      return { icon: '🚀', text: n > 1 ? `${a} hat den Server ${n}× geboostet!` : `${a} hat den Server geboostet!` };
    }
    case 9:
    case 10:
    case 11:
      return { icon: '🚀', text: `${a} hat den Server geboostet – Stufe ${BOOST_LEVEL[type]} erreicht!` };
    case 12:
      return { icon: '📣', text: c ? `${a} folgt jetzt diesem Kanal in „${c}“.` : `${a} folgt jetzt diesem Kanal.` };
    case 14:
    case 15:
    case 16:
    case 17:
      return { icon: 'ℹ️', text: 'Hinweis von Discord zur Server-Entdeckung.' };
    case 18:
      return { icon: '🧵', text: c ? `${a} hat den Thread „${c}“ gestartet.` : `${a} hat einen Thread gestartet.` };
    case 21:
      return { icon: '🧵', text: 'Start des Threads (Originalnachricht im Kanal).' };
    case 22:
      return { icon: '💌', text: 'Tipp: Lade Freunde auf den Server ein.' };
    case 24:
      return { icon: '🛡', text: `AutoMod hat eine Nachricht von ${a} blockiert.` };
    case 25:
      return { icon: '⭐', text: `${a} hat ein Server-Abo abgeschlossen.` };
    case 26:
      return { icon: '⭐', text: 'Hinweis einer App auf Premium-Funktionen.' };
    case 27:
      return { icon: '🎙', text: c ? `${a} hat die Bühne „${c}“ gestartet.` : `${a} hat eine Bühne gestartet.` };
    case 28:
      return { icon: '🎙', text: `${a} hat die Bühne beendet.` };
    case 29:
      return { icon: '🎙', text: `${a} spricht jetzt auf der Bühne.` };
    case 30:
      return { icon: '✋', text: `${a} möchte auf der Bühne sprechen.` };
    case 31:
      return { icon: '🎙', text: c ? `${a} hat das Bühnenthema geändert: „${c}“.` : `${a} hat das Bühnenthema geändert.` };
    case 32:
      return { icon: '⭐', text: `${a} hat ein App-Abo abgeschlossen.` };
    case 36:
      return { icon: '🛡', text: `${a} hat den Sicherheitsmodus eingeschaltet.` };
    case 37:
      return { icon: '🛡', text: `${a} hat den Sicherheitsmodus ausgeschaltet.` };
    case 38:
      return { icon: '🚨', text: `${a} hat einen Raid gemeldet.` };
    case 39:
      return { icon: '✅', text: `${a} hat Entwarnung gegeben (Fehlalarm).` };
    case 44:
      return { icon: '🛒', text: `${a} hat etwas gekauft.` };
    case 46:
      return { icon: '📊', text: pollResultText(m.embeds) };
    default:
      return { icon: 'ℹ️', text: c ? `Systemnachricht: ${c.slice(0, 200)}` : 'Systemnachricht von Discord.' };
  }
}

module.exports = { isSystemType, systemInfo, NORMAL_TYPES };
