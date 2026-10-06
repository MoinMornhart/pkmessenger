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

Details zu Architektur, Recht und Status: [AGENTS.md](AGENTS.md) · Fehlerprotokoll: [error.md](error.md)
