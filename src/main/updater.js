'use strict';

// Automatische Updates für die INSTALLIERTE App (Squirrel.Windows) über den kostenlosen Dienst update.electronjs.org.
// Voraussetzungen laut github.com/electron/update.electronjs.org: öffentliches GitHub-Repo, Builds als GitHub-Releases,
// Code-Signatur nur für macOS/MSIX nötig (nicht für Squirrel.Windows).
// Übertragen wird dabei nur: Repo, Plattform, Architektur und App-Version (keine persönlichen Daten).

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** "github:owner/name", "owner/name" oder "https://github.com/owner/name(.git)" → "owner/name" */
function parseRepo(repository) {
  const raw = typeof repository === 'string' ? repository : repository?.url;
  if (!raw) return null;
  const m = /^(?:github:)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/.exec(raw) || /github\.com[/:]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(raw);
  if (!m || m[1] === 'DEIN-GITHUB-NAME') return null;
  return `${m[1]}/${m[2]}`;
}

function feedUrl(repo, platform, arch, version) {
  return `https://update.electronjs.org/${repo}/${platform}-${arch}/${version}`;
}

/**
 * @param {object} o
 * @param {import('electron').AutoUpdater} o.autoUpdater
 * @param {boolean} o.isPackaged
 * @param {string} o.version  App-Version (semver)
 * @param {string|null} o.repo  "owner/name"
 * @param {(type:string, payload:any)=>void} o.emit
 */
function createUpdater({ autoUpdater, isPackaged, version, repo, emit, platform = process.platform, arch = process.arch, argv = process.argv, schedule = setInterval }) {
  let state = { state: 'idle', version };
  const set = (patch) => {
    state = { ...state, ...patch, at: Date.now() };
    emit('update', state);
    return state;
  };

  let reason = null;
  if (!isPackaged) reason = 'Updates gibt es nur in der installierten App. Im Quellcode: npm run update';
  else if (platform !== 'win32' && platform !== 'darwin') reason = 'Automatische Updates werden auf diesem System nicht unterstützt.';
  else if (!repo) reason = 'Kein GitHub-Repo eingetragen (package.json → "repository").';
  const enabled = !reason;
  state = { ...state, enabled, ...(reason ? { state: 'disabled', reason } : {}) };

  function start() {
    if (!enabled) return state;
    autoUpdater.setFeedURL({ url: feedUrl(repo, platform, arch, version) });
    autoUpdater.on('checking-for-update', () => set({ state: 'checking', error: null }));
    autoUpdater.on('update-available', () => set({ state: 'downloading' }));
    autoUpdater.on('update-not-available', () => set({ state: 'current' }));
    autoUpdater.on('update-downloaded', (_e, releaseNotes, releaseName) => set({ state: 'ready', newVersion: releaseName || null }));
    autoUpdater.on('error', (err) =>
      set({ state: 'error', error: { message: 'Update-Prüfung fehlgeschlagen.', hint: 'Später erneut versuchen. Ohne Internet oder ohne GitHub-Release gibt es nichts zu laden.', detail: String(err?.message || err).slice(0, 200) } }),
    );
    // Beim allerersten Start nach der Installation hält Squirrel noch eine Sperre → dann nicht sofort prüfen.
    if (!argv.includes('--squirrel-firstrun')) check();
    schedule(check, CHECK_INTERVAL_MS);
    return state;
  }

  function check() {
    if (!enabled) return state;
    if (state.state === 'ready' || state.state === 'downloading') return state;
    try {
      autoUpdater.checkForUpdates();
    } catch (err) {
      set({ state: 'error', error: { message: 'Update-Prüfung fehlgeschlagen.', hint: 'Später erneut versuchen.', detail: String(err?.message || err) } });
    }
    return state;
  }

  function install() {
    if (state.state !== 'ready') return false;
    autoUpdater.quitAndInstall();
    return true;
  }

  return { start, check, install, getState: () => state };
}

module.exports = { createUpdater, parseRepo, feedUrl, CHECK_INTERVAL_MS };
