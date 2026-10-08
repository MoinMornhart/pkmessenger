'use strict';

// Anmelden per Link/QR-Code (JoniMoni #77): Ein bereits angemeldetes Gerät erzeugt einen Link mit dem Bot-Token –
// verschlüsselt (AES-GCM, Schlüssel per PBKDF2 aus einem 8-stelligen Code). Den Code zeigt nur der Bildschirm des
// gebenden Geräts; ohne ihn ist der Link wertlos. Läuft mit WebCrypto in Node (Electron-Hauptprozess) und im
// Android-WebView gleich.
const SCHEME = 'pkmessenger://login';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O, 1/I – gut abzulesen
const ITERATIONS = 210000;

const subtle = () => {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('Verschlüsselung ist hier nicht verfügbar.');
  return c;
};
const b64url = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (str) => {
  const norm = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(norm + '='.repeat((4 - (norm.length % 4)) % 4));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
};
const normalizeCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function newCode() {
  const bytes = subtle().getRandomValues(new Uint8Array(8));
  const raw = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

async function keyFrom(code, salt, usage) {
  const c = subtle();
  const base = await c.subtle.importKey('raw', new TextEncoder().encode(normalizeCode(code)), 'PBKDF2', false, ['deriveKey']);
  return c.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

/** Token → { link, code }. Der Code gehört NICHT in den Link. */
async function sealToken(token) {
  const c = subtle();
  const code = newCode();
  const salt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(code, salt, 'encrypt');
  const enc = new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)));
  const blob = new Uint8Array(salt.length + iv.length + enc.length);
  blob.set(salt, 0);
  blob.set(iv, salt.length);
  blob.set(enc, salt.length + iv.length);
  return { link: `${SCHEME}?v=1#d=${b64url(blob)}`, code };
}

const isLoginLink = (text) => typeof text === 'string' && text.trim().startsWith(SCHEME);

/** Link + Code → Token. Falscher Code oder veränderter Link → verständlicher Fehler. */
async function openLink(link, code) {
  const m = /#d=([A-Za-z0-9_-]{40,1500})$/.exec(String(link || '').trim());
  if (!isLoginLink(link) || !m) throw Object.assign(new Error('Das ist kein gültiger Anmelde-Link.'), { code: 'VALIDATION', hint: 'Den Link am anderen Gerät neu erzeugen und ganz kopieren.' });
  if (normalizeCode(code).length !== 8) throw Object.assign(new Error('Der Code hat 8 Zeichen (z. B. ABCD-2345).'), { code: 'VALIDATION' });
  const blob = fromB64url(m[1]);
  const salt = blob.slice(0, 16);
  const iv = blob.slice(16, 28);
  try {
    const key = await keyFrom(code, salt, 'decrypt');
    return new TextDecoder().decode(await subtle().subtle.decrypt({ name: 'AES-GCM', iv }, key, blob.slice(28)));
  } catch {
    throw Object.assign(new Error('Der Code passt nicht zu diesem Link.'), { code: 'VALIDATION', hint: 'Code genau so eingeben, wie er am anderen Gerät steht.' });
  }
}

module.exports = { sealToken, openLink, isLoginLink, normalizeCode, SCHEME };
