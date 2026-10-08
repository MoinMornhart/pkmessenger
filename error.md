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
9. **Drittes Mal am 07.10.2026 (nächster Stundenlauf):** erneut `refs/heads/main` → `main 2` (`fatal: your current branch 'main' does not have any commits yet`). Inhalt korrekt (`028f971…`), gleiche Reparatur, `fsck` ok. Ohne Umzug aus iCloud wird das bei fast jedem Lauf wieder passieren.
10. **Viertes Mal am 07.10.2026, ca. 08:27 – jetzt auch Quellcode:** `src/renderer/api.js` hieß plötzlich `api 2.js`. Der Renderer-Build scheiterte wörtlich mit `X [ERROR] Could not resolve "./api"` (11 Fehler), und `git status` zeigte `D src/renderer/api.js` + `?? "src/renderer/api 2.js"`. Inhalt geprüft (enthält die letzte Änderung `invitePreview`), zurückbenannt, Build ok. **Gefahr:** Ohne Prüfung wäre eine gelöschte `api.js` committet worden. **Ab jetzt vor jedem Commit:** `find . -path ./node_modules -prune -o -name "* 2*" -print` muss leer sein.
11. **Fünftes Mal am 07.10.2026, ca. 19:35:** `AGENTS.md` → `AGENTS 2.md` und `src/renderer/App.jsx` → `App 2.jsx` (git: `D AGENTS.md`, `D src/renderer/App.jsx`). Inhalt mit HEAD verglichen (`diff --strip-trailing-cr`): identisch, nur Zeilenenden. Gesichert (Scratchpad), zurückbenannt, `git status` sauber. Nichts verloren.
12. **Sechstes Mal am 07.10.2026, ca. 22:10:** `.git/config` → `.git/config 2` (git meldete keine Remotes/Branches mehr). Inhalt geprüft (origin = Morni-Team/pkmessenger, Branch-Einträge), zurückbenannt, `git fetch` wieder ok. Nichts verloren.
7. **Prävention:** Das Projekt liegt im iCloud-Ordner, und iCloud verträgt sich schlecht mit `.git` und `node_modules`. **Empfehlung an den Nutzer:** das Projekt in einen Ordner außerhalb von iCloud verschieben (z. B. `C:\Projekte\PKMessenger`), da GitHub ohnehin die Sicherung ist. Bis dahin vor jedem Lauf prüfen: `find .git -name "* 2*"`.

---

## #9 – Layout lief über das Fenster hinaus (ganze App verschoben)

1. **Datum & Uhrzeit:** 07.10.2026, ca. 08:55
2. **Was passiert ist:** Auf dem Screenshot fehlte die obere Leiste, die App war nach oben verrutscht. Die neue Layout-Prüfung meldete wörtlich `[layout] Seite verschoben? {"html":0,"body":108.66666412353516,"root":0}` und die Höhen `{"fenster":715,"body":869,"layout":715,"chat":869,"liste":869,"rail":869}`.
3. **Reproduzierbar:** immer, sobald die Chat-Liste höher als das Fenster wird (viele Kanäle).
4. **Ursache (geprüft):** (a) Das Raster `.layout` hatte keine feste Zeilenhöhe, die Zeile wuchs mit dem Inhalt (Grid-Standard `min-height: auto`). (b) Der Sprung zur Nachricht nutzte `scrollIntoView`, das auch die eigentlich feste Seite scrollt.
5. **Lösung:** `grid-template-rows: minmax(0, 1fr)` + `min-height: 0` für Rail/Liste/Chat; `body { overflow: clip }`; Sprung scrollt nur noch die Nachrichtenliste (`box.scrollTo`). Dateien: `src/renderer/styles.css`, `src/renderer/components/MessageList.jsx`. Dazu eine automatische Layout-Prüfung im Screenshot-Lauf.
6. **Testergebnis:** `{"html":0,"body":0,"root":0}` und alle Höhen = 715 (Fensterhöhe).
7. **Prävention:** Die Layout-Prüfung läuft jetzt bei jedem Screenshot-Lauf mit.

---

## #10 – Screenshot-Lauf hing ohne Ausgabe (Syntaxfehler im Testskript)

1. **Datum & Uhrzeit:** 07.10.2026, ca. 08:45
2. **Was passiert ist:** Electron lief bis zum Timeout (Exit-Code 124) ohne jede Ausgabe und ohne Screenshots. `node --check src/main/screenshots.js` zeigte eine doppelt deklarierte Variable `const after`.
3. **Reproduzierbar:** immer.
4. **Ursache:** Syntaxfehler im **Testskript** (nicht in der App). Electron zeigt Fehler im Hauptprozess als Dialogfenster, der Lauf wartete deshalb unsichtbar auf eine Bestätigung.
5. **Lösung:** Variable umbenannt (`afterActions`).
6. **Testergebnis:** Lauf vollständig, 17 Screenshots.
7. **Prävention:** Vor jedem Electron-Lauf `node --check` auf die Main-Dateien.

---

## #11 – Regex-Backslashes beim Einfügen über die Shell verloren

1. **Datum & Uhrzeit:** 07.10.2026, ca. 09:00
2. **Was passiert ist:** Der Test meldete wörtlich `rohe Mention-Codes werden lesbar` mit `+ 'Release morgen <@&333333333333333301> in <#444444444444444401>'`.
3. **Ursache (geprüft):** Beim Einfügen per `node -e` in der Shell wurde `\d` zu `d`, die Regex suchte also nach dem Buchstaben „d“.
4. **Lösung:** Regex mit dem Edit-Werkzeug korrigiert (`src/main/discord.js`, `readableMentions`).
5. **Testergebnis:** 129/129 Tests grün.
6. **Prävention:** Code mit Backslashes nicht über Shell-Strings einfügen, sondern mit dem Edit-Werkzeug. Gut, dass ein Test die Ausgabe prüft.

---

## Hinweis (kein Fehler): „NativeCommandError“ beim Renderer-Build in PowerShell

esbuild schreibt seine normale Erfolgsmeldung (`build\renderer\app.js 276.3kb … Done`) auf stderr. Windows PowerShell 5.1 zeigt das rot als `NativeCommandError` an, obwohl der Build erfolgreich war (Exit-Code 0). Kein Handlungsbedarf.

---

## #12 – Spitznamen-Feld verschwand nach „Profil speichern“

1. **Datum & Uhrzeit:** 07.10.2026
2. **Was passiert ist:** Im automatischen Demo-Lauf zählte die Prüfung nach dem Speichern nur noch 2 statt 3 Profilfelder (`[profil] {"felder":2,…}`).
3. **Ursache (geprüft):** `updateProfile` lädt das Profil danach mit der Server-ID aus der Anfrage neu. Die Oberfläche schickte die Server-ID nur mit, wenn sich der Spitzname geändert hatte. Ohne Server-ID fehlte im Ergebnis `server`, und das Feld verschwand.
4. **Lösung:** Die Oberfläche schickt die Server-ID immer mit (`SettingsDialog.jsx`), dazu kommt ein Regressionstest in `tests/test-profile.js`.
5. **Testergebnis:** Demo-Lauf `{"felder":3,…}`, Tests grün.
6. **Prävention:** Nach Speichern-Aktionen im Screenshot-Lauf den Zustand erneut prüfen, nicht nur die Erfolgsmeldung.

---

## #13 – Aktionsleiste verdeckte den Namen über kurzen Nachrichten

1. **Datum & Uhrzeit:** 07.10.2026
2. **Was passiert ist:** Auf JoniMonis Screenshot (Issue #1) fehlte über einer kurzen Nachricht „die Überschrift“ (Name des Absenders).
3. **Ursache (geprüft):** Die Aktionsleiste (↩ 😊 🧵 📌 🗑) lag beim Drüberfahren mit `top: -16px` **über** der Blase. Ist die Blase schmaler als die Leiste, deckt sie den Namen komplett zu.
4. **Lösung:** Die Leiste sitzt jetzt **neben** der Blase (`left/right: calc(100% + 6px)`). Der Screenshot-Lauf misst die Überlappung (`[ui] Name neben Aktionsleiste: frei`).
5. **Testergebnis:** Demo-Lauf „frei“, 142/142 Tests grün.
6. **Prävention:** Neue Overlays im Screenshot-Lauf per `getBoundingClientRect` auf Überlappung prüfen.

Nebenbei: iCloud hat erneut eine Datei umbenannt (`SettingsDialog.jsx` → `SettingsDialog 2.jsx`, Build schlug fehl) und beim Einfügen per `node -e` ging wieder ein `\d` verloren (#11). Beides vor dem Commit bemerkt und behoben.

---

## #14 – Eigene Hinweise bei Eingabefehlern kamen nie in der Oberfläche an

1. **Datum & Uhrzeit:** 07.10.2026
2. **Was passiert ist:** Beim Bau der KI-Agenten aufgefallen. `describeError` gab bei `code: 'VALIDATION'` immer den Standardhinweis „Eingabe prüfen …“ zurück. Der eigene Hinweis beim Bot-Profil („Name vergeben oder zu oft geändert, max. 2× pro Stunde“) ging dadurch verloren.
3. **Ursache (geprüft):** `src/main/errors.js` hat `err.hint` bei VALIDATION ignoriert. Der Test in `test-profile.js` prüfte den Fehler direkt am Service, nicht nach der IPC-Übersetzung.
4. **Lösung:** `hint: err.hint || 'Eingabe prüfen …'`, dazu ein eigener Code `AI` für Meldungen der KI-Agenten. Regressionstest in `test-ai.js`.
5. **Testergebnis:** 156/156 Tests grün.
6. **Prävention:** Fehlermeldungen immer auch nach `describeError` prüfen (so, wie sie die Oberfläche sieht).

Nebenbei (nur Testumgebung): Der Screenshot-Lauf schaltete die KI-Beta beim zweiten Lauf versehentlich **aus**, weil `settings-dev-demo.json` den Zustand vom letzten Lauf behielt („Illegal invocation“ beim Ausfüllen eines nicht mehr vorhandenen Feldes). Der Lauf setzt jetzt KI-Beta, Privatchats und Bildschirmschutz beim Start zurück.

---

## #15 – Systemnachrichten und Umfragen erschienen leer

1. **Datum & Uhrzeit:** 07.10.2026
2. **Was passiert ist:** JoniMoni: „Stelle sicher, dass Systemnachrichten erkannt werden“. Beitritte, Boosts, Pins usw. erschienen als leere Sprechblase. Beim Prüfen fiel außerdem auf, dass in der Chatliste bei einer Umfrage als letzter Nachricht nur „✓ …“ stand.
3. **Ursache (geprüft):** Discord schickt für Systemnachrichten meist **keinen Text**, nur einen Nachrichtentyp (`type`, z. B. 7 = Beitritt). Die App hat den Typ nicht übertragen und alles als normale Nachricht gezeichnet. Für Umfragen und Embeds ohne Text gab es keinen Vorschautext.
4. **Lösung:** `src/shared/system-messages.js` übersetzt alle Typen aus der Discord-Doku ins Deutsche (mit Fallback für künftige Typen). Systemnachrichten erscheinen mittig als Hinweis, trennen die Gruppierung und haben eine Vorschau. Umfragen zeigen in der Vorschau „📊 Frage“, Embeds „▤ Titel“.
5. **Testergebnis:** `tests/test-system-messages.js` (6 Tests), insgesamt 162/162 grün. Demo: Beitritt und Boost sichtbar.
6. **Prävention:** Neue Nachrichtenarten (Umfrage, Embed, System) immer auch in der Chat-Vorschau prüfen.

---

## #16 – Styles der Systemnachrichten beim Zusammenführen verloren

1. **Datum & Uhrzeit:** 07.10.2026, ca. 12:40
2. **Was passiert ist:** Nach dem Zusammenführen von PR #2, #3 und #4 fehlte in `main` der CSS-Block `.msg--system`/`.sysmsg`. Systemnachrichten erschienen ungestylt und linksbündig.
3. **Ursache (geprüft):** Alle PRs hängten Styles **ans Ende** von `styles.css` an. Beim Lösen des Konflikts im Merge-Commit `fde896e` (PR #4, auf GitHub) blieb nur einer der beiden Blöcke übrig. Ähnlich beim Nachziehen von `main` in PR #5: Git behandelte eine schließende `}` als gemeinsame Zeile, sodass `@keyframes send-fly` offen blieb (esbuild-Warnung).
4. **Lösung:** Block aus Commit `7e5c72e` wiederhergestellt (eigener PR, da #5 schon vor der Reparatur zusammengeführt wurde). Die Klammer hatte JoniMoni beim Zusammenführen bereits richtig gesetzt.
5. **Testergebnis:** Build ohne Warnungen, 169/169 Tests grün, Demo: Systemnachrichten, KI-Antwort und Designs sichtbar.
6. **Prävention:** Nach jedem Konflikt in `styles.css` den Build auf CSS-Warnungen prüfen und nach den Klassen aller beteiligten PRs suchen (`grep -c`). Neue Styles künftig thematisch einsortieren statt immer ans Dateiende.

---

## #17 – Styles des KI-Antwort-Agenten beim Zusammenführen verloren (zweiter Fall)

1. **Datum & Uhrzeit:** 07.10.2026, ca. 13:20 (beim Vorbereiten von v0.4.0 gefunden)
2. **Was passiert ist:** Der Block `.ai-channels`, `.ai-chip(s)`, `.ai-suggest`, `.ai-recent` fehlte in `main`. Kanal-Häkchen und Personen-Chips im Bereich „Auf Erwähnungen antworten“ waren dadurch ungestylt.
3. **Ursache (geprüft):** Wie bei #16 war es eine Konfliktlösung am Ende von `styles.css`, diesmal im Merge-Commit `af838c3` (main → PR #5). Gefunden per `git show <commit>:src/renderer/styles.css | grep -c ai-channels` über die Merge-Kette.
4. **Lösung:** Block aus `77776dc` wiederhergestellt. **Neu: `tests/test-css-classes.js`** prüft, dass jede feste CSS-Klasse der Komponenten in `styles.css` vorkommt. Gegenprobe: Ohne die Wiederherstellung meldet der Test genau die 6 fehlenden Klassen.
5. **Testergebnis:** 170/170 Tests grün, kompletter Demo-Lauf ohne Fehler.
6. **Prävention:** Der neue Test läuft bei `npm test` und damit auch im Release-Workflow. Verlorene Styles verhindern so ein Release.

---

## #18 – „Ich drücke nach Updates suchen, aber die App sagt nichts“ (JoniMoni)

1. **Datum & Uhrzeit:** 07.10.2026, 13:30–13:45
2. **Was passiert ist:** Nach dem Release v0.4.0 meldete JoniMoni, dass sich kein Update lädt und der Knopf keine Reaktion zeigt.
3. **Ursache (geprüft):**
   - Das Release war korrekt (alle 4 Dateien, RELEASES zeigt auf 0.4.0). **update.electronjs.org lieferte aber bis ca. 5 Minuten nach der Veröffentlichung noch 0.3.0 aus** (Cache). JoniMonis Versuche lagen genau in diesem Zeitraum.
   - Die Oberfläche gab **keine Rückmeldung**: rohe Zustandswörter („checking“, „error“), Fehlermeldungen wurden nie angezeigt, der Knopf meldete kein Ergebnis.
   - Nach der Installation wurde beim ersten Start gar nicht geprüft (`--squirrel-firstrun`), danach nur alle 6 Std.
   - Die ZIP-Version (entpackt statt installiert) kann sich ohne Squirrel nicht aktualisieren, die App sagte das aber nicht.
   - JoniMonis Vermutung „`e` statt `err` im Fehlerhandler“ stimmte nicht (geprüft: `err` korrekt).
4. **Lösung:** `UpdateSection.jsx` mit deutschem Status, „geprüft um …“, Fehlertext und Hinweis, Knopf „Suche …“ plus Ergebnis-Hinweis (oder „keine Antwort“ nach 45 s), „Jetzt neu starten und installieren“. Updater: alle 15 Min. (Wunsch JoniMoni), erster Start prüft nach 60 s, ZIP-Version wird erkannt (fehlende `Update.exe`) und erklärt, keine Doppelprüfung während der Suche. Die Demo hat einen simulierten Updater (Screenshot 31).
5. **Testergebnis:** Updater-Tests 9/9 (3 neu), Demo: `{"waehrend":"Suche …","status":"… Du hast die neueste Version ✓ · geprüft um 13:42","hinweis":"Kein Update nötig ✓ …"}`.
6. **Prävention:** Nach einem Release mit `curl https://update.electronjs.org/<repo>/win32-x64/<alte Version>/RELEASES` prüfen, ob der Dienst die neue Version liefert, bevor man „Update ist da“ meldet.

---

## #19 – Git-Index verschwunden, alle Dateien „gelöscht“ vorgemerkt (iCloud)

1. **Datum & Uhrzeit:** 07.10.2026, 13:47
2. **Was passiert ist:** Nach einem `git pull` meldete Git `index.lock: File exists`, und `git status` zeigte alle 145 Dateien als gelöscht vorgemerkt. Die Dateien im Arbeitsordner waren unversehrt.
3. **Ursache (geprüft):** Kein Git-Prozess lief mehr, die Sperre stammte vom abgebrochenen Pull. Die eigentliche `.git/index` fehlte ganz. Vermutlich hat iCloud Drive die Datei beim atomaren Umbenennen (`index.lock` → `index`) gestört, wie bei den „* 2“-Duplikaten (#8).
4. **Lösung:** `index.lock`, `HEAD` und `ORIG_HEAD` ins Scratchpad gesichert, die Sperre entfernt, `git reset` (baut nur den Index aus HEAD neu, Arbeitsdateien unverändert), dann `git pull --ff-only` und `git fsck` (keine Fehler).
5. **Testergebnis:** Arbeitsordner sauber, Stand = origin/main, alle Tests grün.
6. **Prävention:** Vor Git-Befehlen auf `index.lock` achten. **Dringende Empfehlung bleibt: Projekt aus iCloud Drive herausnehmen** (z. B. `C:\Projekte\PKMessenger`).

---

## #20 – „Nachricht bearbeiten → abbrechen → Nachricht weg“ (JoniMoni)

1. **Datum & Uhrzeit:** 07.10.2026, gemeldet 11:56, behoben ca. 14:30
2. **Was passiert ist:** Laut JoniMoni war nach Bearbeiten + Abbrechen „die Nachricht nicht mehr angezeigt“.
3. **Ursache (geprüft):** Die Nachricht im Verlauf blieb erhalten. Das ist im Demo-Lauf mit × und Esc nachgewiesen. Verloren ging der **eigene Entwurf im Eingabefeld**: Beim Bearbeiten ersetzte der Text der alten Nachricht das Feld, beim Abbrechen/Speichern wurde das Feld geleert. Nachgestellt im Screenshot-Lauf: Feld nach Abbrechen leer statt „Mein Entwurf“.
4. **Lösung:** `Composer.jsx` merkt den Entwurf (Text + eingefügte Erwähnungen) beim Start des Bearbeitens und stellt ihn nach Abbrechen oder Speichern wieder her.
5. **Testergebnis:** Demo: × / Esc / Speichern → Nachricht sichtbar, Feld = „Mein Entwurf“.
6. **Prävention:** Der Screenshot-Lauf prüft das jetzt bei jedem Lauf (`[edit] …`).

---

## #21 – Endlosschleife beim Anzeigen von verschachteltem Markdown (vor Veröffentlichung gefunden)

1. **Datum & Uhrzeit:** 07.10.2026, ca. 14:45 (nur im Branch, nie veröffentlicht)
2. **Was passiert ist:** Nach dem Ausbau der Anzeige (Spoiler, Zitate, Fett mit Inhalt) hing der Demo-Lauf. Es gab keine Screenshot-Ausgabe mehr, nur „Render frame was disposed“.
3. **Ursache (geprüft):** `renderInline` ruft sich für `**fett**`, `||spoiler||` usw. selbst auf. Alle Aufrufe nutzten **dieselbe globale Regex** (`/g`). Der innere Aufruf setzte `lastIndex` auf 0, der äußere fand denselben Treffer immer wieder: Endlosschleife, das Fenster fror ein.
4. **Lösung:** Jeder Aufruf bekommt eine eigene Regex (`new RegExp(INLINE.source, 'g')`).
5. **Testergebnis:** Demo-Lauf vollständig: `/shrug`, Spoiler und Zitat werden angezeigt, Layout ok.
6. **Prävention:** Globale Regex (`/g`) nie in rekursiven Funktionen teilen. Der vollständige Demo-Lauf vor jedem PR hat das abgefangen.

---

## #22 – „api.aiModels is not a function“ (vor Veröffentlichung gefunden)

1. **Datum & Uhrzeit:** 07.10.2026, ca. 16:00 (nur im Branch, nie veröffentlicht)
2. **Was passiert ist:** Die neuen Knöpfe „Modelle laden“ und „Lokale KI suchen“ zeigten im Demo nur eine rote Meldung „C.aiModels is not a function“.
3. **Ursache (geprüft):** Neue Aufrufe müssen an drei Stellen stehen: `ipc.js`, `preload.js` **und** in der Liste in `src/renderer/api.js`. Die dritte Stelle fehlte.
4. **Lösung:** `aiModels` und `aiFindLocal` in `api.js` ergänzt.
5. **Testergebnis:** Demo-Lauf: „2 Modelle gefunden ✓“, „✅ Ollama · 3 Modelle“.
6. **Prävention:** Neuer Test `tests/test-api-sync.js` vergleicht preload.js mit api.js und schlägt fehl, wenn etwas fehlt.

---

## #23 – Übersehene Kommentare + „KI schreibt …“ kam nie an (07.10.2026)

1. **Datum & Uhrzeit:** 07.10.2026, ca. 18:30
2. **Was passiert ist:** (a) Sieben Kommentare von Joni (14:44–15:38: KI-Gedächtnis pro Person, Thinking, Auto-Verbindung, Tippanzeige, Online-Status) wurden in langen Arbeitsläufen nicht gelesen, #29 wurde zu früh geschlossen. (b) Im Branch: Die neue Anzeige „🤖 KI schreibt gerade …“ erschien im Demo nicht.
3. **Ursache (geprüft):** (a) Kommentare nur zu Beginn eines Laufs abgefragt; Joni zitiert oft meine Antwort und schreibt Neues darunter. (b) preload.js lässt nur Ereignisse aus `EVENT_TYPES` durch, `ai:busy` fehlte.
4. **Lösung:** (a) Alle Kommentare seit 14:30 nachgelesen, vollständige Liste an Joni geschickt, Arbeitsregel gespeichert (vor jeder Antwort/jedem Schließen erneut abfragen). (b) `ai:busy` ergänzt.
5. **Testergebnis:** Demo: „🤖 KI schreibt gerade an Anna in #allgemein …“ sichtbar (Bild 60).
6. **Prävention:** Neuer Test in `tests/test-api-sync.js`: jedes `emit('…')` aus src/main muss in `EVENT_TYPES` stehen.

## #24 – Screenshot-Lauf: Fernzugang-Schritt schlug fehl (07.10.2026, vor Veröffentlichung)

- **Symptom:** `[fernzugang] Zwischenablage: [object Promise] · QR da: false`. Bild 73 zeigte „Passwort ist gesetzt“ und Toast „Fernzugang aus“.
- **Ursache:** (1) `clipboard.readText()` lieferte im Screenshot-Code ein Promise und wurde nicht abgewartet. (2) Die Fernzugangs-Einstellungen (Passwort, „an“) blieben aus dem vorigen Demo-Lauf in `settings-dev-demo.json` erhalten; der Schritt schaltete dadurch aus statt ein.
- **Lösung:** `await` + `String(...)`; der Screenshot-Lauf setzt den Store-Schlüssel `remote` wie `appLock` zurück. Lauf danach: `ipSichtbar:false`, `linkHost:"localhost"`, gekoppelt, gesendet.

## #25 – Code-Prüfung 08.10.2026: 8 Funde, alle behoben (v0.12.1)

1. **Link-Schutz umgehbar:** Mittelklick/Umschalt+Klick auf einen Link → `setWindowOpenHandler` öffnete jede http(s)-Adresse ohne Warnung. Jetzt lehnt der Handler immer ab, Links öffnen nur über den Link-Schutz im Renderer.
2. **Dialoge zogen den Fokus zurück:** Fokus + Esc-Listener hingen an `[onClose]`, Workspace übergibt Inline-Funktionen → bei jedem Neuzeichnen (Tippen, Status, jede Minute) wurde neu fokussiert/markiert (Umbenennen, Neue Gruppe, Neuer Privatchat, Smileys, Server beitreten, Rückfrage). Jetzt `closeRef` + Effekt mit `[]`.
3. **Neue Gruppe fand Personen nicht:** Suche lief über alle Server (max. 10) und filterte erst danach nach Servername. Jetzt `searchPeople({ guildId })`.
4. **Sprache ohne `error`-Listener:** Fehler der Verbindung/des Players → halb offene Sitzung mit „verbunden“. Jetzt sauber auflegen + Status „unterbrochen“.
5. **Schneller Kanalwechsel:** abgebrochener Beitritt setzte nach 20 s „Verbindung fehlgeschlagen“, obwohl der neue Kanal verbunden war. Jetzt nur `VOICE_ABORTED` ohne Statuswechsel.
6. **Fernzugangs-Hash in `pk:get-settings`:** Salt/Hash gingen an die Oberfläche. Jetzt entfernt wie `appLock`.
7. **Ursprungsprüfung:** `RENDERER_URL_PREFIX` ohne abschließendes `/` → auch `…/build/renderer-x/` galt als vertrauenswürdig. Jetzt mit `/`.
8. **Kleinigkeiten:** Rechte beim Anlegen in einer Kategorie nach deren Rechten; Geräte-Limit (10) auch beim Koppeln selbst geprüft.

Tests: `test-review-fixes.js`. Nicht geändert: leere Kategorien sind in „Neue Gruppe“ nicht wählbar (Kanalliste liefert nur Kategorien mit sichtbaren Kanälen).

## #26 – v0.13.0: CSP blockierte Capacitors Netzweg; „Das ist neu“ kam nie (08.10.2026)

1. **Android, CSP:** Auf Android schickt Capacitor `fetch` über `https://localhost/_capacitor_http_interceptor_?u=…` (CapacitorHttp). Die CSP erlaubte nur Discord/GitHub direkt → **alle REST-Anfragen der echten App wären blockiert** gewesen. Gefunden im logcat des Emulator-Tests („Refused to connect … _capacitor_http_interceptor_“). Der Demo-Test merkte es nicht, weil das simulierte Discord kein Netz nutzt. **Lösung:** `connect-src 'self'` (v0.13.1); der Emulator-Test prüft jetzt den echten Netzweg (Update-Abfrage bei GitHub). PR #60 wurde von JoniMoni vor dieser Korrektur zusammengeführt → v0.13.0-APK betroffen.
2. **„Das ist neu“ (Joni #44):** `src/renderer/prefs.js` hatte `/^d+.d+.d+$/` statt `/^\d+\.\d+\.\d+$/` (Backslashes beim Patchen per Shell verloren, siehe frühere Escape-Probleme) → gemerkte Version immer verworfen → jeder Start galt als „erster Start“ → Fenster kam nie. Seit v0.10.4 betroffen. **Lösung:** Muster repariert, Test `test-prefs-whatsnew.js`. Projektweit nach weiteren kaputten Mustern gesucht: keine.
- **Vorbeugung:** Patches mit Regex nur noch über Skriptdateien mit `String.raw` (nie `node -e`/Heredoc mit Backslashes).
