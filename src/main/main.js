'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, session, Menu } = require('electron');

// Squirrel-Installer (Windows): beim Installieren/Deinstallieren Verknüpfungen anlegen und sofort beenden.
if (handleSquirrelEvent()) return;

const discord = require('discord.js');
const { createDiscordService } = require('./discord');
const { createStore } = require('./store');
const { ensureEnvFile } = require('./env');
const { registerIpc } = require('./ipc');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

const ROOT = path.join(__dirname, '..', '..');
const RENDERER_HTML = path.join(ROOT, 'build', 'renderer', 'index.html');
const RENDERER_URL_PREFIX = require('node:url').pathToFileURL(path.dirname(RENDERER_HTML)).toString();

// Entwickler-Schalter (in der installierten App wirkungslos):
//   --demo                 simulierte Daten ohne Discord-Verbindung (für Screenshots/UI-Tests)
//   --screenshots=<ordner> nimmt automatisch Bilder der laufenden App auf
const DEMO = !app.isPackaged && process.argv.includes('--demo');
const SHOTS_ARG = !app.isPackaged && process.argv.find((a) => a.startsWith('--screenshots='));
const demo = DEMO ? require('./demo').createDemo() : null;

// Entwicklung: .env im Projektordner. Installierte App: .env im Benutzerordner (%APPDATA%\PKMessenger).
const ENV_PATH = demo ? demo.envPath : app.isPackaged ? path.join(app.getPath('userData'), '.env') : path.join(ROOT, '.env');

let mainWindow = null;

function broadcast(type, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('pk:event', { type, payload });
  }
}

// EINE Client-Instanz für alle Fenster.
const service = createDiscordService({
  discord,
  envPath: ENV_PATH,
  emit: broadcast,
  ...(demo ? { createClient: demo.createClient, statusExtra: { demo: true } } : {}),
});
const store = createStore(path.join(app.getPath('userData'), demo || SHOTS_ARG ? 'settings-dev-demo.json' : 'settings.json'));

function isTrustedSender(event) {
  const url = event.senderFrame?.url || '';
  return url.startsWith(RENDERER_URL_PREFIX);
}

async function openEnvFile() {
  ensureEnvFile(ENV_PATH);
  const err = await shell.openPath(ENV_PATH);
  if (err) {
    shell.showItemInFolder(ENV_PATH);
    return { opened: false, path: ENV_PATH };
  }
  return { opened: true, path: ENV_PATH };
}

async function openExternal(url) {
  await shell.openExternal(url);
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#0f1117',
    title: 'PKMessenger',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Keine Navigation weg von der App; Links öffnen im Standardbrowser.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(RENDERER_URL_PREFIX)) e.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // DevTools nur in der Entwicklung (Strg+Umschalt+I).
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (!app.isPackaged && input.control && input.shift && input.key.toLowerCase() === 'i') mainWindow.webContents.toggleDevTools();
  });

  mainWindow.loadFile(RENDERER_HTML);
  if (SHOTS_ARG) {
    const dir = path.resolve(SHOTS_ARG.split('=')[1]);
    mainWindow.webContents.once('did-finish-load', () => {
      require('./screenshots')
        .runScreenshots(mainWindow, dir, { demo: DEMO })
        .catch((e) => console.error('[screenshots] Fehler:', e))
        .finally(() => app.quit());
    });
  }
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  // Keine Kamera/Mikro/Benachrichtigungs-Berechtigungen für Webinhalte.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  registerIpc(ipcMain, { service, store, openEnvFile, openExternal }, isTrustedSender);
  createWindow();
  service.connect(); // async – blockiert das Fenster nicht
});

app.on('window-all-closed', () => app.quit());

let quitting = false;
app.on('before-quit', (e) => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  try {
    store.flush();
  } catch {
    /* ignorieren */
  }
  service.disconnect().finally(() => app.exit(0));
});

function handleSquirrelEvent() {
  if (process.platform !== 'win32') return false;
  const cmd = process.argv[1];
  if (!cmd || !cmd.startsWith('--squirrel-')) return false;
  const { spawn } = require('node:child_process');
  const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  const exeName = path.basename(process.execPath);
  const run = (args) => spawn(updateExe, args, { detached: true }).on('close', () => app.quit());
  switch (cmd) {
    case '--squirrel-install':
    case '--squirrel-updated':
      run(['--createShortcut', exeName]);
      return true;
    case '--squirrel-uninstall':
      run(['--removeShortcut', exeName]);
      return true;
    case '--squirrel-obsolete':
      app.quit();
      return true;
    default:
      return false;
  }
}
