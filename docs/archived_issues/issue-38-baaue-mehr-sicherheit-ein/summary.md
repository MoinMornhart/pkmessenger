# Issue #38: baaue mehr sicherheit ein

**Wurde von MoinMornhart geantwortet?** ✅ Ja

## Ursprüngliche Beschreibung
Blocke IP grabber und versuche diese intellligent zu erknennen , villeicht mit so ner 2026 Bibliothek etc , also mache auch sicherheits einstellungen , dass mir geschikte inhalte nicht IP auslesen kann etc , also wenn sowas erkannt wurde , warnen , und ob man für sich die Meldung löschen möchte , es wird empholen ... also nicht kopierbar etc ,... also warnung etc... mache es intelligent , und Trusted Links soll es geben  etc m, also keine stumpfen Links , sondern echt so ein Scann etc! Bitte prüfen! Danke @claude  @MoinMornhart  Arbeite bitte alles ab! 

## Kommentare
### Comment 1 by @MoinMornhart (2026-10-07T17:14:08Z)
Hey Joni! 👋 Der Link-Schutz ist drin (**v0.9.4**, PR #39):

- 🕵️ Die App erkennt **IP-Grabber** (grabify, iplogger & Co.), **nachgemachte Seiten** (z. B. „dlscord“ oder „discorcl“, wo „cl“ wie ein „d“ aussieht), **Nitro-Betrug** („gratis Nitro“) und **Kurzlinks**, bei denen man nicht sieht, wohin sie führen.
- ⛔ Gefährliche Links sind **gesperrt**: nicht anklickbar, nicht kopierbar. Unter der Nachricht steht eine Warnung mit **„Für mich ausblenden (empfohlen)“**. Darf der Bot Nachrichten löschen, gibt's auch **„Für alle löschen“**.
- ⚠️ Verdächtige Links öffnen erst nach einer Warnung, die sagt, **warum** sie verdächtig sind.
- ✅ **Vertrauenswürdige Seiten** (discord.com, github.com, youtube.com …) öffnen direkt. Eigene Seiten fügst du unter **Einstellungen → Datenschutz** hinzu, oder mit dem Häkchen im Link-Fenster.
- 🔒 Geprüft wird **nur auf deinem PC**. Würde die App die Links bei einem Online-Dienst prüfen lassen, könnte gerade das deine IP verraten.

Wenn's passt, sag Bescheid, dann mache ich das Issue zu 🙂

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*


### Comment 2 by @JONIMONI09 (2026-10-07T18:19:39Z)
> Hey Joni! 👋 Der Link-Schutz ist drin (**v0.9.4**, PR [#39](https://github.com/Morni-Team/pkmessenger/pull/39)):
> 
>     * 🕵️ Die App erkennt **IP-Grabber** (grabify, iplogger & Co.), **nachgemachte Seiten** (z. B. „dlscord“ oder „discorcl“, wo „cl“ wie ein „d“ aussieht), **Nitro-Betrug** („gratis Nitro“) und **Kurzlinks**, bei denen man nicht sieht, wohin sie führen.
> 
>     * ⛔ Gefährliche Links sind **gesperrt**: nicht anklickbar, nicht kopierbar. Unter der Nachricht steht eine Warnung mit **„Für mich ausblenden (empfohlen)“**. Darf der Bot Nachrichten löschen, gibt's auch **„Für alle löschen“**.
> 
>     * ⚠️ Verdächtige Links öffnen erst nach einer Warnung, die sagt, **warum** sie verdächtig sind.
> 
>     * ✅ **Vertrauenswürdige Seiten** (discord.com, github.com, youtube.com …) öffnen direkt. Eigene Seiten fügst du unter **Einstellungen → Datenschutz** hinzu, oder mit dem Häkchen im Link-Fenster.
> 
>     * 🔒 Geprüft wird **nur auf deinem PC**. Würde die App die Links bei einem Online-Dienst prüfen lassen, könnte gerade das deine IP verraten.
> 
> 
> Wenn's passt, sag Bescheid, dann mache ich das Issue zu 🙂
> 
> 🤖 _Diese Nachricht wurde mit Claude (KI-Assistent) verfasst._



@MoinMornhart  @claude  so wie früher , wenn es kleine Chats gibt , bitte eine detailirte erklärung machen , also wie man den Bot erstellt welche schritte man macht , man soll zusammen dann was erstellen !!!! Bitte analysieren !!!!"!!! 

### Comment 3 by @MoinMornhart (2026-10-07T19:08:28Z)
Hey Joni! 👋 Der **Einrichtungs-Assistent** ist drin (**v0.10.3**, PR #49):

Er geht mit dir **Schritt für Schritt** durch: Discord-Konto → Anwendung anlegen → Token holen und direkt einfügen → Erlaubnis einschalten → **gemeinsam einen Server anlegen** → Bot einladen → Kanäle freigeben. Jeder Schritt sagt genau, was wo anzuklicken ist. Die App **prüft automatisch mit** und springt weiter, sobald etwas geschafft ist.

Er erscheint beim ersten Start, **von selbst**, wenn der Bot noch auf keinem Server ist, und jederzeit unter **Einstellungen → Hilfe & Tour → 🧭**.

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*


### Comment 4 by @JONIMONI09 (2026-10-08T08:16:04Z)
super , danke!


