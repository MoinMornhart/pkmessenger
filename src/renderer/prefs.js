// Geräte-Einstellungen dieses PCs (Mikrofon, Lautsprecher, Lautstärke). Keine Geheimnisse.
// localStorage kann fehlen/werfen → immer mit Standardwerten weiterarbeiten.
const KEY = 'pk.prefs.v1';
const DEFAULTS = Object.freeze({ micDeviceId: '', outputDeviceId: '', volume: 1 });
const listeners = new Set();

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const volume = Number(raw?.volume);
    return {
      micDeviceId: typeof raw?.micDeviceId === 'string' ? raw.micDeviceId : '',
      outputDeviceId: typeof raw?.outputDeviceId === 'string' ? raw.outputDeviceId : '',
      volume: Number.isFinite(volume) ? Math.min(2, Math.max(0, volume)) : 1,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

let current = read();

export const prefs = {
  get: () => current,
  set(patch) {
    current = { ...current, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      /* Speicher nicht verfügbar – Wert gilt bis zum Neustart */
    }
    for (const l of listeners) l(current);
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
