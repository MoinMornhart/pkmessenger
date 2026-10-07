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

## #5 – Paket-Prüfung zeigte fälschlich „keine verbotenen Inhalte“ (Prüfmethode fehlerhaft)

1. **Datum & Uhrzeit:** 06.10.2026, ca. 19:50
2. **Was passiert ist:** Die erste Prüfung des gebauten Pakets (`asar list … | grep -E "\.env$|/tests/|…"`) meldete „keine“. Die Pfade in der asar-Liste nutzen unter Windows aber `\` statt `/`. Das Muster `/tests/` konnte also gar nicht treffen. Die Aussage war **nicht belastbar**.
3. **Reproduzierbar:** immer unter Windows.
4. **Ursache:** Falsche Annahme über das Pfadtrennzeichen in der Ausgabe von `@electron/asar list`.
5. **Lösung:** Prüfskript in Node geschrieben, das `\` zu `/` normalisiert und eigene Dateien, verbotene Inhalte und Dev-Pakete getrennt auflistet (Skript im Scratchpad, Logik in AGENTS.md §7 beschrieben).
6. **Testergebnis:** „Dateien gesamt: 3166 · Verbotene Inhalte: keine · Dev-Pakete im Paket: keine“. Die eigene Dateiliste wurde einzeln geprüft (nur build/renderer, src/main ohne demo/screenshots, src/preload, src/shared, package.json, forge.config.js).
7. **Prävention:** Eine Prüfung auf „nichts gefunden“ erst glauben, nachdem sie einmal nachweislich etwas finden **kann** (Positivkontrolle).

---

## #6 – Test-Fehler: Float32-Rundung im Audio-Frame-Test

1. **Datum & Uhrzeit:** 06.10.2026, ca. 20:05
2. **Was passiert ist:** `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: actual: 0.9599999785423279, expected: 0.96`
3. **Reproduzierbar:** immer.
4. **Ursache:** Fehler im **Test**, nicht in der Logik. Ein `Float32Array` speichert 0,96 als 0,9599999785…; der Test hatte mit einer 64-Bit-Zahl verglichen.
5. **Lösung:** Erwartungswert mit `Math.fround()` auf Float32 gerundet (`tests/test-f17-audio.js`).
6. **Testergebnis:** `test-f17-audio.js`: 5/5 bestanden.
7. **Prävention:** Werte aus typisierten Float32-Arrays immer mit `Math.fround` vergleichen.

---

## #7 – Automatischer Screenshot-Lauf brach ab („Cannot read properties of null (reading 'focus')“)

1. **Datum & Uhrzeit:** 06.10.2026, ca. 20:12
2. **Was passiert ist:** `[screenshots] Fehler: Error: Script failed to execute …`; die Oberfläche meldete wörtlich `Uncaught TypeError: Cannot read properties of null (reading 'focus')`. Außerdem kam die Warnung `The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.`
3. **Reproduzierbar:** immer, wenn der vorige Lauf in einem Sprachkanal endete.
4. **Ursache (geprüft):** Die App merkt sich den letzten Chat (`settings-dev-demo.json`). Der vorige Lauf endete im Sprachkanal „Lounge“, daher startete der neue Lauf in der Anruf-Ansicht. Dort gibt es kein Eingabefeld, und das Testskript fand `.composer textarea` nicht. `frame-ancestors` wird in `<meta>`-CSP grundsätzlich ignoriert.
5. **Lösung:** Das Testskript öffnet zuerst immer #allgemein (`src/main/screenshots.js`). `frame-ancestors` wurde aus `src/renderer/index.html` entfernt (für Electron-Fenster ohnehin bedeutungslos). Fehler der Oberfläche werden im Testlauf jetzt ins Terminal geschrieben (`src/main/main.js`, nur bei `--screenshots`).
6. **Testergebnis:** Erneuter Lauf: 11 Screenshots, keine Fehler und keine Warnungen der Oberfläche; Sprach-E2E: `{"encoded":151,"decoded":145,"played":145} | Main: {"micPackets":151,"echoedPackets":151}`.
7. **Prävention:** Automatische Tests setzen ihren Startzustand selbst und verlassen sich nicht auf gespeicherte Einstellungen.

---

## #8 – Git-Branch plötzlich „leer“ (iCloud-Sync-Konflikt in .git)

1. **Datum & Uhrzeit:** 06.10.2026, ca. 22:20 (stündlicher Issue-Lauf)
2. **Was passiert ist:** `git pull --rebase` meldete wörtlich `fatal: Updating an unborn branch with changes added to the index.` und `fatal: your current branch 'main' does not have any commits yet`. `git status`: `## No commits yet on main...origin/main [gone]`.
3. **Reproduzierbar:** einmalig, kann bei iCloud-Synchronisation jederzeit wieder auftreten.
4. **Ursache (geprüft):** In `.git/refs/heads/` lag statt `main` eine Datei **`main 2`**, so benennt iCloud Drive Dateien bei Sync-Konflikten. Ohne `refs/heads/main` hält Git den Branch für leer. Der Inhalt von `main 2` war korrekt (`5c16022…`), alle Objekte vorhanden, `origin/main` identisch.
5. **Lösung:** `main 2` gesichert (Scratchpad), dann `git update-ref refs/heads/main 5c160229…` und `main 2` entfernt. Keine Daten verloren, nichts überschrieben.
6. **Testergebnis:** `git status -sb` → `## main...origin/main`; `git log` zeigt 5c16022/2680646/5ea6faa; `git fsck --no-dangling` ohne Fehler.
8. **Wiederholt am 07.10.2026, ca. 01:41:** Diesmal war `.git/refs/remotes/origin/main` zu `main 2` umbenannt. Wörtlich: `fatal: bad object refs/remotes/origin/main 2` und `error: https://github.com/Morni-Team/pkmessenger.git did not send all necessary objects`. Gleiche Reparatur (`git update-ref refs/remotes/origin/main 9ab2d34…`, Duplikat gesichert und entfernt). Danach `git fetch` ok, `fsck` ohne Fehler. **Das bestätigt, dass das Problem bei iCloud liegt und wiederkehrt.**
7. **Prävention:** Das Projekt liegt im iCloud-Ordner, und iCloud verträgt sich schlecht mit `.git` und `node_modules`. **Empfehlung an den Nutzer:** das Projekt in einen Ordner außerhalb von iCloud verschieben (z. B. `C:\Projekte\PKMessenger`), da GitHub ohnehin die Sicherung ist. Bis dahin vor jedem Lauf prüfen: `find .git -name "* 2*"`.

---

## Hinweis (kein Fehler): „NativeCommandError“ beim Renderer-Build in PowerShell

esbuild schreibt seine normale Erfolgsmeldung (`build\renderer\app.js 276.3kb … Done`) auf stderr. Windows PowerShell 5.1 zeigt das rot als `NativeCommandError` an, obwohl der Build erfolgreich war (Exit-Code 0). Kein Handlungsbedarf.
