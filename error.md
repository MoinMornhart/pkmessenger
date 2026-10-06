# error.md – Fehler-Lernprotokoll PKMessenger

> Jeder Fehler bekommt einen nummerierten Eintrag. Einträge werden **nie gelöscht**.
> Zu Beginn jeder Session lesen und die Lehren aktiv anwenden.

---

## #1 – package.json: Umlaute zerstört nach PowerShell-Ersetzung

1. **Datum & Uhrzeit:** 06.10.2026, ca. 19:00
2. **Was passiert ist:** Nach `(Get-Content package.json -Raw) -replace ... | Set-Content package.json -Encoding utf8` stand in der Beschreibung wörtlich: `PKMessenger â€“ Bot-Control-Center fÃ¼r Discord Ã¼ber die offizielle Bot-API`.
3. **Reproduzierbar:** immer (Windows PowerShell 5.1).
4. **Ursache:** Windows PowerShell 5.1 liest Dateien mit `Get-Content` standardmäßig in der ANSI-Codepage (nicht UTF-8) und schreibt mit `-Encoding utf8` ein BOM. UTF-8-Umlaute wurden dadurch doppelt kodiert.
5. **Lösung:** package.json komplett neu und korrekt geschrieben. Für spätere Ersetzungen `[IO.File]::ReadAllText/WriteAllText` mit `UTF8Encoding($false)` (UTF-8 ohne BOM) verwendet. Geänderte Datei: `package.json`.
6. **Testergebnis:** `head -c 3 package.json | od -c` → `{ \n` (kein BOM); `node -e "console.log(require('./package.json').description)"` → `PKMessenger – Bot-Control-Center für Discord über die offizielle Bot-API`.
7. **Prävention:** In PowerShell 5.1 niemals `Get-Content | Set-Content` für Textdateien mit Umlauten. Stattdessen Edit-Tool oder .NET-API mit UTF-8 ohne BOM.

---

## #2 – Electron startet ohne Fenster: `app` ist undefined

1. **Datum & Uhrzeit:** 06.10.2026, ca. 19:18
2. **Was passiert ist:** `npx electron . --demo` brach ab mit:
   ```
   TypeError: Cannot read properties of undefined (reading 'requestSingleInstanceLock')
       at Object.<anonymous> (...\src\main\main.js:15:10)
   ```
3. **Reproduzierbar:** immer, wenn die Umgebungsvariable gesetzt ist.
4. **Ursache (geprüft):** `echo $ELECTRON_RUN_AS_NODE` → `1`. Die Variable wird hier von VS Code (Extension-Host) an Unterprozesse vererbt. Mit ihr läuft Electron als reines Node.js – das `electron`-Modul liefert dann kein `app`-Objekt.
5. **Lösung:** Neues Startskript `scripts/start.js` entfernt `ELECTRON_RUN_AS_NODE` und startet die Forge-CLI direkt mit `process.execPath` (ohne Shell, keine DEP0190-Warnung). `npm start` und `npm run demo` nutzen jetzt dieses Skript. Geänderte Dateien: `scripts/start.js`, `package.json`.
6. **Testergebnis:** Mit gesetzter Variable (`ELECTRON_RUN_AS_NODE=1`) lief `npm run demo -- --screenshots=...` vollständig durch, alle 8 Screenshots gespeichert.
7. **Prävention:** App immer über `npm start` / `npm run demo` starten, nicht über `npx electron .`.

---

## #3 – Demo: gesendete Nachricht unsichtbar (Fehler im Test-Fake, nicht in der App)

1. **Datum & Uhrzeit:** 06.10.2026, ca. 19:20
2. **Was passiert ist:** Auf dem Screenshot `09-gesendet.png` fehlte die gerade gesendete Nachricht „Hallo aus PKMessenger 👋“ am Ende der Liste.
3. **Reproduzierbar:** immer im Demo-Modus.
4. **Ursache (geprüft):** Der Fake-Kanal in `tests/helpers/fake-discord.js` vergab gesendeten Nachrichten die IDs `900000000000000001…`, die Demo-Nachrichten hatten aber `1000000000000000xxx`. Die App sortiert korrekt nach Snowflake-ID → die neue Nachricht landete ganz **oben**. Echte Discord-IDs sind zeitbasiert und steigen monoton – in der echten App tritt das nicht auf.
5. **Lösung:** Fake und Demo erzeugen jetzt echte zeitbasierte IDs mit `SnowflakeUtil.generate()` aus discord.js. Geänderte Dateien: `tests/helpers/fake-discord.js`, `src/main/demo.js`.
6. **Testergebnis:** Neuer Screenshot `09-gesendet.png` zeigt „PKBot BOT Heute um 19:22 – Hallo aus PKMessenger 👋“ als letzte Nachricht. `npm test`: 63/63 bestanden.
7. **Prävention:** Test-Daten müssen die Invarianten der echten API einhalten (hier: monoton steigende Snowflakes).

---

## #4 – npm 11 blockiert Installationsskripte (Warnung)

1. **Datum & Uhrzeit:** 06.10.2026, ca. 18:45
2. **Was passiert ist:** Bei `npm install` erschien wörtlich: `npm warn allow-scripts 2 packages have install scripts not yet covered by allowScripts: esbuild@0.28.2 (postinstall: node install.js) electron-winstaller@5.4.4 (install: node ./script/select-7z-arch.js)`.
3. **Reproduzierbar:** immer bei frischer Installation mit npm 11.17.
4. **Ursache:** npm 11 führt Install-Skripte nur noch für ausdrücklich freigegebene Pakete aus (Supply-Chain-Schutz).
5. **Lösung:** `npm approve-scripts esbuild electron-winstaller` → Eintrag `allowScripts` in `package.json`, danach `npm rebuild`.
6. **Testergebnis:** `npx esbuild --version` → `0.28.2`; Electron-Binary geladen (`process.versions.electron` = `44.5.1`).
7. **Prävention:** Neue Pakete mit Install-Skripten bewusst prüfen und nur bekannte freigeben.

---

## Hinweis (kein Fehler): „NativeCommandError“ beim Renderer-Build in PowerShell

esbuild schreibt seine normale Erfolgsmeldung (`build\renderer\app.js 276.3kb … Done`) auf stderr. Windows PowerShell 5.1 zeigt das rot als `NativeCommandError` an, obwohl der Build erfolgreich war (Exit-Code 0). Kein Handlungsbedarf.
