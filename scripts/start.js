'use strict';

// Startet die App über Electron Forge. Entfernt vorher ELECTRON_RUN_AS_NODE:
// Ist diese Variable gesetzt (z. B. von VS Code geerbt), läuft Electron als reines Node ohne Fenster (siehe error.md #2).
const path = require('node:path');
const { spawn } = require('node:child_process');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const forgeCli = path.join(path.dirname(require.resolve('@electron-forge/cli/package.json')), 'dist', 'electron-forge.js');
const extra = process.argv.slice(2);
const args = [forgeCli, 'start', ...(extra.length ? ['--', ...extra] : [])];
const child = spawn(process.execPath, args, { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
