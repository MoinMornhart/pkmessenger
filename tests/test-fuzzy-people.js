'use strict';

// Issue #1: unscharfe Namenssuche überall, Personen über alle Server (auch für @ im Privatchat), Profile
const test = require('node:test');
const assert = require('node:assert/strict');
const { fuzzyScore, fuzzyFilter, normalize } = require('../src/shared/fuzzy');
const { readyService, GUILD_ID } = require('./helpers/fake-discord');
const { validators } = require('../src/main/validate');

test('Normalisieren: Groß/klein, Umlaute, Akzente, Zahlen-Ersatz, Sonderzeichen', () => {
  assert.equal(normalize('MöRN_Härt'), 'morn hart');
  assert.equal(normalize('Straße'), 'strasse');
  assert.equal(normalize('M0inM0rnhart'), 'moinmornhart');
  assert.equal(normalize('José'), 'jose');
});

test('Treffer: genau > Anfang > Wortanfang > enthält > Abkürzung > Tippfehler', () => {
  const s = (q) => fuzzyScore(q, 'MoinMornhart');
  assert.equal(s('moinmornhart'), 100);
  assert.equal(s('MOIN'), 90);
  assert.equal(s('mornh'), 70);
  assert.ok(s('mmh') >= 30 && s('mmh') < 70); // Buchstaben in Reihenfolge
  assert.equal(s('moinmornhrat'), 40); // Tippfehler (vertauscht)
  assert.equal(s('Mainmornhart'), 40); // ein Buchstabe falsch
  assert.equal(fuzzyScore('jonim', 'Joni Moni'), 90);
  assert.equal(fuzzyScore('moni', 'Joni Moni'), 80); // Wortanfang
  assert.equal(s('xyz'), -1);
  assert.equal(s('an'), -1); // 2 Buchstaben: keine Abkürzungstreffer (zu viel Rauschen)
});

test('Filter sortiert nach Qualität und nutzt mehrere Namen', () => {
  const people = [
    { d: 'Bernd', u: 'bernd99' },
    { d: 'Anna', u: 'annabanana' },
    { d: 'Jonas', u: 'jonimoni09' },
  ];
  const r = (q) => fuzzyFilter(people, q, (p) => [p.d, p.u]).map((p) => p.d);
  assert.deepEqual(r('JONI'), ['Jonas']); // über den Benutzernamen
  assert.deepEqual(r('ann'), ['Anna']);
  assert.deepEqual(r('n'), ['Bernd', 'Anna', 'Jonas']); // alle enthalten „n“
  assert.deepEqual(r(''), ['Bernd', 'Anna', 'Jonas']);
});

test('Personensuche über alle Server: unscharf, ohne den Bot selbst, mit Servername', async () => {
  const { service, world } = await readyService();
  world.addMember('555555555555555551', 'MoinMornhart');
  world.addMember('555555555555555552', 'JoniMoni');
  const res = await service.searchPeople(validators.searchPeople({ query: 'mornhrt' }));
  assert.deepEqual(res.map((p) => p.display), ['MoinMornhart']);
  assert.ok(res[0].guilds.length >= 1);
  const all = await service.searchPeople(validators.searchPeople({ query: '' }));
  assert.ok(!all.some((p) => p.id === world.client.user.id));
  assert.throws(() => validators.searchPeople({ query: 'x'.repeat(40) }), /Suchanfrage/);
});

test('Profil: Name, Benutzername, Server-Infos', async () => {
  const { service, world } = await readyService();
  world.addMember('555555555555555551', 'MoinMornhart');
  const p = await service.getUserProfile(validators.userProfile({ userId: '555555555555555551', guildId: GUILD_ID }));
  assert.equal(p.name, 'MoinMornhart');
  assert.equal(p.username, 'moinmornhart');
  assert.equal(p.isSelf, false);
  assert.ok(Array.isArray(p.roles));
  assert.ok(p.mutualGuilds.length >= 1);
  assert.deepEqual(validators.userProfile({ userId: '555555555555555551' }), { userId: '555555555555555551', guildId: null });
});
