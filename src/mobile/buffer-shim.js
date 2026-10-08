// Kleiner Ersatz für Node-Buffer im WebView (Android-App): nur was der geteilte Code braucht –
// Buffer.from(Bytes|ArrayBuffer[, offset, länge]) und Buffer.from(text, 'base64'|'base64url'), .toString('base64'|'utf8').
const b64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (str) => {
  const norm = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(norm + '='.repeat((4 - (norm.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

class MiniBuffer extends Uint8Array {
  static from(data, a, b) {
    if (typeof data === 'string') {
      if (a === 'base64' || a === 'base64url') return MiniBuffer.wrap(fromB64(data));
      return MiniBuffer.wrap(new TextEncoder().encode(data));
    }
    if (data instanceof ArrayBuffer) return MiniBuffer.wrap(new Uint8Array(data, a ?? 0, b ?? data.byteLength - (a ?? 0)));
    if (ArrayBuffer.isView(data)) return MiniBuffer.wrap(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    return MiniBuffer.wrap(Uint8Array.from(data || []));
  }
  static wrap(u8) {
    return new MiniBuffer(u8.buffer, u8.byteOffset, u8.byteLength);
  }
  toString(enc = 'utf8') {
    if (enc === 'base64') return b64(this);
    if (enc === 'base64url') return b64(this).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return new TextDecoder().decode(this);
  }
}

export const Buffer = globalThis.Buffer || MiniBuffer;
