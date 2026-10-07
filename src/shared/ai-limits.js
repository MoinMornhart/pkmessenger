'use strict';

// KI-Limits (Issue #12): Bei Cloud-Anbietern (OpenAI, Claude, OpenRouter …) schützen sie vor Kosten und sind
// automatisch an. Ein lokales Modell (Ollama, LM Studio …) kostet nichts – dort sind sie automatisch aus.
// Modus: 'auto' (wie eben beschrieben), 'an' (immer), 'aus' (nie). Die Zahlen bleiben immer einstellbar.
const LIMIT_MODES = ['auto', 'an', 'aus'];

/** Läuft das Modell auf diesem PC oder im eigenen Netz? (localhost, 127.x, ::1, 10.x, 192.168.x, 172.16–31.x, *.local) */
function isLocalAddress(baseUrl) {
  let host;
  try {
    host = new URL(baseUrl).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0' || host.endsWith('.local') || host.endsWith('.localhost')) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/** Gelten die Limits gerade? */
function limitsActive({ mode = 'auto' } = {}, baseUrl = '') {
  if (mode === 'an') return true;
  if (mode === 'aus') return false;
  return !isLocalAddress(baseUrl);
}

module.exports = { LIMIT_MODES, isLocalAddress, limitsActive };
