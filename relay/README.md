# PKMessenger-Relay

Verschlüsselnder WebSocket-Vermittler, damit **Fernzugang** und **Fernhilfe** von PKMessenger auch **außerhalb des WLANs** funktionieren – ohne dass der Nutzer-PC von außen erreichbar sein muss.

- Leitet **nur Ende-zu-Ende-verschlüsselte Pakete** weiter (tweetnacl in der App). Der Relay sieht nie Klartext, nie den Bot-Token, nie Nachrichten.
- **Speichert nichts.** Ein Raum verbindet genau zwei Geräte; er verschwindet, sobald beide weg sind oder nach 30 Minuten.
- Höchstens 2 Geräte pro Raum, Größen-/Rate-Limits, systemd-Hardening.

## Betrieb auf dem Proxmox

Siehe **[docs/proxmox-quickstart.md](../docs/proxmox-quickstart.md)** – Einzeiler-Install, Reverse-Proxy (Caddy/Nginx) für TLS + Domain, `update`-Befehl.

## Lokal starten (zum Ausprobieren)

```bash
cd relay && npm install && npm start   # lauscht auf 127.0.0.1:8787, WebSocket unter /ws
```

Gesundheits-Check: `GET http://127.0.0.1:8787/health` → `{"ok":true,…}`.

## Protokoll (für die App)

1. WebSocket zu `wss://<domain>/ws` öffnen.
2. Erste Nachricht (JSON): `{"room":"<raum-id>","role":"host"|"guest"}`. Antwort `{"relay":"joined","peer":<bool>}`; kommt die Gegenseite später, folgt `{"relay":"peer","connected":true}`.
3. Danach jedes Paket (verschlüsselte Bytes) wird **unverändert** an die Gegenseite weitergereicht.

Die Raum-ID ist zufällig und steht im Einladungslink; der Krypto-Schlüssel steht getrennt im Link-Fragment (`#…`) und erreicht den Relay nie.
