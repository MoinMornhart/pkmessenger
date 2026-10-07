'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, session, Menu, autoUpdater, safeStorage, clipboard, powerMonitor } = require('electron');

// Squirrel-Installer (Windows): beim Installieren/Deinstallieren Verknüpfungen anlegen und sofort beenden.
if (handleSquirrelEvent()) return;

const discord = require('discord.js');
const { createDiscordService } = require('./discord');
const { createStore } = require('./store');
const { ensureEnvFile } = require('./env');
const { registerIpc } = require('./ipc');
const { createUpdater, parseRepo } = require('./updater');
const { createVoiceManager } = require('./voice');
const { createAiManager, createSecretFile } = require('./ai');
const { createAppLock } = require('./app-lock');
const { createTokenStore } = require('./secrets');

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
// Automatischer Testlauf: simuliertes Mikrofon (Testton) statt des echten – dein Mikro wird dabei NICHT benutzt.
if (SHOTS_ARG) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}

// Entwicklung: .env im Projektordner. Installierte App: .env im Benutzerordner (%APPDATA%\PKMessenger).
const ENV_PATH = demo ? demo.envPath : app.isPackaged ? path.join(app.getPath('userData'), '.env') : path.join(ROOT, '.env');

let mainWindow = null;

function broadcast(type, payload) {
  // Neuaufbau des Discord-Clients → verwaiste Sprachverbindung auflegen (Fehlersuche Issue #1)
  if (type === 'status') {
    try {
      voice.handleDiscordStatus(payload?.state);
    } catch {
      /* Sprach-Manager noch nicht initialisiert – dann gibt es auch keine Verbindung */
    }
  }
  // KI-Antwort-Agent (Beta): neue Nachrichten prüfen (antwortet nur, wenn eingeschaltet und der Bot erwähnt wird)
  if (type === 'message:create') {
    try {
      ai.onMessage(payload).catch(() => {});
    } catch {
      /* KI-Manager noch nicht initialisiert */
    }
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('pk:event', { type, payload });
  }
}

// EINE Client-Instanz für alle Fenster.
// Token-Tresor: verschlüsselt (Windows DPAPI über safeStorage) in %APPDATA%\PKMessenger\token.enc; .env wird übernommen + gelöscht.
const tokenStore = demo ? null : createTokenStore({ safeStorage, filePath: path.join(app.getPath('userData'), 'token.enc'), envPath: ENV_PATH });
const service = createDiscordService({
  discord,
  envPath: ENV_PATH,
  emit: broadcast,
  ...(tokenStore ? { getToken: () => tokenStore.load() } : {}),
  // Bekannte Privatchats: nur Kanal- und Nutzer-ID, max. 100 (Discord liefert Bots keine DM-Liste)
  dmStore: {
    list: () => (Array.isArray(store.get().dmChannels) ? store.get().dmChannels : []),
    add: (entry) => store.set('dmChannels', [entry, ...(store.get().dmChannels || []).filter((e) => e.channelId !== entry.channelId)].slice(0, 100)),
  },
  ...(demo ? { createClient: demo.createClient, statusExtra: { demo: true } } : {}),
});
const store = createStore(path.join(app.getPath('userData'), demo || SHOTS_ARG ? 'settings-dev-demo.json' : 'settings.json'));
// Screenshot-Lauf: jedes Mal mit gleichem Ausgangszustand starten (KI-Beta aus, keine gemerkten Privatchats)
if (SHOTS_ARG) {
  store.set('ai', null);
  store.set('dmChannels', []);
  store.set('screenProtection', false);
  store.set('appLock', null);
}
const voice = createVoiceManager({
  voiceLib: demo ? demo.voiceLib : require('@discordjs/voice'),
  getVoiceTarget: (t) => service.getVoiceTarget(t),
  emit: broadcast,
  // Empfangener Ton (Opus) live ans Fenster – wird nirgends gespeichert.
  sendAudio: (userId, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('pk:voice-audio', { userId, data });
  },
});
const updater = createUpdater({
  // Demo: simulierter Updater, damit Anzeige und Rückmeldung testbar sind (echte App: Squirrel)
  autoUpdater: demo ? demo.autoUpdater : autoUpdater,
  isPackaged: demo ? true : app.isPackaged,
  version: app.getVersion(),
  repo: parseRepo(require('../../package.json').repository),
  emit: broadcast,
  // Installiert per PKMessenger-Setup.exe? Dann liegt Squirrels Update.exe eine Ebene über der App.
  squirrelInstalled: demo ? true : fs.existsSync(path.join(path.dirname(process.execPath), '..', 'Update.exe')),
});

// Eigener Benachrichtigungston: geprüfte WAV-Datei im App-Ordner (keine Geheimnisse, kein Netz)
const SOUND_PATH = path.join(app.getPath('userData'), 'custom-sound.wav');
const soundFile = {
  has: () => fs.existsSync(SOUND_PATH),
  get: () => (fs.existsSync(SOUND_PATH) ? new Uint8Array(fs.readFileSync(SOUND_PATH)) : null),
  set: (data) => fs.writeFileSync(SOUND_PATH, Buffer.from(data.buffer, data.byteOffset, data.byteLength)),
  clear: () => fs.rmSync(SOUND_PATH, { force: true }),
};

// App-Sperre (Passwort-Hash in settings.json unter „appLock“)
const appLock = createAppLock({ store, emit: broadcast });

// Mit Windows starten: Squirrel-Apps über Update.exe starten (bleibt nach Updates gültig)
const SQUIRREL_UPDATE = path.join(path.dirname(process.execPath), '..', 'Update.exe');
const autostart = {
  get: () => {
    const available = app.isPackaged && fs.existsSync(SQUIRREL_UPDATE);
    return { available, enabled: available && app.getLoginItemSettings({ path: SQUIRREL_UPDATE, args: ['--processStart', `"${path.basename(process.execPath)}"`] }).openAtLogin };
  },
  set: (on) => {
    app.setLoginItemSettings({ openAtLogin: on, path: SQUIRREL_UPDATE, args: ['--processStart', `"${path.basename(process.execPath)}"`] });
    return autostart.get();
  },
};

// KI-Agenten (Beta): API-Schlüssel verschlüsselt in ai-key.enc; im Demo simulierter Anbieter
const ai = createAiManager({
  store,
  service,
  emit: broadcast,
  secret: demo ? demo.aiSecret : createSecretFile({ safeStorage, filePath: path.join(app.getPath('userData'), 'ai-key.enc') }),
  ...(demo ? { fetchImpl: demo.aiFetch } : {}),
});

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
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
      // Benachrichtigungstöne auch ohne vorherigen Klick (z. B. App minimiert gestartet)
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  // Bildschirmschutz: Windows blendet das Fenster bei Screenshots/Aufnahmen anderer Programme schwarz aus
  if (store.get().screenProtection === true) mainWindow.setContentProtection(true);
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
    // Testlauf: Fehler aus der Oberfläche im Terminal sichtbar machen
    mainWindow.webContents.on('console-message', (e) => {
      if (e.level === 'error' || e.level === 'warning') console.log(`[renderer:${e.level}] ${e.message}`);
    });
    const dir = path.resolve(SHOTS_ARG.split('=')[1]);
    mainWindow.webContents.once('did-finish-load', () => {
      require('./screenshots')
        .runScreenshots(mainWindow, dir, { demo: DEMO, stats: demo?.stats, simulate: demo?.simulate })
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
  // Berechtigungen: NUR Mikrofon (Audio, keine Kamera), NUR für unser eigenes App-Fenster (Sprachkanäle).
  // Alles andere (Kamera, Benachrichtigungen, Standort, …) wird abgelehnt.
  const isOwnUrl = (url) => typeof url === 'string' && url.startsWith(RENDERER_URL_PREFIX);
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb, details) => {
    const audioOnly = Array.isArray(details?.mediaTypes) && details.mediaTypes.length > 0 && details.mediaTypes.every((t) => t === 'audio');
    cb(perm === 'media' && audioOnly && isOwnUrl(details.requestingUrl));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, perm, origin, details) => perm === 'media' && details?.mediaType !== 'video' && isOwnUrl(details?.requestingUrl || origin));
  const setScreenProtection = (on) => mainWindow?.setContentProtection(on);
  registerIpc(ipcMain, { service, store, openEnvFile, openExternal, updater, appVersion: app.getVersion(), voice, tokenStore, setScreenProtection, ai, soundFile, copyText: (t) => clipboard.writeText(t), appLock, autostart }, isTrustedSender);
  // Automatische Sperre: PC eine Weile unbenutzt → App sperren
  setInterval(() => appLock.idleTick(powerMonitor.getSystemIdleTime()), 30000).unref?.();
  createWindow();
  service.connect(); // async – blockiert das Fenster nicht
  updater.start();
  ai.start();
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
  try {
    voice.leave(); // sauber auflegen
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
