'use strict';

// F17 Sprachkanäle: Beitreten, Sprechen (Opus raus), Zuhören (Opus rein), Rechte, Aufräumen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createVoiceManager, MAX_OPUS_PACKET } = require('../src/main/voice');
const { createFakeVoiceLib } = require('./helpers/fake-voice');
const { readyService, GUILD_ID, P } = require('./helpers/fake-discord');

const VC = '444444444444444405'; // "Sprache" aus der Fake-Welt

function setup({ canSpeak = true, readyOnJoin = true } = {}) {
  const lib = createFakeVoiceLib({ readyOnJoin });
  const events = [];
  const audio = [];
  const vm = createVoiceManager({
    voiceLib: lib,
    getVoiceTarget: () => ({ guild: { voiceAdapterCreator: 'ADAPTER' }, channel: {}, canSpeak, botId: 'BOT', channelName: 'Sprache' }),
    emit: (t, p) => events.push({ t, p }),
    sendAudio: (userId, data) => audio.push({ userId, data }),
    joinTimeoutMs: 50,
  });
  return { vm, lib, events, audio };
}

test('Beitreten: DAVE an, nicht taub, Status "connected"', async () => {
  const { vm, lib, events } = setup();
  const st = await vm.join({ guildId: GUILD_ID, channelId: VC });
  assert.equal(st.state, 'connected');
  assert.equal(st.channelName, 'Sprache');
  const cfg = lib.joins[0];
  assert.equal(cfg.daveEncryption, true);
  assert.equal(cfg.selfDeaf, false);
  assert.equal(cfg.selfMute, false);
  assert.equal(cfg.adapterCreator, 'ADAPTER');
  assert.equal(lib.connections[0].subscribed, lib.players[0]);
  assert.deepEqual(events.map((e) => e.p.state), ['connecting', 'connected']);
});

test('Beitritt scheitert (Timeout) → deutsche Meldung, alles aufgeräumt', async () => {
  const { vm, lib } = setup({ readyOnJoin: false });
  await assert.rejects(vm.join({ guildId: GUILD_ID, channelId: VC }), { code: 'VOICE_TIMEOUT' });
  assert.equal(vm.getState().state, 'error');
  assert.match(vm.getState().error.hint, /Verbinden/);
  assert.equal(lib.connections[0].state.status, 'destroyed');
});

test('Sprechen: nur bei Mikro an, Pakete landen als Opus-Strom im Player', async () => {
  const { vm, lib } = setup();
  await vm.join({ guildId: GUILD_ID, channelId: VC });
  const pkt = new Uint8Array([0xfc, 0xff, 0xfe]);
  assert.equal(vm.pushPacket(pkt), false, 'Mikro aus → verwerfen');
  vm.setTalking(true);
  const resource = lib.players[0].played[0];
  assert.equal(resource.opts.inputType, 'opus');
  const got = [];
  resource.stream.on('data', (d) => got.push(d));
  assert.equal(vm.pushPacket(pkt), true);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([...got[0]], [0xfc, 0xff, 0xfe]);
  vm.setTalking(false);
  assert.equal(vm.pushPacket(pkt), false, 'nach Mikro aus wieder verwerfen');
});

test('Kaputte/zu große Pakete werden verworfen', async () => {
  const { vm } = setup();
  await vm.join({ guildId: GUILD_ID, channelId: VC });
  vm.setTalking(true);
  assert.equal(vm.pushPacket(new Uint8Array(0)), false);
  assert.equal(vm.pushPacket(new Uint8Array(MAX_OPUS_PACKET + 1)), false);
  assert.equal(vm.pushPacket('kein Buffer'), false);
});

test('Ohne Sprechen-Recht: Mikro lässt sich nicht einschalten, Bot tritt stumm bei', async () => {
  const { vm, lib } = setup({ canSpeak: false });
  await vm.join({ guildId: GUILD_ID, channelId: VC });
  assert.equal(lib.joins[0].selfMute, true);
  assert.throws(() => vm.setTalking(true), { code: 'MISSING_PERMISSION' });
});

test('Zuhören: Sprecher werden abonniert (nicht der Bot selbst), Pakete gehen an den Renderer', async () => {
  const { vm, lib, audio, events } = setup();
  await vm.join({ guildId: GUILD_ID, channelId: VC });
  const conn = lib.connections[0];
  conn.receiver.speaking.emit('start', 'BOT');
  conn.receiver.speaking.emit('start', 'U1');
  conn.receiver.speaking.emit('start', 'U1'); // doppelt → nur ein Abo
  assert.deepEqual(conn.receiver.subscriptions.map((s) => s.userId), ['U1']);
  assert.equal(conn.receiver.subscriptions[0].opts.end.behavior, 1, 'endet nach Stille');
  conn.receiver.subscriptions[0].stream.write(Buffer.from([1, 2, 3]));
  await new Promise((r) => setImmediate(r));
  assert.equal(audio.length, 1);
  assert.equal(audio[0].userId, 'U1');
  assert.ok(events.some((e) => e.t === 'voice:speaking' && e.p.userId === 'U1' && e.p.speaking));
});

test('Ton aus: keine Abos, keine Pakete, Bot meldet sich taub', async () => {
  const { vm, lib, audio } = setup();
  await vm.join({ guildId: GUILD_ID, channelId: VC });
  vm.setListening(false);
  const conn = lib.connections[0];
  assert.deepEqual(conn.rejoins.at(-1), { channelId: VC, selfDeaf: true, selfMute: false });
  conn.receiver.speaking.emit('start', 'U2');
  assert.equal(conn.receiver.subscriptions.length, 0);
  assert.equal(audio.length, 0);
});

test('Auflegen räumt alles auf; Aktionen danach → deutsche Fehlermeldung', async () => {
  const { vm, lib } = setup();
  await vm.join({ guildId: GUILD_ID, channelId: VC });
  vm.setTalking(true);
  assert.equal(vm.leave().state, 'idle');
  assert.equal(lib.connections[0].state.status, 'destroyed');
  assert.throws(() => vm.setTalking(true), { code: 'VOICE_NOT_CONNECTED' });
  assert.equal(vm.pushPacket(new Uint8Array([1])), false);
});

test('Wechsel in einen anderen Kanal beendet die alte Verbindung', async () => {
  const { vm, lib } = setup();
  await vm.join({ guildId: GUILD_ID, channelId: VC });
  await vm.join({ guildId: GUILD_ID, channelId: '444444444444444499' });
  assert.equal(lib.connections[0].state.status, 'destroyed');
  assert.equal(vm.getState().channelId, '444444444444444499');
});

test('Teilnehmerliste: Namen, Stumm-Status, Bot selbst; Nachladen-Fehler bricht die Liste nicht ab', async () => {
  const { service, world } = await readyService();
  world.addMember('555555555555555501', 'Anna');
  world.guild.voiceStates.cache.set('555555555555555501', { id: '555555555555555501', channelId: VC, member: null, selfMute: true });
  world.guild.voiceStates.cache.set('555555555555555502', { id: '555555555555555502', channelId: VC, member: null }); // unbekannt, fetch scheitert
  world.guild.voiceStates.cache.set(world.client.user.id, { id: world.client.user.id, channelId: VC, member: null });
  world.guild.members.fetch = () => {
    throw new Error('Unknown Member'); // synchroner Fehler
  };
  const list = (await service.listVoiceMembers({ guildId: GUILD_ID }))[VC];
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((m) => [m.name, m.muted, m.isMe]), [
    ['Anna', true, false],
    ['Unbekannt', false, false],
    ['PKBot', false, true],
  ]);
});

test('Discord-Seite: Sprachkanal in Kanalliste mit Rechten; ohne "Verbinden" → Fehler', async () => {
  const { service, world } = await readyService();
  const flat = service.listChannels({ guildId: GUILD_ID }).flatMap((g) => g.channels);
  const v = flat.find((c) => c.id === VC);
  assert.equal(v.type, 'voice');
  assert.equal(v.canConnect, false, 'Fake-Kanal hat kein Connect-Recht');
  assert.throws(() => service.getVoiceTarget({ guildId: GUILD_ID, channelId: VC }), { code: 'MISSING_PERMISSION' });
  assert.throws(() => service.getVoiceTarget({ guildId: GUILD_ID, channelId: world.channels.allgemein.id }), { code: 'NOT_FOUND' });
  assert.match(service.getInviteUrl(), /permissions=\d+/);
  const perms = BigInt(service.getInviteUrl().match(/permissions=(\d+)/)[1]);
  assert.ok((perms & P.Connect) === P.Connect && (perms & P.Speak) === P.Speak, 'Einladung enthält Verbinden + Sprechen');
});
