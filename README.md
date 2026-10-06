# PKMessenger

Kostenloses Windows-Bot-Control-Center für Discord: Du lädst **deinen eigenen Bot** auf deinen Server ein und liest und schreibst dann alles direkt in PKMessenger, ohne den Discord-Client.

> Alle Nachrichten gehen **als dein Bot** raus (mit BOT-Kennzeichnung). PKMessenger ist kein offizielles Discord-Produkt und kein Ersatz für deinen persönlichen Account.

## Schnellstart

```powershell
npm install
npm run demo   # Oberfläche mit Beispieldaten ansehen (ohne Token)
npm start      # echte App – beim ersten Start führt dich die Setup-Ansicht durch alles
```

## Bot einrichten (einmalig)

1. https://discord.com/developers/applications öffnen → **New Application** → links **Bot** → **Reset Token** → Token kopieren.
2. Token in `.env` eintragen: `DISCORD_TOKEN=...` (Vorlage: `.env.example`). **Niemals teilen oder committen.**
3. **Bot → Privileged Gateway Intents:** nur **Message Content Intent** einschalten.
4. Bot einladen: Den Link zeigt die App an, sobald der Token eingetragen ist. Benötigte Rechte: Kanäle ansehen, Nachrichten senden, Nachrichtenverlauf lesen.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm start` | App starten |
| `npm run demo` | Demo ohne Discord |
| `npm test` | Tests |
| `npm run make` | Windows-Installer bauen |
| `npm run update` | Quellcode auf den neuesten Stand holen (git pull + Build) |
| `npm run publish` | neue Version als GitHub-Release veröffentlichen |

## Updates

Die **installierte App** sucht beim Start und alle 6 Stunden selbst nach neuen Versionen (GitHub-Releases über update.electronjs.org), lädt sie im Hintergrund und bietet „Jetzt neu starten“ an. Eine Neuinstallation ist nicht nötig.
Wer mit dem **Quellcode** arbeitet, nutzt `npm run update`.

Details zu Architektur, Recht und Status: [AGENTS.md](AGENTS.md) · Fehlerprotokoll: [error.md](error.md)
