'use strict';

// Ersatz für src/main/env.js in der Android-App: dort gibt es keine .env-Datei, der Token liegt nur im
// Android-Schlüsselspeicher (siehe platform.js). Format-Prüfung wie auf dem PC.
function botIdFromToken(token) {
  try {
    return Buffer.from(String(token).split('.')[0], 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

function isPlausibleBotToken(token) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return false;
  if (parts[0].length < 16 || parts[1].length < 4 || parts[2].length < 20) return false;
  return /^\d{17,20}$/.test(botIdFromToken(token) || '');
}

const loadToken = () => ({ status: 'missing' });
const ensureEnvFile = () => {};

module.exports = { loadToken, isPlausibleBotToken, botIdFromToken, ensureEnvFile, ENV_TEMPLATE: '' };
