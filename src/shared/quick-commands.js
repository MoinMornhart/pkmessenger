'use strict';

// Schnellbefehle im Eingabefeld (Issue #1: „es funktionieren keine Befehle“).
// Wie im Discord-Client: „/“ tippen → Liste. Laufen komplett in der App; gesendet wird nur das Ergebnis (als Bot).
// Hinweis: Slash-Befehle ANDERER Bots kann ein Bot laut Discord nicht auslösen.
const COMMANDS = [
  // Wie Discords /shrug: „\\“ = sichtbarer Backslash, „\_“ = normaler Unterstrich (sonst wäre _(ツ)_ kursiv)
  { name: 'shrug', args: '[Text]', desc: 'Hängt ¯\\_(ツ)_/¯ an', run: (a) => ({ content: `${a} ¯\\\\\\_(ツ)_/¯`.trim() }) },
  { name: 'tableflip', args: '[Text]', desc: 'Tisch umwerfen (╯°□°)╯︵ ┻━┻', run: (a) => ({ content: `${a} (╯°□°)╯︵ ┻━┻`.trim() }) },
  { name: 'unflip', args: '[Text]', desc: 'Tisch wieder hinstellen ┬─┬ノ( º _ ºノ)', run: (a) => ({ content: `${a} ┬─┬ノ( º _ ºノ)`.trim() }) },
  { name: 'lenny', args: '', desc: '( ͡° ͜ʖ ͡°)', run: (a) => ({ content: `${a} ( ͡° ͜ʖ ͡°)`.trim() }) },
  { name: 'me', args: 'Text', desc: 'Text kursiv, wie eine Handlung', run: (a) => (a ? { content: `_${a}_` } : { error: 'Bitte einen Text angeben: /me winkt allen zu' }) },
  { name: 'spoiler', args: 'Text', desc: 'Text verdeckt (erst sichtbar nach Klick)', run: (a) => (a ? { content: `||${a}||` } : { error: 'Bitte einen Text angeben: /spoiler Das Ende ist …' }) },
  { name: 'fett', args: 'Text', desc: 'Text fett', run: (a) => (a ? { content: `**${a}**` } : { error: 'Bitte einen Text angeben.' }) },
  { name: 'code', args: 'Text', desc: 'Text als Code', run: (a) => (a ? { content: a.includes('\n') ? `\`\`\`\n${a}\n\`\`\`` : `\`${a}\`` } : { error: 'Bitte einen Text angeben.' }) },
  { name: 'zitat', args: 'Text', desc: 'Text als Zitat', run: (a) => (a ? { content: a.split('\n').map((l) => `> ${l}`).join('\n') } : { error: 'Bitte einen Text angeben.' }) },
  { name: 'würfel', args: '[Seiten]', desc: 'Würfelt (Standard: 6 Seiten)', run: (a, rnd = Math.random) => {
    const n = Number.parseInt(a, 10);
    const sides = Number.isInteger(n) && n >= 2 && n <= 1000 ? n : 6;
    return { content: `🎲 ${1 + Math.floor(rnd() * sides)} (W${sides})` };
  } },
  { name: 'münze', args: '', desc: 'Kopf oder Zahl', run: (_a, rnd = Math.random) => ({ content: `🪙 ${rnd() < 0.5 ? 'Kopf' : 'Zahl'}` }) },
  { name: 'umfrage', args: '', desc: 'Umfrage erstellen', run: () => ({ action: 'poll' }) },
  { name: 'embed', args: '', desc: 'Embed-Baukasten öffnen', run: () => ({ action: 'embed' }) },
  { name: 'hilfe', args: '', desc: 'Alle Befehle anzeigen', run: () => ({ action: 'help' }) },
];

/** „/shrug hallo“ → { command, args } – nur für bekannte Befehle, sonst null (dann ganz normal als Text senden). */
function parseCommand(text) {
  const m = /^\/([\p{L}\d_-]+)(?:[ \t]+([\s\S]*))?$/u.exec(String(text ?? '').trim());
  if (!m) return null;
  const command = COMMANDS.find((c) => c.name === m[1].toLowerCase());
  return command ? { command, args: (m[2] || '').trim() } : null;
}

/** Vorschläge, solange das erste Wort getippt wird („/sh“ → shrug). */
function suggestCommands(text, caret) {
  const before = String(text ?? '').slice(0, caret);
  const m = /^\/([\p{L}\d_-]*)$/u.exec(before);
  if (!m) return null;
  const q = m[1].toLowerCase();
  return COMMANDS.filter((c) => c.name.startsWith(q)).map((c) => ({ kind: 'command', id: c.name, display: `/${c.name}`, sub: c.args ? `${c.args} – ${c.desc}` : c.desc }));
}

module.exports = { COMMANDS, parseCommand, suggestCommands };
