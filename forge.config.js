'use strict';

// Electron Forge 8: Paketierung + Windows-Installer (Squirrel) und ZIP.
module.exports = {
  packagerConfig: {
    name: 'PKMessenger',
    executableName: 'PKMessenger',
    asar: true,
    // NIEMALS .env, Tests, Quellcode des Renderers oder Doku mit ausliefern.
    ignore: [/^\/\.env/, /^\/tests/, /^\/src\/renderer/, /^\/scripts/, /^\/docs/, /^\/out/, /^\/\.git/, /^\/screenshots/, /^\/src\/main\/demo\.js$/, /^\/src\/main\/screenshots\.js$/, /\.md$/],
  },
  makers: [
    { name: '@electron-forge/maker-squirrel', config: { name: 'PKMessenger', setupExe: 'PKMessenger-Setup.exe' } },
    { name: '@electron-forge/maker-zip', platforms: ['win32'] },
  ],
};
