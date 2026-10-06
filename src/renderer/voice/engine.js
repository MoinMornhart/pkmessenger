// Sprach-Engine im Renderer:
//  Mikrofon → AudioWorklet → 20-ms-Frames → WebCodecs-Opus-Encoder → Pakete an den Main-Prozess (Bot spricht)
//  Opus-Pakete der anderen → WebCodecs-Opus-Decoder je Sprecher → Lautsprecher (mit kleinem Jitter-Puffer)
// Es wird nichts gespeichert oder aufgezeichnet.
import { voicePacket, onVoiceAudio } from '../api';
import { SAMPLE_RATE, FRAME_SAMPLES, CHANNELS, createFrameAssembler, rms, nextPlayTime } from '../../shared/audio-frames';

const OPUS_CONFIG = { codec: 'opus', sampleRate: SAMPLE_RATE, numberOfChannels: CHANNELS, bitrate: 64000, opus: { frameDuration: 20000 } };

export function micErrorText(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return { message: 'Kein Zugriff aufs Mikrofon.', hint: 'Windows-Einstellungen → Datenschutz & Sicherheit → Mikrofon → „Desktop-Apps den Zugriff erlauben“ einschalten.' };
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return { message: 'Kein Mikrofon gefunden.', hint: 'Mikrofon/Headset anschließen und erneut versuchen.' };
  if (name === 'NotReadableError') return { message: 'Das Mikrofon wird gerade von einem anderen Programm benutzt.', hint: 'Andere Programme (z. B. Teams, Zoom) schließen und erneut versuchen.' };
  return { message: 'Mikrofon konnte nicht gestartet werden.', hint: String(err?.message || err || '') };
}

// Zähler für Diagnose/automatische Tests (nur Zahlen, keine Audiodaten).
const stats = (window.__pkVoiceStats = { encoded: 0, decoded: 0, played: 0 });

export function createVoiceEngine({ onLevel = () => {} } = {}) {
  let ctx = null;
  let master = null;
  let mic = null; // { stream, source, node, encoder, assembler }
  let playback = false;
  const decoders = new Map(); // userId → { decoder, until, ts }
  let offAudio = null;

  function ensureContext() {
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // ---------- Sprechen ----------
  async function startMic() {
    if (mic) return;
    const c = ensureContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false });
    try {
      await c.audioWorklet.addModule('voice-worklet.js');
    } catch {
      /* bereits geladen */
    }
    const source = c.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(c, 'pk-capture', { numberOfInputs: 1, numberOfOutputs: 0 });
    const assembler = createFrameAssembler();
    let ts = 0;
    let levelTick = 0;
    const encoder = new AudioEncoder({
      output: (chunk) => {
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        stats.encoded++;
        voicePacket(bytes);
      },
      error: (e) => console.warn('[Sprache] Encoder-Fehler', e),
    });
    encoder.configure(OPUS_CONFIG);
    node.port.onmessage = (ev) => {
      const block = ev.data;
      if (++levelTick % 8 === 0) onLevel(Math.min(1, rms(block) * 4));
      for (const frame of assembler.push(block)) {
        if (encoder.state !== 'configured') return;
        const data = new AudioData({ format: 'f32-planar', sampleRate: SAMPLE_RATE, numberOfFrames: FRAME_SAMPLES, numberOfChannels: CHANNELS, timestamp: ts, data: frame });
        ts += 20000;
        encoder.encode(data);
        data.close();
      }
    };
    source.connect(node);
    mic = { stream, source, node, encoder, assembler };
  }

  function stopMic() {
    if (!mic) return;
    const m = mic;
    mic = null;
    m.node.port.onmessage = null;
    try {
      m.source.disconnect();
      m.node.disconnect();
    } catch {
      /* egal */
    }
    for (const t of m.stream.getTracks()) t.stop(); // Mikrofon wirklich freigeben (Windows-Mikro-Symbol erlischt)
    if (m.encoder.state !== 'closed') m.encoder.close();
    onLevel(0);
  }

  // ---------- Zuhören ----------
  function decoderFor(userId) {
    let d = decoders.get(userId);
    if (d && d.decoder.state !== 'closed') return d;
    d = { until: 0, ts: 0, decoder: null };
    d.decoder = new AudioDecoder({
      output: (audio) => {
        try {
          stats.decoded++;
          if (!playback || !ctx) return;
          const frames = audio.numberOfFrames;
          const chans = Math.min(audio.numberOfChannels, 2);
          const buffer = ctx.createBuffer(2, frames, audio.sampleRate);
          for (let ch = 0; ch < 2; ch++) {
            const tmp = new Float32Array(frames);
            audio.copyTo(tmp, { planeIndex: Math.min(ch, chans - 1), format: 'f32-planar' });
            buffer.copyToChannel(tmp, ch);
          }
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.connect(master);
          const at = nextPlayTime(ctx.currentTime, d.until);
          src.start(at);
          stats.played++;
          d.until = at + buffer.duration;
        } finally {
          audio.close();
        }
      },
      error: () => decoders.delete(userId), // kaputtes Paket → Decoder neu anlegen
    });
    d.decoder.configure({ codec: 'opus', sampleRate: SAMPLE_RATE, numberOfChannels: CHANNELS });
    decoders.set(userId, d);
    return d;
  }

  function setPlayback(on) {
    playback = on;
    if (on) {
      ensureContext();
      if (!offAudio)
        offAudio = onVoiceAudio((userId, data) => {
          if (!playback) return;
          const d = decoderFor(userId);
          try {
            d.decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: (d.ts += 20000), data }));
          } catch {
            decoders.delete(userId);
          }
        });
    } else {
      offAudio?.();
      offAudio = null;
      for (const d of decoders.values()) if (d.decoder.state !== 'closed') d.decoder.close();
      decoders.clear();
    }
  }

  function setVolume(v) {
    if (master) master.gain.value = Math.max(0, Math.min(2, v));
  }

  function destroy() {
    stopMic();
    setPlayback(false);
    if (ctx) ctx.close();
    ctx = null;
    master = null;
  }

  return { startMic, stopMic, setPlayback, setVolume, destroy, isMicOn: () => Boolean(mic), resume: ensureContext };
}
