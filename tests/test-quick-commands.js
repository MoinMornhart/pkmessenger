'use strict';

// Schnellbefehle im Eingabefeld (Issue #1: „es funktionieren keine Befehle“)
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCommand, suggestCommands } = require('../src/shared/quick-commands');

const run = (text, rnd) => {
  const p = parseCommand(text);
  return p ? p.command.run(p.args, rnd) : null;
};

test('Textbefehle wie im Discord-Client', () => {
  // Drei Backslashes wie bei Discords /shrug: „\\“ = sichtbarer Backslash, „\_“ = normaler Unterstrich
  const SHRUG = '¯' + '\\'.repeat(3) + '_(ツ)_/¯';
  assert.equal(run('/shrug').content, SHRUG);
  assert.equal(run('/shrug na gut').content, `na gut ${SHRUG}`);
  assert.equal(run('/tableflip').content, '(╯°□°)╯︵ ┻━┻');
  assert.equal(run('/me winkt').content, '_winkt_');
  assert.equal(run('/spoiler Ende').content, '||Ende||');
  assert.equal(run('/fett wichtig').content, '**wichtig**');
  assert.equal(run('/code a\nb').content, '```\na\nb\n```');
  assert.equal(run('/zitat a\nb').content, '> a\n> b');
  assert.match(run('/me').error, /Text angeben/);
});

test('Würfel und Münze', () => {
  assert.equal(run('/würfel', () => 0).content, '🎲 1 (W6)');
  assert.equal(run('/würfel 20', () => 0.999).content, '🎲 20 (W20)');
  assert.equal(run('/würfel 1', () => 0).content, '🎲 1 (W6)'); // ungültig → 6 Seiten
  assert.equal(run('/münze', () => 0.2).content, '🪙 Kopf');
});

test('Aktionen öffnen Dialoge; Unbekanntes bleibt normaler Text', () => {
  assert.deepEqual(run('/umfrage'), { action: 'poll' });
  assert.deepEqual(run('/embed'), { action: 'embed' });
  assert.deepEqual(run('/hilfe'), { action: 'help' });
  assert.equal(parseCommand('/gibtsnicht'), null);
  assert.equal(parseCommand('Pfad /home/anna'), null);
  assert.equal(parseCommand('/SHRUG').command.name, 'shrug'); // Groß/klein egal
});

test('Vorschläge beim Tippen des ersten Wortes', () => {
  assert.equal(suggestCommands('/ta', 3)[0].display, '/tableflip'); // erst „fängt so an“
  assert.ok(suggestCommands('/flip', 5).map((s) => s.display).includes('/unflip')); // dann „enthält“ (Issue #29)
  assert.equal(suggestCommands('/mü', 3)[0].instant, true); // /münze läuft sofort, kein zweites Enter
  assert.ok(suggestCommands('/', 1).length >= 10);
  assert.equal(suggestCommands('/shrug hallo', 12), null); // nach dem Leerzeichen: keine Liste mehr
  assert.equal(suggestCommands('hallo /sh', 9), null);
});

test('Unbekannte Befehle werden erkannt (Rückfrage statt still als Text senden, Issue #29)', () => {
  const { unknownCommand } = require('../src/shared/quick-commands');
  assert.equal(unknownCommand('/ping'), 'ping');
  assert.equal(unknownCommand('/play song'), 'play');
  assert.equal(unknownCommand('/shrug'), null);
  assert.equal(unknownCommand('hallo /ping'), null);
  assert.equal(unknownCommand('/ hallo'), null);
});
