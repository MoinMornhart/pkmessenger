# PKMessenger-Relay

Ein winziger Server, der Fernzugang und Fernhilfe von PKMessenger **auch außerhalb des WLANs** möglich macht. Er leitet nur **Ende-zu-Ende-verschlüsselte** Pakete zwischen zwei Geräten weiter – er sieht **nie** den Bot-Token, **nie** Nachrichten und **speichert nichts**. Kein offener Port beim Nutzer nötig.

## Install

Auf dem Proxmox-Host einen Debian-12-LXC anlegen, dort als root ausführen:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Morni-Team/pkmessenger/main/relay/install.sh)"
```

Der Relay läuft danach lokal auf `127.0.0.1:8787` (WebSocket unter `/ws`). TLS und deine Domain macht ein Reverse-Proxy davor (siehe unten).

## Default Settings

| Resource | Allocation |
|----------|------------|
| OS       | Debian 12  |
| CPU      | 1 core     |
| RAM      | 256 MB     |
| Storage  | 2 GB       |
| Port     | 8787 (nur lokal) |

## Reverse-Proxy (TLS + Domain)

Der Relay spricht nur HTTP auf localhost. Deine Domain mit HTTPS liefert ein Reverse-Proxy. Zwei Beispiele für `relay.deine-domain.de`:

**Caddy** (`/etc/caddy/Caddyfile`, holt das Zertifikat automatisch):

```caddy
relay.deine-domain.de {
    reverse_proxy 127.0.0.1:8787
}
```

**Nginx** (WebSocket-Upgrade nicht vergessen):

```nginx
server {
    listen 443 ssl;
    server_name relay.deine-domain.de;
    # ssl_certificate … (z. B. via certbot)

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout 3600s;
    }
}
```

Test: `https://relay.deine-domain.de/health` muss `{"ok":true,"service":"pkmessenger-relay",…}` liefern.

Danach in PKMessenger unter **Einstellungen → Sicherheit & Start → Fernzugang** die Relay-Adresse eintragen (`wss://relay.deine-domain.de/ws`). *(App-Anbindung folgt in einem eigenen Update.)*

## To Update

In der LXC-Konsole einfach:

```bash
update
```

Holt die neueste Version aus Git (`git fetch` + hartes Reset auf den Remote-Branch), installiert Abhängigkeiten neu und startet den Dienst.

## Pfade

| Zweck        | Pfad |
|--------------|------|
| Installation | `/opt/pkmessenger-relay` |
| Service      | `/etc/systemd/system/pkmessenger-relay.service` |
| Logs         | `journalctl -u pkmessenger-relay -f` |
| Einstellungen | Umgebungsvariablen im Service: `PORT`, `HOST`, `MAX_ROOMS`, `ORIGIN` |

## Sicherheit

- Der Relay leitet nur Bytes weiter. Alles ist in der App mit tweetnacl Ende-zu-Ende verschlüsselt; der Krypto-Schlüssel steht im Einladungslink **hinter dem `#`** und erreicht den Relay nie.
- Nichts wird gespeichert; Räume verschwinden, sobald beide Seiten getrennt sind oder nach 30 Minuten.
- Höchstens 2 Geräte pro Raum, Größen- und Rate-Limits, Dienst läuft mit eingeschränkten Rechten (systemd-Hardening).
