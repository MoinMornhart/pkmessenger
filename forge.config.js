'use strict';

// Electron Forge 8: Paketierung, Windows-Installer (Squirrel) + ZIP, Veröffentlichung als GitHub-Release.
const { parseRepo } = require('./src/main/updater');

const repo = parseRepo(require('./package.json').repository);
const [owner, name] = repo ? repo.split('/') : [null, null];

module.exports = {
  packagerConfig: {
    name: 'PKMessenger',
    executableName: 'PKMessenger',
    asar: true,
    // App-Icon (erzeugt mit `npm run icon` aus dem eigenen Logo); Electron Packager hängt unter Windows .ico an
    icon: 'assets/icon',
    // NIEMALS .env, Tests, Quellcode des Renderers oder Doku mit ausliefern.
    ignore: [/^\/\.env/, /^\/tests/, /^\/src\/renderer/, /^\/src\/mobile/, /^\/mobile/, /^\/relay/, /^\/scripts/, /^\/docs/, /^\/out/, /^\/\.git/, /^\/screenshots/, /^\/src\/main\/demo\.js$/, /^\/src\/main\/screenshots\.js$/, /\.md$/],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'PKMessenger',
        setupExe: 'PKMessenger-Setup.exe',
        setupIcon: 'assets/icon.ico',
        // Symbol in „Apps & Features“ (muss eine öffentliche Adresse sein)
        ...(owner ? { iconUrl: `https://raw.githubusercontent.com/${owner}/${name}/main/assets/icon.ico` } : {}),
      },
    },
    { name: '@electron-forge/maker-zip', platforms: ['win32'] },
  ],
  // `npm run publish` lädt Installer + Update-Pakete als GitHub-Release hoch (Token per Umgebungsvariable GITHUB_TOKEN).
  // draft: false, weil update.electronjs.org nur veröffentlichte Releases sieht (Standard des Publishers wäre "Entwurf").
  publishers: owner
    ? [{ name: '@electron-forge/publisher-github', config: { repository: { owner, name }, draft: false, prerelease: false } }]
    : [],
};
