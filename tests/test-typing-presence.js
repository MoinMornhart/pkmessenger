'use strict';

// Issue #1 (18:05): Tippanzeige wie Discord, Online-Status live und auch im Privatchat
const test = require('node:test');
const assert = require('node:assert/strict');
const { typingText, bestStatus } = require('../src/shared/typing');
const { readyService, Events, GUILD_ID } = require('./helpers/fake-discord');

test('Tippanzeige: bis 3 Namen, dann Anzahl', () => {
  assert.equal(typingText([]), '');
  assert.equal(typingText(['Anna']), 'Anna schreibt …');
  assert.equal(typingText(['Anna', 'Bernd']), 'Anna und Bernd schreiben …');
  assert.equal(typingText(['Anna', 'Bernd', 'Chiara']), 'Anna, Bernd und Chiara schreiben …');
  assert.equal(typingText(['A', 'B', 'C', 'D', 'E']), '5 Personen schreiben …');
});

test('Bester Status über alle Server', () => {
  assert.equal(bestStatus(['offline', 'idle', null]), 'idle');
  assert.equal(bestStatus(['dnd', 'online']), 'online');
  assert.equal(bestStatus([null, null]), null);
});

test('Status-Ereignis live, auch ohne gemeinsamen Kanal (Privatchat)', async () => {
  let on = true;
  const { service, world, events } = await readyService({ presence: { get: () => on, set: (v) => (on = v) } });
  world.addMember('555555555555555551', 'SimPell');
  world.guild.presences = { cache: new Map([['555555555555555551', { status: 'online' }]]) };
  world.client.emit(Events.PresenceUpdate, null, { userId: '555555555555555551', status: 'online' });
  const ev = events.filter((e) => e.type === 'presence').at(-1);
  assert.deepEqual(ev.payload, { userId: '555555555555555551', status: 'online' });
  const p = await service.getUserProfile({ userId: '555555555555555551' });
  assert.equal(p.status, 'online');
  on = false;
  world.client.emit(Events.PresenceUpdate, null, { userId: '555555555555555551', status: 'idle' });
  assert.equal(events.filter((e) => e.type === 'presence').length, 1); // ausgeschaltet → keine Ereignisse
  assert.equal(GUILD_ID.length > 0, true);
});
