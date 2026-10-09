# Issue #99: Fehler: A requested file or directory could not be found at the time an operation was pr

**Wurde von MoinMornhart geantwortet?** ❌ Nein

## Ursprüngliche Beschreibung
Bitte hier den kopierten Fehlerbericht einfügen (Strg+V) und kurz schreiben, was du gerade gemacht hast.

### PKMessenger error report
- Version: 0.17.0
- System: win32 x64, Electron 44.6.0
- Where: promise
- Error: A requested file or directory could not be found at the time an operation was processed.

<details><summary>Last log lines</summary>

```
2026-10-09T09:41:55.797Z INFO [help] Hilfe angefordert
2026-10-09T09:42:06.489Z INFO [help] Fernhilfe beendet
2026-10-09T11:12:09.716Z INFO [help] Hilfe angefordert
2026-10-09T11:14:08.774Z INFO [help] Fernhilfe beendet
2026-10-09T11:16:18.542Z INFO [help] Hilfe angefordert
2026-10-09T11:16:18.737Z WARN [help] relay: Unexpected server response: 400
2026-10-09T11:16:45.940Z INFO [help] Fernhilfe beendet
2026-10-09T11:18:02.999Z INFO [help] Hilfe angefordert
2026-10-09T11:18:03.032Z WARN [help] relay: getaddrinfo ENOTFOUND role-simple-uploaded-brings.trycloudflare
2026-10-09T11:28:28.228Z INFO [help] Fernhilfe beendet
2026-10-09T11:28:32.207Z INFO [help] Hilfe angefordert
2026-10-09T11:28:32.231Z WARN [help] relay: getaddrinfo ENOTFOUND role-simple-uploaded-brings.trycloudflare
2026-10-09T13:04:55.345Z INFO [help] Fernhilfe beendet
2026-10-09T13:07:27.855Z ERROR [renderer:promise] A requested file or directory could not be found at the time an operation was processed.
```
</details>

## Kommentare
### Comment 1 by @JONIMONI09 (2026-10-09T13:45:53Z)
Dieses Issue wurde analysiert und behoben. Es wird nun geschlossen. (Automated by Antigravity)


