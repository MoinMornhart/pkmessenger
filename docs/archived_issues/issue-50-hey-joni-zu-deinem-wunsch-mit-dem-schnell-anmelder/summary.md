# Issue #50: > Hey Joni! 👋 Zu deinem Wunsch mit dem **Schnell-Anmelder** (Link/QR, 5 Minuten gültig, Geräte sehen und entfernen) und **Anmelden ohne Discord-Konto**:

**Wurde von MoinMornhart geantwortet?** ✅ Ja

## Ursprüngliche Beschreibung
> Hey Joni! 👋 Zu deinem Wunsch mit dem **Schnell-Anmelder** (Link/QR, 5 Minuten gültig, Geräte sehen und entfernen) und **Anmelden ohne Discord-Konto**:
> 
> **Gute Nachricht vorweg:** Zum **Benutzen** von PKMessenger braucht man schon jetzt **kein eigenes Discord-Konto**, nur den Bot-Token. Ein Konto braucht nur, wer den Bot **anlegt** (Discords Regel, das geht nicht anders).
> 
> **Was du dir wünschst, heißt technisch:** Deine App würde auf deinem PC einen **Zugang fürs Netzwerk öffnen**, damit sich andere Geräte (Handy, zweiter PC) per Link/QR mit **deinem** Bot verbinden. Das ist machbar und erlaubt, aber es ist die größte Sicherheitsänderung bisher. Bis jetzt öffnet PKMessenger **gar keinen Zugang nach außen**.
> 
> Mein Vorschlag, wenn ihr (du und @MoinMornhart) einverstanden seid:
> 
>     * **Nur im eigenen WLAN**, nicht übers Internet
> 
>     * **Link + QR-Code**, nur **5 Minuten** gültig, mit **Bestätigung am Host-PC** („Gerät XY will sich anmelden – zulassen?“)
> 
>     * Der Host sieht **alle Geräte** und kann jedes **sofort entfernen**
> 
>     * Verschlüsselt, ausgeschaltet ab Werk, eigener Schalter unter Sicherheit
> 
>     * Angemeldete Geräte schreiben natürlich weiter **als Bot**
> 
> 
> Sagt kurz **„ja, so bauen“**, dann lege ich los. Weil es Ports am PC öffnet, möchte ich das vorher bestätigt haben 🙂
> 
> 🤖 _Diese Nachricht wurde mit Claude (KI-Assistent) verfasst._

verschhlüsselte verbindung , bitte irgendwas , oder so einmal Token , der dann nach Verwendung zerfällt , und nutze immere passwort , also bevor man nachricht dann schreibt , muss der host sehen , dass aktivität ist etc ., um diese uhrzeit etc , also sicher machen  @claude Bitte machen , einverstanden , mache es sehr sicher!!!!

_Originally posted by @JONIMONI09 in https://github.com/Morni-Team/pkmessenger/issues/46#issuecomment-6044960634_
            

@claude 

## Kommentare
### Comment 1 by @MoinMornhart (2026-10-07T20:13:46Z)
Hey Joni! 👋 Der **Schnell-Anmelder** ist fertig (**v0.11.0**, PR #52, und **v0.11.2** ohne IP im Link, PR #55):

**So geht's:** Einstellungen → **Sicherheit & Start** → **Fernzugang**
1. Eigenes **Fernzugangs-Passwort** festlegen (mind. 8 Zeichen) und einschalten.
2. **„Gerät hinzufügen (QR-Code)“** → Handy scannt den Code. Der Code gilt **5 Minuten** und nur **einmal**, du kannst ihn auch **widerrufen**.
3. Am Handy Passwort eingeben → am PC kommt **„Neues Gerät will sich verbinden“** → zulassen.

**Sicherheit:**
- 🏠 Geht **nur im eigenen WLAN**, ab Werk **aus**.
- 🔐 Alles ist **verschlüsselt**, jede Sitzung fragt nach dem Passwort, nach 5 Fehlversuchen ist 5 Minuten Pause.
- 👀 Du siehst am PC **alle Geräte** und **was sie gemacht haben** und kannst jedes Gerät **sofort entfernen**.
- ✋ Wenn du willst, musst du **jede Nachricht** vom Handy erst am PC bestätigen.
- 🤖 Gesendet wird immer als Bot, ohne @everyone-Pings.

Ein Discord-Konto braucht am Handy **niemand**.

Wenn's passt, sag Bescheid, dann mache ich das Issue zu.

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*


### Comment 2 by @JONIMONI09 (2026-10-07T21:02:22Z)
@MoinMornhart  @claude   bitte auch von draußen machen , eigenen Server auf PC hosten die kommunizieren sollen OHNE IP als Sicherheitsbeauftragter muss ich dir sagen dass es eine Sicherheitslücke ist ! Also beheben ! Es soll ein Online system gehostet werden vom Endbenutzer der PC ! ND so viel RAM Fressen kann man auch ausschalten ! Backup bzw Fallback link mit IP entfernen!!!! Bitte fixen !!!! 

### Comment 3 by @MoinMornhart (2026-10-08T06:33:52Z)
Hey Joni! 👋 Sorry, deine Nachrichten von gestern Abend hatte ich erst heute früh gesehen.

- 🗑 **Ersatz-Link mit IP ist komplett weg** (**v0.12.2**, PR #59). Link und QR-Code haben nur noch den PC-Namen. Klappt der Name nicht, gibt's gar keinen Link, sondern einen Hinweis.
- 🧠 **RAM:** Der Fernzugang ist ab Werk aus und braucht dann nichts. Nur wer ihn einschaltet, hat ihn laufen.
- 🌍 **Von draußen ohne IP:** Machen wir mit der **Android-App** (#56). Das Handy verbindet sich dann **selbst** über deinen Bot mit Discord, überall und ohne dass dein PC von außen erreichbar sein muss. Das ist sicherer als ein offener PC im Internet. Details stehen in #56.

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*


### Comment 4 by @JONIMONI09 (2026-10-08T10:48:21Z)
behoben!


