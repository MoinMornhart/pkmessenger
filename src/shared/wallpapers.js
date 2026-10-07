'use strict';

// Chat-Hintergründe (Issue #1: „Hintergrund für jeden Chat, sogar Server, mit coolen Vorlagen“).
// Die Vorlagen sind reines CSS (styles.css, [data-wall="…"]) und passen sich Design + Akzentfarbe an.
const WALLPAPERS = [
  { id: 'punkte', label: 'Punkte' },
  { id: 'schlicht', label: 'Schlicht' },
  { id: 'verlauf', label: 'Verlauf' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'raster', label: 'Raster' },
  { id: 'streifen', label: 'Streifen' },
  { id: 'sterne', label: 'Sterne' },
  { id: 'wellen', label: 'Wellen' },
];
const IDS = new Set(WALLPAPERS.map((w) => w.id));
const KEY = /^(default|\d{17,20}|@dm)$/;

function sanitizeWallpapers(raw) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const [k, v] of Object.entries(raw)) if (KEY.test(k) && IDS.has(v)) out[k] = v;
  return out;
}

/** Welcher Hintergrund gilt? Chat vor Server vor Standard. */
function wallpaperFor(map, { channelId, guildId } = {}) {
  return map[channelId] || map[guildId] || map.default || 'punkte';
}

module.exports = { WALLPAPERS, sanitizeWallpapers, wallpaperFor };
