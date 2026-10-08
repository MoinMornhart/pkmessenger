#!/usr/bin/env bash
# Emulator-Test der Android-App (CI, Issue #56): Demo-APK installieren, starten, der eingebaute Autoplay klickt sich
# durch; hier entstehen Screenshots in festen Abständen. Am Ende muss im Protokoll „ERGEBNIS OK“ stehen.
set -euo pipefail
OUT=android-test
APK=mobile/android/app/build/outputs/apk/debug/app-debug.apk
PKG=io.github.morniteam.pkmessenger
mkdir -p "$OUT"

adb install -r "$APK"
adb logcat -c
adb shell am start -n "$PKG/.MainActivity"
shot() { adb exec-out screencap -p > "$OUT/$1.png"; echo "Bild: $1"; }

# Takt passend zu src/mobile/dev-autoplay.js (App-Start im Emulator dauert ein paar Sekunden)
sleep 12; shot 01-chatliste
sleep 9;  shot 02-chat
sleep 7;  shot 03-gesendet
sleep 6;  shot 04-menue
sleep 9;  shot 05-einstellungen
sleep 3

adb logcat -d > "$OUT/logcat.txt" || true
grep -a "pk-autoplay" "$OUT/logcat.txt" | tee "$OUT/autoplay.txt" || true
# WebView-Version (für die Fehlersuche)
adb shell dumpsys package com.google.android.webview | grep -m1 versionName | tee -a "$OUT/autoplay.txt" || true

# Netzweg (error.md #26): Anfragen müssen Capacitors nativen HTTP-Weg erreichen und dürfen nie von der CSP blockiert werden
if grep -aq "Refused to connect" "$OUT/logcat.txt"; then
  echo "::error::CSP blockiert Verbindungen:"; grep -a "Refused to connect" "$OUT/logcat.txt" | head -3; exit 1
fi
if ! grep -aq "Handling CapacitorHttp request: https://localhost/_capacitor_http_interceptor_?u=https%3A%2F%2Fapi.github.com" "$OUT/logcat.txt"; then
  echo "::error::Die Update-Abfrage hat Capacitors nativen HTTP-Weg nicht erreicht"; exit 1
fi
echo "✔ Netzweg: Anfrage an GitHub lief über CapacitorHttp, nichts blockiert"

if grep -aq "ERGEBNIS OK" "$OUT/autoplay.txt"; then
  echo "✔ Android-Emulator-Test bestanden"
else
  echo "::error::Android-Emulator-Test fehlgeschlagen – siehe Artefakt android-test (Screenshots + autoplay.txt)"
  exit 1
fi
