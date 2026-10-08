'use strict';

// Erzeugt App-Icons und Startbildschirme der Android-App aus dem eigenen PKMessenger-Logo
// (kein Discord- oder Capacitor-Branding). Größen werden aus den vorhandenen Dateien übernommen.
// Aufruf: npx electron scripts/make-android-icons.js
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, nativeImage } = require('electron');

const RES = path.join(__dirname, '..', 'mobile', 'android', 'app', 'src', 'main', 'res');
const BG = '#0b0e14';
const logo = (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="2 2 44 44">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs>
  <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#g)"/>
  <path d="M14 34V14h8.5a6 6 0 0 1 0 12H18" fill="none" stroke="#0b0e14" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M27 14v20M27 25l8-11M29.5 22.5 36 34" fill="none" stroke="#0b0e14" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

async function render(w, h, inner) {
  const win = new BrowserWindow({ width: w, height: h, show: false, frame: false, transparent: true, backgroundColor: '#00000000', enableLargerThanScreen: true, useContentSize: true, webPreferences: { offscreen: true } });
  win.setContentSize(w, h); // Startbilder sind höher als der Bildschirm
  // über eine Datei statt data:-Adresse (lange data:-Adressen lädt Chromium nicht zuverlässig)
  const tmp = path.join(app.getPath('temp'), 'pk-android-icon.html');
  fs.writeFileSync(tmp, `<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;display:grid;place-items:center;background:transparent">${inner}</body></html>`);
  await win.loadFile(tmp);
  await new Promise((r) => setTimeout(r, 250));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
  win.destroy();
  return img.resize({ width: w, height: h }).toPNG();
}

const sizeOf = (f) => nativeImage.createFromPath(f).getSize();

// Zwischendurch ist kein Fenster offen – das darf die App nicht beenden
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  let n = 0;
  for (const dir of fs.readdirSync(RES).filter((d) => d.startsWith('mipmap-') && !d.includes('anydpi'))) {
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
      const f = path.join(RES, dir, name);
      if (!fs.existsSync(f)) continue;
      const { width: s } = sizeOf(f);
      let inner;
      if (name === 'ic_launcher_foreground.png') inner = logo(Math.round(s * 0.62)); // Logo in der sicheren Zone (66/108)
      else if (name === 'ic_launcher_round.png') inner = `<div style="width:${s}px;height:${s}px;border-radius:50%;overflow:hidden;background:${BG};display:grid;place-items:center">${logo(Math.round(s * 0.78))}</div>`;
      else inner = logo(s);
      fs.writeFileSync(f, await render(s, s, inner));
      n++;
    }
  }
  for (const dir of fs.readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
    const f = path.join(RES, dir, 'splash.png');
    if (!fs.existsSync(f)) continue;
    const { width: w, height: h } = sizeOf(f);
    const s = Math.round(Math.min(w, h) * 0.28);
    fs.writeFileSync(f, await render(w, h, `<div style="width:${w}px;height:${h}px;background:${BG};display:grid;place-items:center">${logo(s)}</div>`));
    n++;
  }
  fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);
  console.log(`Android-Bilder erzeugt: ${n}`);
  app.exit(0);
});
