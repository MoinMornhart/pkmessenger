// Eigene Chat-Hintergründe (#131): Bilder liegen NUR auf diesem Gerät in der App-Datenbank (IndexedDB), nie im Netz.
// Große Bilder werden verkleinert (max. 2560 px, WebP). GIFs bleiben animiert (bis 8 MB) und bekommen ein
// Standbild für „Hintergrund-Animationen aus“. Gespeichert werden data:-Adressen (CSP erlaubt img-src data:).
import { isCustomWall } from '../shared/wallpapers';

const DB = 'pk-walls';
const STORE = 'walls';
const MAX_INPUT = 25 * 1024 * 1024;
const MAX_GIF = 8 * 1024 * 1024;
const MAX_SIDE = 2560;
const MAX_WALLS = 12;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

const cache = new Map(); // id → { id, name, url, still, animated }
const listeners = new Set();
let loaded = null;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}

const notify = () => {
  for (const l of listeners) l(list());
};

/** Alle eigenen Bilder laden (einmal pro Start). Fehler → einfach keine eigenen Bilder. */
export function loadWalls() {
  if (!loaded) {
    loaded = tx('readonly', (s) => s.getAll())
      .then((rows) => {
        for (const r of rows || []) if (isCustomWall(r?.id) && typeof r.url === 'string' && r.url.startsWith('data:image/')) cache.set(r.id, r);
        notify();
      })
      .catch(() => {});
  }
  return loaded;
}

export const list = () => [...cache.values()].sort((a, b) => (a.at || 0) - (b.at || 0));
export const getWall = (id) => cache.get(id) || null;
export function subscribeWalls(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const readAsDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Bild (oder erstes GIF-Bild) auf max. MAX_SIDE verkleinern → WebP-data:-Adresse. */
async function toWebp(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return canvas.toDataURL('image/webp', 0.85);
}

/** Eigenes Bild hinzufügen. Wirft verständliche deutsche Fehler. */
export async function addWall(file) {
  if (!file || !TYPES.includes(file.type)) throw new Error('Bitte ein Bild wählen (PNG, JPG, WebP oder GIF).');
  if (file.size > MAX_INPUT) throw new Error('Das Bild ist zu groß (max. 25 MB).');
  if (cache.size >= MAX_WALLS) throw new Error(`Höchstens ${MAX_WALLS} eigene Bilder – lösche erst eins.`);
  let still;
  try {
    still = await toWebp(file); // prüft zugleich, dass es wirklich ein lesbares Bild ist
  } catch {
    throw new Error('Das Bild lässt sich nicht öffnen.');
  }
  const animated = file.type === 'image/gif' && file.size <= MAX_GIF;
  const url = animated ? await readAsDataUrl(file) : still;
  if (!url.startsWith('data:image/')) throw new Error('Das Bild lässt sich nicht öffnen.');
  const row = { id: `bild:${crypto.randomUUID()}`, name: String(file.name || 'Bild').slice(0, 60), url, still, animated, at: Date.now() };
  await tx('readwrite', (s) => s.put(row));
  cache.set(row.id, row);
  notify();
  return row;
}

export async function removeWall(id) {
  if (!isCustomWall(id)) return;
  await tx('readwrite', (s) => s.delete(id)).catch(() => {});
  cache.delete(id);
  notify();
}
