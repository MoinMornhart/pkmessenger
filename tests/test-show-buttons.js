'use strict';

// #86: Nachrichten-Knöpfe/Auswahlmenüs (components) werden NUR zur Ansicht serialisiert.
// Ein Bot kann fremde Knöpfe nicht drücken (Discord-Grenze) – darum reine Anzeige; Link-Knöpfe tragen ihre URL.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readyService, makeMessage } = require('./helpers/fake-discord');

function botMessage(world, id, components) {
  const ch = world.channels.allgemein;
  const m = makeMessage({ id, channel: ch, author: world.makeUser('555555555555555555', 'fremderbot'), content: 'Bitte verifizieren' });
  if (components) m.components = components;
  return m;
}

test('#86 Knöpfe, Link-Knopf und Auswahlmenü werden korrekt als Ansicht serialisiert', async () => {
  const { service, world } = await readyService();
  const m = botMessage(world, '1000000000000000200', [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: 'Verifizieren', customId: 'verify', disabled: false },
        { type: 2, style: 5, url: 'https://example.com/', label: 'Website', emoji: { name: '🔗' } },
        { type: 2, style: 4, label: 'Ablehnen', customId: 'no', disabled: true },
      ],
    },
    { type: 1, components: [{ type: 3, placeholder: 'Wähle eine Rolle …' }] },
  ]);
  const s = service.serializeMessage(m);
  assert.equal(s.components.length, 2);
  // normaler Knopf: keine URL, Stil erhalten
  assert.deepEqual(s.components[0].components[0], { kind: 'button', label: 'Verifizieren', style: 3, url: null, emoji: null, emojiUrl: null, disabled: false });
  // Link-Knopf: URL + Emoji erhalten
  assert.deepEqual(s.components[0].components[1], { kind: 'button', label: 'Website', style: 5, url: 'https://example.com/', emoji: '🔗', emojiUrl: null, disabled: false });
  // deaktivierter Knopf
  assert.equal(s.components[0].components[2].disabled, true);
  // Auswahlmenü
  assert.deepEqual(s.components[1].components[0], { kind: 'select', placeholder: 'Wähle eine Rolle …', disabled: false });
});

test('#86 Nachricht ohne Knöpfe → leeres Array', async () => {
  const { service, world } = await readyService();
  const s = service.serializeMessage(botMessage(world, '1000000000000000201', null));
  assert.deepEqual(s.components, []);
});

test('#86 kaputte/unbekannte Komponenten werden ignoriert (null-sicher)', async () => {
  const { service, world } = await readyService();
  const m = botMessage(world, '1000000000000000202', [
    { type: 1, components: [{ type: 99 }, null, { type: 2, label: 'Ok' }] },
    { type: 1, components: [] }, // leere Reihe fällt weg
  ]);
  const s = service.serializeMessage(m);
  assert.equal(s.components.length, 1);
  assert.equal(s.components[0].components.length, 1);
  assert.equal(s.components[0].components[0].label, 'Ok');
  assert.equal(s.components[0].components[0].style, 1); // Standard primary
});

test('#129 Knöpfe nur mit Emoji (Musik-Bots): eigenes Emoji als Bild, kein „Knopf“-Text nötig', async () => {
  const { service, world } = await readyService();
  const m = botMessage(world, '1000000000000000203', [
    { type: 1, components: [{ type: 2, style: 2, customId: 'pause', emoji: { name: 'pause', id: '1234567890123456789' } }, { type: 2, style: 2, customId: 'skip', emoji: { name: '⏭️' } }, { type: 2, style: 2, emoji: { name: 'x', id: '../böse' } }] },
  ]);
  const [a, b, c] = service.serializeMessage(m).components[0].components;
  assert.equal(a.label, '');
  assert.equal(a.emojiUrl, 'https://cdn.discordapp.com/emojis/1234567890123456789.png?size=64');
  assert.equal(b.emoji, '⏭️');
  assert.equal(b.emojiUrl, null);
  assert.equal(c.emojiUrl, null); // nur echte IDs
});
