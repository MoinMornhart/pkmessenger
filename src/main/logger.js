'use strict';

// Fehlerprotokoll (Issue #1: „mache auch Logging, alles auf Englisch“).
// Nur auf diesem PC: %APPDATA%\PKMessenger\logs\pkmessenger.log (max. 512 KB, dann eine Vorgänger-Datei).
// Es landen NIE Tokens, API-Schlüssel, Passwörter oder Nachrichteninhalte darin – nur technische Fehler.
// Gesendet wird nichts: Einen Fehlerbericht verschickt nur der Mensch selbst (Kopieren → GitHub-Issue).

const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 512 * 1024;
const MAX_LINE = 600;

/** Alles, was wie ein Geheimnis aussieht, unkenntlich machen. */
function scrub(text) {
  return String(text ?? '')
    .replace(/[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,40}/g, '[token]') // Discord-Bot-Token
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, '[key]') // API-Schlüssel (OpenAI, Anthropic …)
    .replace(/\b(Bearer|Bot)\s+[A-Za-z0-9._-]{12,}/gi, '$1 [secret]')
    .replace(/(password|passwort|token|key|secret)(["'\s:=]+)[^\s"',}]+/gi, '$1$2[secret]')
    .replace(/[A-Z]:\\Users\\[^\\\s]+/gi, 'C:\\Users\\[user]') // Windows-Benutzername aus Pfaden
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LINE);
}

function createLogger({ dir, now = () => new Date() }) {
  const file = dir ? path.join(dir, 'pkmessenger.log') : null;
  const memory = []; // letzte Einträge (für den Fehlerbericht, auch wenn die Datei nicht schreibbar ist)

  function write(level, scope, message, extra) {
    const line = `${now().toISOString()} ${level.toUpperCase()} [${scrub(scope).slice(0, 40)}] ${scrub(message)}${extra ? ` | ${scrub(typeof extra === 'string' ? extra : JSON.stringify(extra))}` : ''}`;
    memory.push(line);
    if (memory.length > 200) memory.shift();
    if (!file) return line;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.1`);
      fs.appendFileSync(file, `${line}\n`);
    } catch {
      /* Protokoll darf die App nie stören */
    }
    return line;
  }

  return {
    error: (scope, message, extra) => write('error', scope, message, extra),
    warn: (scope, message, extra) => write('warn', scope, message, extra),
    info: (scope, message, extra) => write('info', scope, message, extra),
    /** Letzte n Zeilen (für den Fehlerbericht). */
    tail: (n = 30) => memory.slice(-n),
    file,
  };
}

/** Fehlerbericht als Text (englisch, ohne Geheimnisse) – wird nur angezeigt/kopiert, nie automatisch gesendet. */
function buildReport({ version, platform, arch, electron, error, where, lines }) {
  return [
    '### PKMessenger error report',
    `- Version: ${version}`,
    `- System: ${platform} ${arch}, Electron ${electron}`,
    `- Where: ${scrub(where || 'unknown')}`,
    `- Error: ${scrub(error || 'unknown')}`,
    '',
    '<details><summary>Last log lines</summary>',
    '',
    '```',
    ...(lines || []).map(scrub),
    '```',
    '</details>',
  ].join('\n');
}

module.exports = { createLogger, buildReport, scrub };
