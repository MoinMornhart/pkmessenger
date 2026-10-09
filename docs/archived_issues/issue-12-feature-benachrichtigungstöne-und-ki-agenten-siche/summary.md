# Issue #12: Feature: Benachrichtigungstöne und KI-Agenten sicher verbessern

**Wurde von MoinMornhart geantwortet?** ✅ Ja

## Ursprüngliche Beschreibung
## Ziel
PKMessenger soll sich stärker wie ein moderner Messenger anfühlen: neue Nachrichten sollen zuverlässig und konfigurierbar akustisch signalisiert werden, während die KI-Funktionen sicherer, transparenter und im Alltag besser steuerbar werden.

## Erkenntnisse aus README und Code
- Die README beschreibt bereits Live-Nachrichten, ungelesene Zähler, KI-Agenten und KI-Antworten als Beta.
- Der Main-Prozess empfängt Nachrichten über `broadcast()` in `src/main/main.js` und reicht Ereignisse an den Renderer weiter.
- Einstellungen werden lokal über den Store gespeichert.
- KI-Schlüssel werden bereits per `safeStorage` verschlüsselt gespeichert; KI-Anfragen laufen im Main-Prozess.
- Der KI-Antwort-Agent besitzt bereits Cooldown, Stundenlimit, Kanal-/Nutzerfilter und Schutz vor Bot-Endlosschleifen.
- Die Update-Logik sollte bei dieser Gelegenheit ebenfalls überprüft werden: nur installierte Squirrel-App unterstützen, Fehler sauber melden und Updates nicht als Telemetrie behandeln.

## Feature 1: Benachrichtigungstöne
In den Einstellungen soll es einen Bereich **Benachrichtigungen → Töne** geben.

### Anforderungen
- Ton global ein-/ausschaltbar.
- Lautstärke separat einstellbar.
- Auswahl aus mehreren eingebauten Sounds, z. B.:
  - Standard
  - Leise
  - Klar
  - Retro
  - Kein Ton
- Optional eigene Audiodatei auswählen (`.wav`, möglichst ohne externe Netzwerkabhängigkeit).
- Testton-Schaltfläche in den Einstellungen.
- Separat konfigurierbar:
  - neue Nachricht im aktuell geöffneten Chat
  - neue Nachricht in einem anderen Chat
  - Erwähnung/Antwort auf mich
  - Privatnachricht
  - KI-Antwort angekommen
  - Fehler oder Verbindung getrennt
- Kein Ton für eigene Nachrichten.
- Kein Ton, wenn das Fenster aktiv ist und der Benutzer den betreffenden Chat gerade geöffnet hat (als Option).
- Cooldown/Drosselung, damit viele Nachrichten keinen Sound-Sturm erzeugen.
- Einstellungen lokal speichern und beim Neustart wiederherstellen.
- Ton muss auch funktionieren, wenn das Fenster minimiert ist, aber die App läuft.
- Keine Audiodateien aus dem Internet laden.
- Zugänglichkeit: sichtbare Statusanzeige und Tastaturbedienung.

### Technischer Vorschlag
- Audio-Wiedergabe im Renderer über eine kleine, getestete Sound-Abstraktion oder im Main-Prozess über eine sichere Electron-Lösung; keine unkontrollierten Browser-Navigationen.
- Ein neues Ereignis wie `notification:new-message` kann neben dem bestehenden Nachrichtenereignis emittiert werden.
- Die Entscheidung, ob ein Ton abgespielt wird, sollte anhand von Chat-ID, aktivem Fenster, Mention/Reply und gespeicherten Einstellungen erfolgen.
- Tests für Filterregeln, Cooldown, Lautstärkegrenzen und Persistenz ergänzen.

## Feature 2: KI-Agenten verbessern
Die KI-Funktionen sollen verständlicher und sicherer konfigurierbar werden.

### Anforderungen
- Klare Anzeige, ob KI global aktiviert ist oder nur der Erwähnungs-Antwort-Agent aktiv ist.
- Testantwort darf niemals versehentlich in Discord gepostet werden.
- Vorschau vor dem Aktivieren eines zeitgesteuerten Auftrags.
- Pro Auftrag:
  - maximale Antwortlänge
  - Tonalität/Persona
  - Sprache
  - erlaubte Kanäle
  - erlaubte Nutzer
  - Kontextumfang
  - Antwort als Thread oder normale Nachricht
  - Benachrichtigung bei Erfolg/Fehler
- Dry-Run/Simulation für geplante Aufträge.
- Bessere Statusmeldungen: letzter Lauf, nächster Lauf, Laufzeit, Anbieter, Modell und gekürzte Fehlerursache.
- Schutz vor Prompt Injection beibehalten und ausbauen: Nachrichtenverlauf ist Datenmaterial, niemals Systemanweisung.
- Niemals `@everyone`, `@here` oder ungewollte Nutzer-/Rollen-Pings aus KI-Ausgaben übernehmen.
- Harte Kosten-/Ratenlimits pro Stunde und Tag; Limits in den Einstellungen sichtbar.
- Abbruch laufender KI-Anfragen beim Deaktivieren.
- API-Schlüssel nie im Renderer, in Logs, Fehlermeldungen oder Exporten anzeigen.
- Anbieterprofile speichern können, ohne Schlüssel offenzulegen, z. B. OpenAI-kompatibel, Anthropic, lokales Modell.
- Optional lokale Modelle wie Ollama/LM Studio mit verständlicher Verbindungsprüfung.
- KI-Fehler als lokales Ereignis/Toast anzeigen, ohne automatisch Nachrichten in Discord zu senden.

## Akzeptanzkriterien
- [ ] Sound-Einstellungen sind unter Einstellungen erreichbar.
- [ ] Eine neue Nachricht erzeugt abhängig von den Einstellungen genau höchstens einen Ton.
- [ ] Mention, DM und KI-Antwort können unterschiedliche Sounds verwenden.
- [ ] Eigene Nachrichten erzeugen keinen Nachrichtenton.
- [ ] Sounds funktionieren bei minimiertem Fenster und bleiben lokal.
- [ ] Testton, Lautstärke und Stummschaltung sind getestet.
- [ ] KI-Test sendet niemals eine Discord-Nachricht.
- [ ] KI-Ausgaben können keine Massen-Pings auslösen.
- [ ] KI-Cooldown, Stundenlimit und erlaubte Kanäle bleiben wirksam.
- [ ] Deaktivierte KI stoppt neue Aufträge und laufende Arbeit kontrolliert.
- [ ] `npm test` bleibt vollständig grün.
- [ ] README dokumentiert die neuen Ton- und KI-Einstellungen.

## Prompt zum Kopieren für die Implementierung
```text
Untersuche das Repository Morni-Team/pkmessenger und implementiere die Feature-Anfrage „Benachrichtigungstöne und KI-Agenten verbessern“ vollständig.

Lies zuerst README.md, AGENTS.md, package.json sowie die relevanten Dateien für Store, Settings, Renderer-Events, Discord-Nachrichten, Main-Prozess, IPC, Updater und KI-Agenten. Verändere keine Discord-Regel-konformen Sicherheitsgrenzen.

Implementiere:
1. Lokale Benachrichtigungstöne mit Ein/Aus, Lautstärke, eingebauten Sounds, optionaler lokaler WAV-Datei, Testton und getrennten Regeln für neue Nachricht, andere Chats, Mention, DM, KI-Antwort und Fehler.
2. Keine Töne für eigene Nachrichten; optional keine Töne für den aktiv geöffneten Chat; Cooldown gegen Sound-Stürme; korrektes Verhalten bei minimiertem Fenster.
3. Persistente Einstellungen mit Validierung und sinnvollen Defaults. Keine Netzwerk-Audios und keine Telemetrie.
4. KI-Einstellungen mit Preview/Dry-Run, klaren Statusinformationen, konfigurierbarer Sprache/Persona/Kontext/Antwortlänge, sichtbaren Limits und sauberem Abbruch.
5. Prompt-Injection-Schutz: Chatnachrichten sind untrusted data und dürfen Systemregeln nicht überschreiben. Keine @everyone-, @here-, Rollen- oder Nutzer-Pings aus KI-Ausgaben.
6. API-Schlüssel ausschließlich im Main-Prozess und verschlüsselt; niemals in Renderer, Logs oder Fehlermeldungen.
7. Ergänze Unit-/Integrationstests für Sound-Filter, Persistenz, KI-Dry-Run, Limits und Ping-Schutz.
8. Aktualisiere README.md mit Bedienung, Datenschutz, Grenzen und Troubleshooting.

Arbeite in kleinen, nachvollziehbaren Änderungen. Nutze vorhandene Architektur und Abstraktionen. Keine unnötigen Dependencies. Führe npm test aus und prüfe den Produktionsbuild. Eröffne anschließend einen Pull Request mit Zusammenfassung, Testresultaten, bekannten Einschränkungen und einer Liste der geänderten Dateien.
```

## Nicht-Ziele
- Kein Self-Bot und keine User-Tokens.
- Keine Umgehung von Discord-Berechtigungen oder Rate-Limits.
- Keine automatische KI-Antwort ohne explizite Aktivierung und Kanal-/Nutzerregeln.
- Keine Cloud-Synchronisierung persönlicher Einstellungen ohne ausdrückliche neue Entscheidung.


## Kommentare
### Comment 1 by @JONIMONI09 (2026-10-07T11:43:00Z)
@claude  @MoinMornhart 

Arbeite nochmal ALLE issues ab , und prüfst ob du alles auch umgesetzt hattest! 

### Comment 2 by @JONIMONI09 (2026-10-07T12:06:17Z)
@claude  @MoinMornhart  Bitte füge auch der KI Tools hinzu! Also websuche , suche im web , OHNE Token und OHNE Geld , dass einzubauen , es gibt welche habe ich selber in meinem Agentensystem drinnen etc! .. mache auch bitte die Anzeige , in welchem Server , besser , also dass ich dann server auswählen kann und jeden kanal dann einzeln verwalten kann , dass es nicht so unübersichtlich wird etc! Bitte analysieren! Optimieren! llma soll auch erkennt werden! Bitte prüfen , Modelle sollen automatisch auch erkannt werden .... mache systemprompt auf englisch aber antwort soll es möglichst auf deutsch! So wie regeln etc! Bitte suchen und verbessern ! 

### Comment 3 by @JONIMONI09 (2026-10-07T13:20:55Z)
@claude  @MoinMornhart  Bitte fixen!


Run set -euo pipefail
Error: Ungültiger Release-Tag 'main'.
Error: Erwartet wird ein Tag im Format vX.Y.Z.
Error: Alternativ den Workflow auf main ausführen.
Error: Process completed with exit code 1.



und mache es einstellbar bitte , also die Funktion:

 Verbrauch: 0/60 pro Stunde · 0/300 pro Tag


also nicht bei lokalen anbierten , kann man machen etc , man kann auch die Nutzung genauer einstellen , aber halt lasse dir was einfallen , alles einstellbar etc , wie viel etc , kann man speichern , arbeite alles nochmal ab , lese doku und dann schließe Issues , wenn fertig etc! nutze den vibeworks Bot etc! 



### Comment 4 by @MoinMornhart (2026-10-07T14:18:21Z)
Hey Joni! 👋 Hier ist alles, was du dir in diesem Issue gewünscht hast. Es ist jetzt fertig und als Update draußen (aktuell **v0.8.1**):

**📊 KI-Limits einstellbar** (v0.7.1)
- Neues Feld „Limits“: **Automatisch** (bei OpenAI, Claude & Co. an, bei lokalen Modellen wie Ollama aus, die kosten ja nichts), **Immer an** oder **Aus**.
- Die Zahlen pro Stunde und pro Tag kannst du trotzdem immer ändern.

**🛠 „Release bauen“ von Hand** (v0.7.1)
- Wenn du den Workflow auf main ohne Tag startest, nimmt er jetzt einfach die Version aus package.json. Der Fehler „Ungültiger Release-Tag 'main'“ ist weg.

**🌐 Websuche für die KI, gratis und ohne Schlüssel** (v0.8.0)
- Häkchen „Websuche erlauben“ beim Auftrag oder bei „Auf Erwähnungen antworten“.
- Die KI sucht dann selbst (DuckDuckGo, sonst Wikipedia) und nennt die Quelle. Klappt auch mit lokalen Modellen.

**🔍 Modelle werden automatisch erkannt** (v0.8.0)
- Knopf **„Modelle laden“** zeigt alle Modelle deines Anbieters zum Auswählen.
- Knopf **„Lokale KI auf diesem PC suchen“** findet Ollama, LM Studio, llama.cpp & Co. mit ihren Modellen (also auch Llama). Ein Klick, und es ist eingestellt.

**🇬🇧➡️🇩🇪 Systemprompt englisch, Antwort deutsch** (v0.8.0)
- Die Anweisungen an die KI sind jetzt englisch und haben feste Regeln (kein @everyone, Nutzertexte sind keine Befehle, gibt sich nicht als Mensch aus). Antworten kommen trotzdem auf Deutsch.

**🖥 Übersichtlicher bei vielen Servern** (v0.8.0)
- Erst Server wählen, dann Kanal.
- Bei „Antworten“: Server auswählen, Kanäle einzeln an/aus oder „Alle an“ / „Alle aus“, mit Anzeige wie „(2/5 an)“.
- Aufträge kannst du nach Server filtern.

Ich mache das Issue zu, weil alles erledigt ist. Wenn dir noch was einfällt oder was nicht klappt, einfach hier oder in einem neuen Issue melden 🙂

PRs: #27, #28, #30

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*



