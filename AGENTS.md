# AGENTS.md – Projektgedächtnis PKMessenger

> **Jede Session:** zuerst diese Datei und `error.md` lesen. Nach jeder größeren Änderung aktualisieren.
> Kommunikation mit dem Nutzer, UI-Texte und Doku: **ausschließlich Deutsch**. Code/Bezeichner/Dateinamen: Englisch.

## 1. Zweck

PKMessenger ist eine kostenlose Windows-Desktop-App (Electron + discord.js), mit der man Discord **über den eigenen Bot** bedient, ohne den Discord-Client zu öffnen: lesen, schreiben, erwähnen, suchen usw.
Optik: eigener Messenger. Technisch: **Bot-Control-Center**.

## 2. Rechtliche Positionierung (verbindlich)

- Grundlage: Discord Developer Terms of Service und Developer Policy (gültig ab 08.07.2024), Discord ToS (gültig ab 29.09.2025), docs.discord.com/developers.
- **Verboten und nicht umgesetzt:** Self-Bots, User-Tokens, Client-Mods, Nutzer-Imitation, Automatisierung persönlicher Accounts, Spam, Umgehung von Rate-Limits, Scraping außerhalb der API.
- Jede Nachricht geht **als Bot** raus (Bot-Name + BOT-Tag). Die App nennt sich nicht „Discord“, nutzt kein Discord-Logo und keine Discord-Standardavatare. Die UI zeigt „Wird gesendet als <Bot> BOT“.
- Datensparsamkeit: nur Intents `Guilds`, `GuildMessages`, `MessageContent` (privilegiert), `GuildMessageTyping`. **Kein** GuildMembers, **kein** GuildPresences. Keine Cloud, keine Telemetrie. Lokal gespeichert werden nur: letzte Position und Lese-Markierungen (`settings.json`). Der Token liegt nur in `.env`.
- **Auto-Update (seit 06.10.2026, auf Wunsch des Nutzers):** Die installierte App fragt beim Start und alle 6 Stunden `update.electronjs.org` (kostenloser Dienst des Electron-Projekts) nach neuen GitHub-Releases. Übertragen werden nur Repo, Plattform, Architektur und App-Version, keine persönlichen Daten und keine Telemetrie. In der Entwicklung ist das Auto-Update aus.
- **Sprachkanäle (F17, seit 06.10.2026, auf Wunsch des Nutzers: Sprechen + Zuhören):** Der Bot tritt Sprachkanälen bei, und alle hören „<Bot> BOT“. **Anrufe an einzelne Personen, Video und Bildschirm teilen sind mit Bots nicht möglich** und wurden nicht gebaut. Das Empfangen von Ton ist für Bots von Discord **nicht offiziell dokumentiert** (`VoiceReceiver` ist in @discordjs/voice als `@beta` markiert). Es ist in der UI als „experimentell“ gekennzeichnet. **Es wird nichts aufgezeichnet oder gespeichert**, Ton wird nur live durchgereicht. DAVE (Ende-zu-Ende-Verschlüsselung, Pflicht seit 01.03.2026) ist an. Zusätzliches Intent: `GuildVoiceStates` (nicht privilegiert). Einladungslink enthält jetzt „Verbinden“ und „Sprechen“. Mikrofon-Freigabe gilt nur für das eigene App-Fenster und nur für Audio. Das Mikro wird beim Ausschalten vollständig freigegeben.
- Die Optik ist an Messenger-Apps angelehnt (Chat-Liste, Sprechblasen). Es gibt aber **kein** WhatsApp- oder Discord-Branding, sondern eigenes Logo und eigene Farben. Das BOT-Abzeichen und der Hinweis „Wird gesendet als <Bot> BOT“ bleiben Pflicht.
- Skalierung (für privaten Gebrauch irrelevant): Verifizierung ab 100 Servern; Prüfung privilegierter Intents ab 10.000 erreichbaren Nutzern (Regel ab 10.06.2026).

### Entscheidung 06.10.2026: „Über meinen Discord-Account schreiben“ → ABGELEHNT

- **Wunsch des Nutzers:** Die App mit seinem Discord-Account verknüpfen, sodass Nachrichten als er selbst rausgehen.
- **Prüfung:** Die offizielle OAuth2-Doku (docs.discord.com/developers/topics/oauth2) wurde am 06.10.2026 gelesen. Es gibt **keinen** Scope, der Senden in Server-Kanälen im Namen eines Users erlaubt. `messages.read` erlaubt nur Lesen und nur über lokales RPC; `rpc` gibt es nur für freigegebene Partner.
- **Konsequenz:** Möglich wäre es nur mit dem User-Token (Self-Bot). Das ist laut Discord ToS verboten, und dem Account droht die Sperrung. **Wird nicht umgesetzt.**
- **Erlaubte Alternative (F16, optional, wartet auf Zustimmung des Nutzers):** „Mit Discord anmelden“ per OAuth2-Scope `identify`. Die App zeigt dann deinen Namen und Avatar an, Nachrichten gehen weiter als Bot raus, auf Wunsch mit Signatur („— Name via PKMessenger“).

## 3. Architektur

```
src/main/main.js        Electron-Main: Fenster, Sicherheit, IPC-Registrierung, Squirrel-Events, Dev-Schalter
src/main/discord.js     EINZIGE Datei mit discord.js-Logik (Client, Login, Events, Aktionen)
src/main/env.js         .env lesen (Token nie in process.env), Format-Plausibilität, Vorlage anlegen
src/main/validate.js    Validierung aller IPC-Payloads
src/main/errors.js      Fehler → deutsche Meldung + "Was kann ich tun?"-Hinweis
src/main/ipc.js         Kanal-Definitionen, Sender-Prüfung, { ok, data | error }-Hülle
src/main/store.js       settings.json (atomar, verweigert Schlüssel wie "token")
src/main/demo.js        DEMO-Modus (nur Entwicklung, wird nicht paketiert)
src/main/screenshots.js automatische Screenshots (nur Entwicklung, wird nicht paketiert)
src/main/updater.js     Auto-Update (Squirrel + update.electronjs.org), testbar per Dependency Injection
src/main/secrets.js     Token-Tresor (safeStorage/DPAPI → %APPDATA%\PKMessenger\token.enc), .env-Übernahme + sicheres Löschen
src/renderer/prefs.js   Audio-Geräte/Lautstärke (localStorage, keine Geheimnisse); SettingsDialog.jsx, AccessDialog.jsx
src/main/voice.js       EINZIGE Datei mit @discordjs/voice: Beitreten, Opus senden (Mikro), Opus empfangen (Zuhören), Aufräumen
src/renderer/voice/     engine.js (Mikro → AudioWorklet → WebCodecs-Opus-Encoder; Opus-Decoder je Sprecher → Lautsprecher mit Jitter-Puffer),
                        capture-worklet.js, useVoice.js (React-Hook); CallView.jsx = Anruf-Ansicht
Sprach-Datenfluss: Renderer --ipcRenderer.send('pk:voice-packet', Opus 20 ms)--> Main voice.pushPacket → AudioPlayer (StreamType.Opus)
                   Main receiver.subscribe(user) --webContents.send('pk:voice-audio')--> Renderer AudioDecoder → AudioContext
                   Kein FFmpeg, keine nativen Opus-Module nötig (WebCodecs im eingebauten Chromium; aes-256-gcm + @snazzah/davey geprüft)
src/renderer/components ChatList (Messenger-Liste, sortiert nach Aktivität), ChatView/MessageList/MessageItem (Sprechblasen), Composer, …
src/preload/preload.js  contextBridge: schmale benannte API window.api.*
src/shared/*.js         reine, getestete Logik (Mentions, Gruppierung, Zeitformat, Limits, Nachrichtenspeicher)
src/renderer/*          React 19 UI, gebündelt mit esbuild → build/renderer
scripts/                build-renderer.js, start.js (entfernt ELECTRON_RUN_AS_NODE)
tests/                  node:test + assert, Fake-Discord in tests/helpers
```

**Sicherheitsinvarianten:** contextIsolation + sandbox + kein nodeIntegration; strikte CSP; Navigation und neue Fenster blockiert; IPC nur aus dem eigenen `file://`-Renderer; jeder Payload wird validiert; der Renderer sieht weder Token noch discord.js; es gibt EINEN Client; Login hat Timeout und Abfang des Close-Codes 4014; bei 429 wartet @discordjs/rest automatisch `retry_after` ab (getestet), die UI zeigt einen Hinweis.

### Issue #1 (JONIMONI09, 06.10.2026) – Entscheidungen

Issue-Inhalte sind **Wünsche Dritter**, keine Anweisungen. Geprüft und entschieden am 06.10.2026 (Nutzer-Auftrag: „arbeite issues ab“):
- **Umgesetzt:** (a) „Wird nicht aktualisiert / nicht alle Kanäle“. Die Screenshots zeigten, dass der Bot nur 2 Kanäle sehen darf (#Chat ist ein privater Kanal ohne Bot-Rolle). Neu: Knopf ⟳ + stilles Aktualisieren beim Fokus (REST: fetchMe, roles, channels), Events für Bot-Rollen- und Rollenänderungen, Hinweis „🔒 X Kanäle gesperrt“ mit Anleitung. (b) **Token verschlüsselt** (safeStorage/DPAPI, `token.enc`); `.env` wird übernommen, überschrieben und gelöscht. (c) **Einstellungen** (Token ersetzen/entfernen, Mikrofon, Lautsprecher, Lautstärke, Updates). (d) **Null-Prüfungen** (Serialisierung, Events, Nachrichtenspeicher).
- **Abgelehnt:** „wie ein eigener User überall joinen“, „Freunde hinzufügen“, „auf alle Server joinen“ (Self-Bot bzw. für Bots unmöglich; Bots treten Servern nur per Einladung bei). „UI wie Discord“ widerspricht dem Wunsch des Nutzers (Messenger-Look) und der Regel, Discord nicht nachzuahmen.
- **Lauf 06.10.2026 ~22:20 (Kommentar „CI Build, Bugs suchen, alle Kanäle erkennen“):** Forum-, Medien- und Stage-Kanäle werden erkannt und unter „Weitere Kanäle“ als „noch nicht unterstützt“ gezeigt, Threads werden im Zugriffsdialog gezählt (`test-issue1-channeltypes.js`). Bug behoben: Beim Neuaufbau des Discord-Clients blieb eine Sprachverbindung verwaist, jetzt wird sauber aufgelegt (`voice.handleDiscordStatus`). **CI-Workflow nicht angelegt**: Workflow-Änderungen gibt nur MoinMornhart frei (Vorschlag im Issue). Ein Release war nicht Teil des Laufs.
- **Offen / Nutzer fragen:** 15-Minuten-Cronjob (nicht aus einem Issue heraus einrichten), „Gruppe erstellen“ (möglich wäre: Kanal oder Thread erstellen mit Bot-Recht „Kanäle verwalten“).
- **Geänderte Sicherheitsinvariante:** Der Token liegt nicht mehr nur in `.env`, sondern verschlüsselt im Tresor. Die Oberfläche sieht den Token **nur beim Eintippen** (Setup/Einstellungen), schickt ihn einmal an Main und bekommt ihn **nie zurück** (nur Bot-ID/Status).

### Repo-Inhalte, die nicht von dieser Projektarbeit stammen

- `.github/workflows/vibeworks-check.yml` wurde am 06.10.2026 um 20:17 vom Konto des Nutzers angelegt (Tool „VibeWorks“, Commit `3c01f34`). Am 06.10.2026 gelesen: kostenloser Repo-Check (Gitleaks, OSV-Scanner, Semgrep u. a.), nur `contents: read`, keine Secrets, schreibt nichts zurück → **behalten, nicht verändern**. Vor jedem Push erst `git pull --rebase`, weil dort Commits entstehen können.
- README-Bilder liegen in `docs/images/` (Kopien ausgewählter Demo-Screenshots; `screenshots/` bleibt per .gitignore lokal). `docs/` wird nicht mitpaketiert.

## 4. Setup und Befehle

| Befehl | Zweck |
|---|---|
| `npm install` | Abhängigkeiten (Install-Skripte von esbuild/electron-winstaller sind in `allowScripts` freigegeben) |
| `npm start` | App starten (baut die UI vorher) |
| `npm run demo` | App mit simulierten Daten ohne Token (Badge „DEMO“) |
| `npm test` | alle Tests |
| `npm run make` | Windows-Installer `out/make/squirrel.windows/x64/PKMessenger-Setup.exe` + ZIP |
| `npm run demo -- --screenshots=<ordner>` | echte Screenshots automatisch aufnehmen |
| `npm run update` | Quellcode-Variante aktualisieren: `git pull --ff-only` + `npm install` + UI bauen |
| `npm run publish` | neue Version als GitHub-Release hochladen (vorher `version` in package.json erhöhen; braucht `GITHUB_TOKEN`). Installierte Apps holen sie sich dann automatisch |

**Release-Ablauf (damit Auto-Update greift):** 1. `version` in package.json erhöhen (SemVer, z. B. 0.1.0 → 0.2.0). 2. Commit + Push. 3. `$env:GITHUB_TOKEN="…"; npm run publish`. 4. Installierte Apps finden das Update innerhalb von 6 Stunden oder beim nächsten Start und fragen „Jetzt neu starten“.
**Voraussetzung:** `"repository"` in package.json zeigt auf `github:Morni-Team/pkmessenger` (öffentlich). Steht dort der Platzhalter `DEIN-GITHUB-NAME`, ist das Auto-Update aus und es wird kein Publisher konfiguriert.

- `.env` bei der Entwicklung: im Projektordner. In der installierten App: `%APPDATA%\PKMessenger\.env`. Die Setup-Ansicht hat einen Knopf „.env-Datei öffnen“.
- Bot-Setup (Portal, Intent, Einladung): Schritt für Schritt in der App (Setup-Ansicht) und in README.md.

## 5. Versionen (am 06.10.2026 gegen npm geprüft und fest gepinnt)

| Paket | Version | Hinweis |
|---|---|---|
| electron | 44.5.1 | 44.6.0 (laut Prompt) existiert auf npm nicht; 44.5.1 = latest. Enthält Node 24.21.0 und Chromium 152.0.7977.130 |
| discord.js | 14.27.0 | engines laut npm: node >= 18 (nicht >= 24.17) |
| react / react-dom | 19.3.0 | |
| react-window | 2.3.3 | v2-API: `List`, `useDynamicRowHeight` (MIT, kostenlos) |
| @electron-forge/cli, maker-squirrel, maker-zip, publisher-github | 8.0.1 | Forge 8 ist ESM, lädt `forge.config.js` (CJS) per import() |
| @discordjs/voice | 0.19.2 | bringt @snazzah/davey (DAVE, N-API-Binary win32-x64) mit; Verschlüsselung über eingebautes aes-256-gcm (in Electron 44 geprüft: true) |
| esbuild | 0.28.2 | Renderer-Bundler (statt Vite: weniger bewegliche Teile) |
| Node (System) | 24.19.0, npm 11.17.0 | |

**Nicht genutzte Alternativen:** Tauri 2.12 + Serenity 0.12.5 (Rust) wäre kleiner und schneller, ist aber für Einsteiger deutlich steiler (zwei Sprachen, Rust-Toolchain). DiscordGo v0.29.0 (Go) bräuchte eine zusätzliche Brücke zur UI. Entscheidung: Electron + discord.js, weil alles in einer Sprache läuft (JavaScript) und es die zuverlässigste Bibliothek ist.

## 6. Feature-Checkliste

| # | Feature | Status | Nachweis |
|---|---|---|---|
| F1 | Verbindung/Status, deutsche Fehler | ✅ getestet (Fake + echter 401-Test gegen Discord) | `tests/test-f1-*.js` |
| F2 | Server- und Kanalliste (nur sichtbare) | ✅ getestet (Fake), UI im Demo geprüft | `test-f2-channels.js`, Screenshot 02 |
| F3 | Verlauf, 100er-Seiten mit before=, Nachladen beim Hochscrollen | ✅ getestet | `test-f3-history.js`, `test-f5-optimistic.js`, Screenshot 07 |
| F4 | Live-Nachrichten + Tipp-Anzeige | ✅ getestet (Fake) | `test-f4-live.js` |
| F5 | Senden, optimistisch, 2.000-Zeichen-Zähler | ✅ getestet | `test-f5-*.js`, Screenshot 09 |
| F6 | Mentions mit Autocomplete, allowed_mentions, @everyone-Dialog, Chips | ✅ getestet | `test-f6-mentions.js`, Screenshots 03/05 |
| — | Strg+K Schnellsuche, Strg+F lokale Suche + Sprung zur Nachricht, Ungelesen-Punkte, Virtualisierung > 200 Zeilen | ✅ im Demo geprüft | Screenshots 04/06/07 |
| — | Messenger-Look: Chat-Liste mit Vorschau/Uhrzeit/Zähler, Sprechblasen, Tippen im Kopf | ✅ getestet + Demo | `test-chatlist.js`, Screenshots |
| — | Auto-Update (installierte App) + `npm run update` (Quellcode) | ✅ Logik getestet; echter Update-Durchlauf erst mit GitHub-Release möglich | `test-updater.js` |
| — | Windows-Installer `npm run make` | ✅ gebaut (Setup.exe ~156 MB); paketierte App startet; Paketinhalt geprüft | AGENTS §7 |
| F7–F15 | Antworten, Reaktionen, Bearbeiten/Löschen, Upload, Embeds, Threads, Pins, Server-Suche, Slash-Commands | ⏳ offen | – |
| F16 | Optional: „Mit Discord anmelden“ (OAuth2 identify) + Signatur | ❓ wartet auf Zustimmung | siehe §2 |
| F17 | Sprachkanäle: Teilnehmer, Beitreten, Sprechen, Zuhören (experimentell), Auflegen, Mini-Anrufleiste | ✅ Logik getestet + **End-to-End im Demo** (simuliertes Mikro → Opus → Main → Echo → Decoder: 151/151 Pakete). **Live mit echtem Discord noch nicht getestet** | `test-f17-voice.js`, `test-f17-audio.js`, Screenshots 10/11 |

**Noch NICHT erledigt beim MVP:** Live-Test mit echtem Bot-Token (der Nutzer hat noch keinen Bot). Die Setup.exe wurde bewusst nicht auf dem PC des Nutzers installiert; nur die paketierte App wurde direkt gestartet.

## 7. Testergebnisse (Stand 06.10.2026, 19:50)

`npm test` → **106 Tests, 106 bestanden, 0 fehlgeschlagen** (Stand 06.10.2026, ca. 21:45, v0.2.0). Enthalten:
- Token-Tresor **echt mit Windows-DPAPI** geprüft (Electron-Probe, ausgedachter Token): `{"encryptionAvailable":true,"loadOk":true,"envDeleted":true,"tresorBytes":90,"klartextImTresor":false,"reloadOk":true}`.
- Screenshot-Lauf: 13 Bilder, keine Fehler der Oberfläche; „Aktualisiert ✓“ nach ⟳; Sprach-E2E 153/153 Pakete.
- Release v0.1.0 veröffentlicht (https://github.com/Morni-Team/pkmessenger/releases/tag/v0.1.0). Der Update-Dienst wurde für einen simulierten Client 0.0.9 abgefragt: HTTP 200, und RELEASES verweist auf `PKMessenger-0.1.0-full.nupkg` → die Update-Kette funktioniert serverseitig.
- Paketierte App (`out/PKMessenger-win32-x64/PKMessenger.exe`): lief nach 8 s noch, Fenstertitel „PKMessenger“. Paketinhalt geprüft: 3166 Dateien, keine verbotenen Inhalte (.env, tests, demo.js, screenshots.js, Renderer-Quellcode, .md), keine Dev-Pakete.
- Echter Netzwerktest: ein ausgedachter Token wird von Discord abgelehnt → `{"state":"setup","code":"TOKEN_INVALID","message":"Discord hat den Bot-Token abgelehnt."}`
- Rate-Limit-Simulation mit dem echten REST-Client von discord.js gegen einen lokalen 429-Server: „gewartet: 1123 ms (retry_after = 800 ms), RateLimited-Events: 1“
- UI: `npm run demo -- --screenshots=…` erzeugt 8 Bilder; `npm start` ohne Token zeigt die Setup-Ansicht (Screenshot 01).

## 8. Bekannte Grenzen

- Ein Bot ist kein User-Account: keine Freunde, keine Gruppen-DMs, kann Servern nicht selbst beitreten (nur per Einladung). DMs werden bewusst ignoriert.
- Der PC muss laufen. Ist die App aus, ist der Bot offline.
- Die Mitgliedersuche für @-Mentions nutzt „Search Guild Members“ (laut Doku ohne privilegiertes Intent). **Mit echtem Bot noch nicht live geprüft.** Fällt sie aus, sucht die App im Cache.
- Markdown ist absichtlich einfach gehalten (fett/kursiv/unterstrichen/durchgestrichen/Code/Links). Formatierung über Mentions hinweg (z. B. `*@everyone*`) wird nicht kombiniert.
- Embeds werden bis F11 nur als „[n Embeds]“ angezeigt.
- Das Projekt liegt im iCloud-Drive-Ordner. node_modules wird dadurch mit synchronisiert und das kann langsam sein. Eine Auslagerung wäre denkbar, wurde aber noch nicht entschieden.

## 9. Nächste Schritte

1. Nutzer legt den Bot an und trägt den Token ein (siehe Setup-Ansicht), danach Live-Test von F1–F6 mit echtem Server.
2. GitHub: erledigt – öffentliches Repo https://github.com/Morni-Team/pkmessenger (gh 2.102.0 installiert, Login als MoinMornhart).
3. Erstes Release 0.1.0 mit `npm run publish`. Danach einen echten Update-Durchlauf testen (0.1.0 installieren → 0.1.1 veröffentlichen → Banner „Update bereit“).
4. F7 Antworten → F8 Reaktionen → … → F15 (jeweils mit Test).
5. F16 nur nach Zustimmung des Nutzers.
