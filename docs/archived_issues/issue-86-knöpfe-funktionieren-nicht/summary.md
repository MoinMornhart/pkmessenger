# Issue #86: Knöpfe funktionieren nicht!

**Wurde von MoinMornhart geantwortet?** ✅ Ja

## Ursprüngliche Beschreibung
<img width="1234" height="1246" alt="Image" src="https://github.com/user-attachments/assets/7a65892a-9050-4e6e-b9af-b7b1e297a843" />

Verifizieren tritt in PK nicht auf! und bearbeite Issues!!!!!! @claude  @MoinMornhart 

## Kommentare
### Comment 1 by @MoinMornhart (2026-10-08T18:26:39Z)
Analysiert 🔍 Dein Screenshot zeigt den **Discord-Client**, wo ein Bot („Moin_Julia APP") eine Nachricht mit einem **Knopf** („✅ Verifizieren") gepostet hat.

**Woran es liegt:** PKMessenger liest aktuell die Knöpfe/Auswahlmenüs einer Nachricht (`components`) noch gar nicht aus – deshalb siehst du sie nicht.

**Was ich machen kann:** Die Knöpfe **anzeigen** (Beschriftung + Zustand), damit du siehst, dass da welche sind.

**Was leider nicht geht:** Einen **fremden** Knopf (von einem anderen Bot/einer anderen App, wie „Verifizieren") per Klick auslösen. Das darf bei Discord **nur ein echter Nutzer im Discord-Client**, ein Bot kann das technisch nicht – egal mit welchem Programm. Das ist eine Discord-Grenze, kein PK-Fehler.

→ Ich baue „Knöpfe anzeigen (nur Ansicht)" als eigenen Punkt mit Hinweis dazu. Kommt in einer eigenen PR.

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*


### Comment 2 by @MoinMornhart (2026-10-08T18:39:22Z)
Umgesetzt ✅ → **PR #92**

Die Knöpfe/Auswahlmenüs tauchen jetzt in der Nachricht auf:
- **Link-Knöpfe** öffnen (über den Link-Schutz) im Browser.
- Fremde Aktions-Knöpfe (wie „Verifizieren") werden **angezeigt**, mit Hinweis – drücken kann sie nur ein Nutzer im Discord-Client (Discord-Grenze, nicht änderbar).

Screenshot aus der Demo zeigt „Verifizieren", „Mehr Infos ↗" und ein Auswahlmenü sauber dargestellt. Sobald ihr den PR zusammenführt, ist es in der nächsten Version drin.

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*



