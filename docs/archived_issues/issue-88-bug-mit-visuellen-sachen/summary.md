# Issue #88: Bug mit visuellen sachen !

**Wurde von MoinMornhart geantwortet?** ✅ Ja

## Ursprüngliche Beschreibung
<img width="1371" height="861" alt="Image" src="https://github.com/user-attachments/assets/2d6211b8-1190-4e45-8e44-299c0c1ef1c6" />

bitte analysieren und beheben !  @claude  @MoinMornhart 

## Kommentare
### Comment 1 by @MoinMornhart (2026-10-08T18:26:40Z)
Analysiert 🔍 Auf dem Bild überlappt eine schwebende **Antwort-Vorschau** (die eingeblendete „bezieht sich auf…"-Blase von *ozzy*) die darunterliegende **Medien-Nachfrage** („Bilder laden? Abbrechen / Nur dieses / Immer laden"), sodass Text und Knöpfe übereinanderliegen.

Das ist ein Darstellungs-/Ebenen-Fehler (z-index + Positionierung), kein Datenproblem. Ich reproduziere die Situation (Antwort-Blase + offene Medien-Nachfrage gleichzeitig) im Demo-Modus und behebe die Überlappung in einer eigenen PR mit Screenshot-Nachweis.

Falls du magst: Kam das immer beim Überfahren einer Antwort auf, oder nur als die Medien-Frage offen war? Das hilft beim genauen Nachstellen.

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*



