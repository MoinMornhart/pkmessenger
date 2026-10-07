'use strict';

// Erzeugt das App-Icon aus dem eigenen PKMessenger-Logo (kein Discord-Branding):
//   assets/icon.png (512 px) und assets/icon.ico (16–256 px, PNG-komprimiert, für Windows/Installer).
// Aufruf (mit Electron, weil der eingebaute Chromium das SVG zeichnet):  npx electron scripts/make-icon.js
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, nativeImage } = require('electron');

const OUT = path.join(__dirname, '..', 'assets');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

// Gleiche Form wie src/renderer/components/Logo.jsx, nur ohne Rand (füllt das Icon aus)
const svg = (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="2 2 44 44">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs>
  <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#g)"/>
  <path d="M14 34V14h8.5a6 6 0 0 1 0 12H18" fill="none" stroke="#0b0e14" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M27 14v20M27 25l8-11M29.5 22.5 36 34" fill="none" stroke="#0b0e14" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

async function render(px) {
  const win = new BrowserWindow({ width: px, height: px, show: false, frame: false, transparent: true, backgroundColor: '#00000000', webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg(px)}</body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: px, height: px });
  win.destroy();
  return img;
}

/** ICO mit eingebetteten PNGs (von Windows Vista an unterstützt). */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // Typ: Icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); // Farbebenen
    e.writeUInt16LE(32, 6); // Bit pro Pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const big = await render(512);
  fs.writeFileSync(path.join(OUT, 'icon.png'), big.toPNG());
  const pngs = [];
  for (const size of SIZES) {
    // Einmal groß zeichnen, dann hochwertig verkleinern (sehr kleine Offscreen-Fenster lädt Electron nicht)
    const img = nativeImage.createFromBuffer(big.toPNG()).resize({ width: size, height: size, quality: 'best' });
    pngs.push({ size, data: img.toPNG() });
  }
  fs.writeFileSync(path.join(OUT, 'icon.ico'), buildIco(pngs));
  console.log(`icon.png (512) + icon.ico (${SIZES.join(', ')}) in ${OUT}`);
  app.quit();
});
