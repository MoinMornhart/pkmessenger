'use strict';

// Windows Hello (Fingerabdruck, Gesicht, PIN) zum Entsperren der App (Issue #29: „Bio statt nur Passwort“).
// Electron hat dafür unter Windows keine eingebaute Funktion. Wir fragen deshalb die Windows-eigene Prüfung
// (Windows.Security.Credentials.UI.UserConsentVerifier) über ein FESTES PowerShell-Skript ab – ohne Nutzereingaben
// im Befehl, ohne Zusatzpakete. Windows zeigt dabei seinen eigenen Hello-Dialog; die App sieht nur „bestätigt“ oder nicht.

const { execFile } = require('node:child_process');

const PRELUDE = [
  "$ErrorActionPreference = 'Stop'",
  '$null = [Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime]',
  'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  "$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1",
  'function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $null = $t.Wait(120000); $t.Result }',
].join('; ');

const SCRIPTS = {
  check: `${PRELUDE}; Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])`,
  verify: `${PRELUDE}; Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync('PKMessenger entsperren')) ([Windows.Security.Credentials.UI.UserConsentVerificationResult])`,
};

function runPowerShell(script, { timeoutMs }) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, timeout: timeoutMs }, (err, stdout) => {
      resolve(err ? '' : String(stdout || '').trim());
    });
  });
}

function createHello({ platform = process.platform, run = runPowerShell } = {}) {
  let cached = null; // Verfügbarkeit ändert sich selten → einmal pro Start prüfen
  let busy = false;

  /** 'Available' | 'DeviceNotPresent' | 'NotConfiguredForUser' | … | 'NotSupported' */
  async function availability() {
    if (platform !== 'win32') return 'NotSupported';
    if (!cached) cached = (await run(SCRIPTS.check, { timeoutMs: 15000 })) || 'Unknown';
    return cached;
  }

  /** true nur, wenn Windows die Person bestätigt hat. */
  async function verify() {
    if (platform !== 'win32' || busy) return false;
    busy = true;
    try {
      return (await run(SCRIPTS.verify, { timeoutMs: 125000 })) === 'Verified';
    } finally {
      busy = false;
    }
  }

  return { availability, verify };
}

const HELLO_TEXT = {
  Available: 'Bereit',
  DeviceNotPresent: 'Kein Fingerabdruck-Leser oder keine Hello-Kamera gefunden',
  NotConfiguredForUser: 'Windows Hello ist für dein Konto nicht eingerichtet (Windows-Einstellungen → Konten → Anmeldeoptionen)',
  DisabledByPolicy: 'Windows Hello ist auf diesem PC per Richtlinie abgeschaltet',
  DeviceBusy: 'Gerät gerade belegt',
  NotSupported: 'Gibt es nur unter Windows',
  Unknown: 'Konnte nicht geprüft werden',
};

module.exports = { createHello, HELLO_TEXT, SCRIPTS };
