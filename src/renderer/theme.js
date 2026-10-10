// Aussehen (Wunsch JoniMoni, Issue #1): Designs, Akzentfarbe, Animationen, kompakte Ansicht.
// Wird als data-Attribute an <html> gesetzt, styles.css reagiert darauf. Keine Geheimnisse, nur localStorage.
import { prefs } from './prefs';

export const THEMES = [
  { id: 'nacht', label: 'Nacht', swatch: ['#0c1216', '#111a20', '#2dd4bf'] },
  { id: 'ozean', label: 'Ozean', swatch: ['#0a1424', '#0f1d33', '#38bdf8'] },
  { id: 'lila', label: 'Lila', swatch: ['#130f1f', '#1b1530', '#a78bfa'] },
  { id: 'amoled', label: 'AMOLED', swatch: ['#000000', '#0a0a0a', '#22d3ee'] },
  { id: 'hell', label: 'Hell', swatch: ['#f3f6f8', '#ffffff', '#0d9488'] },
];

export const ACCENTS = ['', '#2dd4bf', '#38bdf8', '#a78bfa', '#f472b6', '#fb923c', '#facc15', '#4ade80', '#f87171'];

export const MOTIONS = [
  { id: 'voll', label: 'Voll', hint: 'Alle Effekte' },
  { id: 'dezent', label: 'Dezent', hint: 'Kurz & ruhig' },
  { id: 'aus', label: 'Aus', hint: 'Keine Bewegung' },
];

// Lesbare Schrift auf der Akzentfarbe: dunkel auf hellen Farben, sonst weiß
function inkFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? '#06201c' : '#ffffff';
}

export function applyAppearance(p = prefs.get()) {
  const root = document.documentElement;
  root.dataset.theme = p.theme;
  root.dataset.motion = p.motion;
  root.dataset.density = p.density;
  // #131 Leistung: „Animationen aus“ stoppt auch bewegte Hintergründe
  root.dataset.wallAnim = p.wallAnim && p.motion !== 'aus' ? 'an' : 'aus';
  root.dataset.glass = p.glass ? 'an' : 'aus';
  if (p.accent) {
    root.style.setProperty('--accent', p.accent);
    root.style.setProperty('--accent-ink', inkFor(p.accent));
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-ink');
  }
}

/** Einmal beim Start aufrufen: wendet an und folgt allen späteren Änderungen. */
export function initAppearance() {
  applyAppearance();
  return prefs.subscribe(applyAppearance);
}
