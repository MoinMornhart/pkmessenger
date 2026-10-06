// AudioWorklet: gibt die Mikrofon-Samples (Kanal 0, je 128 Samples) an den Haupt-Thread weiter.
// Läuft im Audio-Thread – darf nichts Blockierendes tun.
class PkCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('pk-capture', PkCaptureProcessor);
