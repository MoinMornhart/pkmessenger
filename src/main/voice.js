'use strict';

// Sprachkanäle: Beitreten, Sprechen (Opus-Pakete aus dem Renderer) und Zuhören (Opus-Pakete an den Renderer).
// Einzige Datei, die @discordjs/voice nutzt. Ende-zu-Ende-Verschlüsselung (DAVE) übernimmt die Bibliothek (Standard: an).
// Es wird NICHTS aufgezeichnet oder gespeichert – Ton wird nur live durchgereicht.
const { PassThrough } = require('node:stream');
const { appError } = require('./errors');

const JOIN_TIMEOUT_MS = 20000;
const MAX_OPUS_PACKET = 1500; // Opus-Pakete für 20 ms sind deutlich kleiner; alles darüber ist kaputt/Missbrauch
const SILENCE_END_MS = 400;

/**
 * @param {object} o
 * @param {object} o.voiceLib  @discordjs/voice (oder Fake in Tests/Demo)
 * @param {(t:{guildId:string,channelId:string})=>{guild:any,channel:any,canSpeak:boolean,botId:string,channelName:string}} o.getVoiceTarget
 * @param {(type:string,payload:any)=>void} o.emit         Status-Events an den Renderer
 * @param {(userId:string,data:Uint8Array)=>void} o.sendAudio  empfangene Opus-Pakete an den Renderer
 */
function createVoiceManager({ voiceLib, getVoiceTarget, emit, sendAudio, joinTimeoutMs = JOIN_TIMEOUT_MS }) {
  const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, VoiceConnectionStatus, StreamType, NoSubscriberBehavior, EndBehaviorType } = voiceLib;

  let session = null;
  let state = { state: 'idle' };

  function setState(patch) {
    state = { ...patch, at: Date.now() };
    emit('voice:state', state);
    return state;
  }

  function publicState() {
    return state;
  }

  function cleanupSession() {
    const s = session;
    session = null;
    if (!s) return;
    try {
      s.mic?.end();
    } catch {
      /* egal */
    }
    for (const stream of s.receivers.values()) stream.destroy();
    s.receivers.clear();
    try {
      s.player?.stop(true);
    } catch {
      /* egal */
    }
    try {
      if (s.connection.state?.status !== VoiceConnectionStatus.Destroyed) s.connection.destroy();
    } catch {
      /* egal */
    }
  }

  function subscribeUser(s, userId) {
    if (!s.listening || userId === s.botId || s.receivers.has(userId)) return;
    const stream = s.connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE_END_MS } });
    s.receivers.set(userId, stream);
    stream.on('data', (packet) => {
      if (session === s && s.listening) sendAudio(userId, packet);
    });
    const done = () => s.receivers.get(userId) === stream && s.receivers.delete(userId);
    stream.once('end', done);
    stream.once('close', done);
    stream.once('error', done);
  }

  async function join({ guildId, channelId, listen = true }) {
    const target = getVoiceTarget({ guildId, channelId }); // wirft deutsche Fehler bei fehlenden Rechten
    if (session) leave();
    setState({ state: 'connecting', guildId, channelId, channelName: target.channelName });

    const connection = joinVoiceChannel({
      guildId,
      channelId,
      adapterCreator: target.guild.voiceAdapterCreator,
      selfDeaf: !listen,
      selfMute: !target.canSpeak,
      daveEncryption: true,
    });
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    const s = { guildId, channelId, connection, player, mic: null, receivers: new Map(), listening: listen, talking: false, canSpeak: target.canSpeak, botId: target.botId, channelName: target.channelName };
    session = s;
    connection.subscribe(player);

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, joinTimeoutMs);
    } catch {
      if (session === s) cleanupSession();
      setState({ state: 'error', guildId, channelId, error: { message: 'Verbindung zum Sprachkanal fehlgeschlagen.', hint: 'Prüfe deine Internetverbindung und die Rechte „Verbinden“/„Sprechen“ der Bot-Rolle, dann erneut beitreten.' } });
      throw appError('VOICE_TIMEOUT', 'Verbindung zum Sprachkanal fehlgeschlagen.', 'Internet und Bot-Rechte prüfen, dann erneut beitreten.');
    }
    if (session !== s) throw appError('VOICE_ABORTED', 'Beitritt abgebrochen.');

    connection.receiver.speaking.on('start', (userId) => {
      if (session !== s) return;
      emit('voice:speaking', { userId, speaking: true });
      subscribeUser(s, userId);
    });
    connection.receiver.speaking.on('end', (userId) => session === s && emit('voice:speaking', { userId, speaking: false }));

    // Verbindungsabbruch: kurz auf Wiederverbindung warten (z. B. Kanalwechsel durch Moderator), sonst sauber beenden.
    connection.on('stateChange', async (_old, next) => {
      if (session !== s) return;
      if (next.status === VoiceConnectionStatus.Disconnected) {
        setState({ ...state, state: 'reconnecting' });
        try {
          await Promise.race([entersState(connection, VoiceConnectionStatus.Signalling, 5000), entersState(connection, VoiceConnectionStatus.Connecting, 5000)]);
        } catch {
          if (session === s) {
            cleanupSession();
            setState({ state: 'idle', ended: 'Verbindung zum Sprachkanal getrennt.' });
          }
        }
      } else if (next.status === VoiceConnectionStatus.Ready && state.state === 'reconnecting') {
        setState({ state: 'connected', guildId, channelId, channelName: s.channelName, canSpeak: s.canSpeak, talking: s.talking, listening: s.listening });
      } else if (next.status === VoiceConnectionStatus.Destroyed && session === s) {
        session = null;
        setState({ state: 'idle' });
      }
    });

    return setState({ state: 'connected', guildId, channelId, channelName: s.channelName, canSpeak: s.canSpeak, talking: false, listening: listen });
  }

  function requireSession() {
    if (!session) throw appError('VOICE_NOT_CONNECTED', 'Du bist in keinem Sprachkanal.', 'Zuerst einem Sprachkanal beitreten.');
    return session;
  }

  /** Mikrofon an/aus. Beim Einschalten entsteht ein Opus-Strom, in den der Renderer Pakete schiebt. */
  function setTalking(on) {
    const s = requireSession();
    if (on && !s.canSpeak) throw appError('MISSING_PERMISSION', 'Der Bot darf in diesem Sprachkanal nicht sprechen.', 'Gib der Bot-Rolle das Recht „Sprechen“.');
    if (on === s.talking) return state;
    s.talking = on;
    if (on) {
      s.mic = new PassThrough({ objectMode: true, highWaterMark: 50 });
      s.player.play(createAudioResource(s.mic, { inputType: StreamType.Opus }));
    } else {
      s.mic?.end();
      s.mic = null;
    }
    return setState({ ...state, talking: on });
  }

  /** Ein 20-ms-Opus-Paket vom Mikrofon. Wird ignoriert, wenn das Mikro aus ist. */
  function pushPacket(data) {
    const s = session;
    if (!s || !s.talking || !s.mic) return false;
    if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > MAX_OPUS_PACKET) return false;
    if (s.mic.writableLength > 25) return false; // Rückstau (>0,5 s) → lieber verwerfen als Verzögerung aufbauen
    s.mic.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    return true;
  }

  /** Zuhören an/aus (Ton aus = Bot ist "taub", empfängt nichts). */
  function setListening(on) {
    const s = requireSession();
    s.listening = on;
    if (!on) {
      for (const stream of s.receivers.values()) stream.destroy();
      s.receivers.clear();
    }
    s.connection.rejoin?.({ channelId: s.channelId, selfDeaf: !on, selfMute: !s.canSpeak });
    return setState({ ...state, listening: on });
  }

  function leave() {
    if (!session) return setState({ state: 'idle' });
    cleanupSession();
    return setState({ state: 'idle' });
  }

  return { join, leave, setTalking, setListening, pushPacket, getState: publicState };
}

module.exports = { createVoiceManager, MAX_OPUS_PACKET };
