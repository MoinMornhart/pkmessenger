# Issue #85: Fehler: TypeError: Cannot read properties of undefined (reading 'toLowerCase')

**Wurde von MoinMornhart geantwortet?** ✅ Ja

## Ursprüngliche Beschreibung
Bitte hier den kopierten Fehlerbericht einfügen (Strg+V) und kurz schreiben, was du gerade gemacht hast.

### PKMessenger error report
- Version: 0.16.0
- System: win32 x64, Electron 44.6.0
- Where: window: app.js:33
- Error: TypeError: Cannot read properties of undefined (reading 'toLowerCase') at B (file:///C:/Users/ggjon/AppData/Local/PKMessenger/app-0.16.0/resources/app.asar/build/renderer/app.js:33:64896)

<details><summary>Last log lines</summary>

```
2026-10-08T11:18:15.504Z INFO [help] Hilfe angefordert
2026-10-08T11:23:26.596Z INFO [help] Fernhilfe beendet
2026-10-08T11:23:35.479Z INFO [help] Hilfe angefordert
2026-10-08T11:23:39.460Z INFO [help] Fernhilfe beendet
2026-10-08T11:23:42.969Z INFO [help] Hilfe angefordert
2026-10-08T11:26:27.775Z INFO [help] Fernhilfe beendet
2026-10-08T11:26:34.569Z INFO [help] Hilfe angefordert
2026-10-08T11:27:40.916Z INFO [help] Hilfe angefordert
2026-10-08T11:32:47.322Z INFO [help] Fernhilfe beendet
2026-10-08T12:14:57.380Z ERROR [renderer:window: app.js:33] TypeError: Cannot read properties of undefined (reading 'toLowerCase') at B (file:///C:/Users/ggjon/AppData/Local/PKMessenger/app-0.16.0/resources/app.asar/build/renderer/app.js:33:64896)
```
</details>

## Kommentare
### Comment 1 by @MoinMornhart (2026-10-08T18:24:34Z)
Gefunden und behoben 🎉

Der Absturz kam von der globalen Tastenkombination (Strg+K/Strg+F): In seltenen Fällen (z. B. Autofill/Eingabemethoden) liefert das Tastatur-Ereignis kein `key`, und dann knallte es und das ganze Fenster ging in den „Ups …"-Zustand.

Fix in **PR #91**: Die Taste wird jetzt sicher abgefragt, plus ein Test, der so einen Fehler künftig sofort meldet. Sobald MoinMornhart/JoniMoni den PR zusammenführen, ist es in der nächsten Version drin.

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*



