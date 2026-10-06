'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

const ENV_TEMPLATE =
  '# PKMessenger – Bot-Token\n' +
  '# Token aus https://discord.com/developers/applications → deine App → Bot → "Reset Token".\n' +
  '# NIEMALS teilen, committen oder screenshotten. Bei Leak sofort neu generieren.\n' +
  'DISCORD_TOKEN=\n';

const PLACEHOLDERS = new Set(['', 'dein_token_hier', 'your_token_here', 'xxx', 'token']);

/**
 * Liest DISCORD_TOKEN aus einer .env-Datei. Der Token wird NICHT in process.env geschrieben,
 * damit er nicht versehentlich an Kindprozesse weitergereicht wird.
 * Rückgabe: { status: 'ok', token } | { status: 'missing-file' | 'missing-token' | 'invalid-format', ... }
 */
function loadToken(envPath) {
  let raw;
  try {
    raw = fs.readFileSync(envPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { status: 'missing-file' };
    return { status: 'read-error', detail: err.code || err.message };
  }
  let parsed;
  try {
    parsed = parseEnv(raw.replace(/^﻿/, ''));
  } catch {
    return { status: 'invalid-format' };
  }
  const token = (parsed.DISCORD_TOKEN || '').trim().replace(/^Bot\s+/i, '');
  if (PLACEHOLDERS.has(token.toLowerCase())) return { status: 'missing-token' };
  if (!isPlausibleBotToken(token)) return { status: 'invalid-format' };
  return { status: 'ok', token };
}

/**
 * Formale Prüfung (kein Beweis, dass der Token gültig ist – das entscheidet nur Discord beim Login).
 * Bot-Tokens bestehen aus drei Base64url-Teilen, getrennt durch Punkte; Teil 1 ist die Bot-User-ID in Base64.
 */
function isPlausibleBotToken(token) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return false;
  if (parts[0].length < 16 || parts[1].length < 4 || parts[2].length < 20) return false;
  return /^\d{17,20}$/.test(botIdFromToken(token) || '');
}

function botIdFromToken(token) {
  try {
    return Buffer.from(token.split('.')[0], 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

function ensureEnvFile(envPath) {
  if (fs.existsSync(envPath)) return false;
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, ENV_TEMPLATE, { encoding: 'utf8', flag: 'wx' });
  return true;
}

module.exports = { loadToken, isPlausibleBotToken, botIdFromToken, ensureEnvFile, ENV_TEMPLATE };
