// Einstellungen dieses PCs (Audio, Chatliste, Aussehen). Keine Geheimnisse.
// localStorage kann fehlen/werfen → immer mit Standardwerten weiterarbeiten.
const KEY = 'pk.prefs.v1';
const DEFAULTS = Object.freeze({ micDeviceId: '', outputDeviceId: '', volume: 1, chatSort: 'recent', collapsed: {}, theme: 'nacht', accent: '', motion: 'voll', density: 'normal' });
const THEME_IDS = ['nacht', 'ozean', 'lila', 'amoled', 'hell'];
const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const listeners = new Set();

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const volume = Number(raw?.volume);
    return {
      micDeviceId: typeof raw?.micDeviceId === 'string' ? raw.micDeviceId : '',
      outputDeviceId: typeof raw?.outputDeviceId === 'string' ? raw.outputDeviceId : '',
      volume: Number.isFinite(volume) ? Math.min(2, Math.max(0, volume)) : 1,
      chatSort: raw?.chatSort === 'categories' ? 'categories' : 'recent',
      theme: pick(raw?.theme, THEME_IDS, 'nacht'),
      accent: typeof raw?.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent : '',
      motion: pick(raw?.motion, ['voll', 'dezent', 'aus'], 'voll'),
      density: pick(raw?.density, ['normal', 'kompakt'], 'normal'),
      collapsed: raw?.collapsed && typeof raw.collapsed === 'object' && !Array.isArray(raw.collapsed) ? Object.fromEntries(Object.entries(raw.collapsed).filter(([k, v]) => /^\d{17,20}$/.test(k) && v === true)) : {},
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
