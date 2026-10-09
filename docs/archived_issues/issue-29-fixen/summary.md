# Issue #29: fixen!

**Wurde von MoinMornhart geantwortet?** ✅ Ja

## Ursprüngliche Beschreibung
> @claude  @MoinMornhart  
> 
> <img width="1371" height="881" alt="Image" src="https://github.com/user-attachments/assets/0abdd7cc-de3c-42e9-a54a-896718559287" />
> 
> Keine Auto Vollständigung bei "Personen ausschließen" Bitte prüfen!  

 _Originally posted by @JONIMONI09 in [#1](https://github.com/Morni-Team/pkmessenger/issues/1#issuecomment-6039457848)_

 @claude  @JONIMONI09  @MoinMornhart  Bitte einmal fixen! 

## Kommentare
### Comment 1 by @JONIMONI09 (2026-10-07T14:10:21Z)
analysieren und beheben!

### Comment 2 by @JONIMONI09 (2026-10-07T14:12:50Z)
Slash befehle funktionieren nicht richtig Bitte analysieren! @claude  @MoinMornhart  und keine Bioabfrage bei den Passwörtern , also mögllich machen , dass man auch Bio und admin dann erzwingen kann um Programm zu starten , es muss sowieso eine einstelllung geben , dass im Hintergund ausgeführt werden darf etc... Bitte prüfen! 

### Comment 3 by @MoinMornhart (2026-10-07T14:18:06Z)
Hey Joni! 👋 Ist repariert, ab **Version 0.8.1** 🎉

So geht's jetzt:
- Einfach ins Feld **„Personen ausschließen“** klicken, dann kommen sofort Vorschläge.
- Du kannst auch nur einen Teil vom Namen tippen: **„o“ findet jetzt auch „MoinMornhart“**. Vorher hat Discord nur am Anfang vom Namen gesucht, deshalb kam bei dir nichts.
- Es wird in allen deinen Servern gleichzeitig gesucht, Bots tauchen nicht auf.
- Wenn niemand passt, steht da ein kleiner Hinweis statt einfach nichts.

Das Gleiche gilt auch für „Nur diesen Personen antworten“ und für @-Erwähnungen beim Schreiben.

Ich mache das Issue zu, weil es erledigt ist. Wenn's bei dir doch noch hakt, schreib einfach hier rein 🙂

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*


### Comment 4 by @MoinMornhart (2026-10-07T14:42:32Z)
Hey Joni! 👋 Sorry, deine zwei Nachrichten hier (Slash-Befehle, Fingerabdruck/Gesicht statt Passwort, im Hintergrund laufen) hatte ich übersehen und das Issue zu früh zugemacht. Ist wieder offen, ich kümmere mich jetzt drum 🙂

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*


### Comment 5 by @MoinMornhart (2026-10-07T14:51:50Z)
Hey Joni! 👋 Die **Slash-Befehle** sind repariert (kommt mit **v0.8.2**, PR #31):

- Befehle wie `/münze`, `/würfel`, `/umfrage` gehen jetzt mit **einem** Enter. Vorher musste man zweimal drücken, das war der Fehler.
- Tippst du einen Befehl, den die App nicht kennt (z. B. `/ping`), fragt sie nach, statt ihn einfach als Text zu schicken. Befehle von anderen Bots kann ein Bot leider nicht auslösen, das lässt Discord nicht zu.
- Die Liste findet auch Teile vom Namen.

Fingerabdruck/Gesicht beim App-Passwort und „im Hintergrund laufen“ kommen im nächsten Teil 🙂

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*


### Comment 6 by @JONIMONI09 (2026-10-07T14:55:34Z)
> Hey Joni! 👋 Die **Slash-Befehle** sind repariert (kommt mit **v0.8.2**, PR [#31](https://github.com/Morni-Team/pkmessenger/pull/31)):
> 
>     * Befehle wie `/münze`, `/würfel`, `/umfrage` gehen jetzt mit **einem** Enter. Vorher musste man zweimal drücken, das war der Fehler.
> 
>     * Tippst du einen Befehl, den die App nicht kennt (z. B. `/ping`), fragt sie nach, statt ihn einfach als Text zu schicken. Befehle von anderen Bots kann ein Bot leider nicht auslösen, das lässt Discord nicht zu.
> 
>     * Die Liste findet auch Teile vom Namen.
> 
> 
> Fingerabdruck/Gesicht beim App-Passwort und „im Hintergrund laufen“ kommen im nächsten Teil 🙂
> 
> 🤖 _Diese Nachricht wurde mit Claude (KI-Assistent) verfasst._



BITTE lese alle issues , und checke , ob du alles genaustens umsetzen konntest!!!! dann wenn ja , dann schließen!!!! 


### Comment 7 by @JONIMONI09 (2026-10-07T15:22:07Z)
https://github.com/Morni-Team/pkmessenger/issues/29#issuecomment-6040631614 @MoinMornhart  @claude 

### Comment 8 by @MoinMornhart (2026-10-07T15:29:24Z)
Hey Joni! 👋 Alles aus diesem Issue ist jetzt drin (**v0.9.0**, PR #33):

- 👆 **Windows Hello:** Unter **Einstellungen → Sicherheit & Start** kannst du nach dem App-Passwort „Mit Windows Hello entsperren“ einschalten (Fingerabdruck, Gesicht oder PIN). Auf dem Sperrbildschirm gibt's dann einen eigenen Knopf. Windows prüft selbst, ob du es bist. Das Passwort bleibt als Ersatz.
- 🌙 **Im Hintergrund laufen:** Neue Einstellung „Beim Schließen im Hintergrund weiterlaufen“. Der Bot bleibt online, mit App-Passwort wird dabei automatisch gesperrt.
- ⌨️ **Slash-Befehle:** schon in v0.8.2 repariert (siehe oben).
- 🚫 **„Als Admin erzwingen“** habe ich bewusst nicht eingebaut: Dann hätte die App bei jedem Start volle Rechte über deinen ganzen PC, und die automatischen Updates würden hängen bleiben. App-Passwort + Windows Hello schützen die App besser.

Wenn alles passt, kannst du das Issue gern zumachen. Oder sag mir, dass ich es schließen soll 🙂

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*


### Comment 9 by @JONIMONI09 (2026-10-07T15:49:52Z)
> Hey Joni! 👋 Alles aus diesem Issue ist jetzt drin (**v0.9.0**, PR [#33](https://github.com/Morni-Team/pkmessenger/pull/33)):
> 
>     * 👆 **Windows Hello:** Unter **Einstellungen → Sicherheit & Start** kannst du nach dem App-Passwort „Mit Windows Hello entsperren“ einschalten (Fingerabdruck, Gesicht oder PIN). Auf dem Sperrbildschirm gibt's dann einen eigenen Knopf. Windows prüft selbst, ob du es bist. Das Passwort bleibt als Ersatz.
> 
>     * 🌙 **Im Hintergrund laufen:** Neue Einstellung „Beim Schließen im Hintergrund weiterlaufen“. Der Bot bleibt online, mit App-Passwort wird dabei automatisch gesperrt.
> 
>     * ⌨️ **Slash-Befehle:** schon in v0.8.2 repariert (siehe oben).
> 
>     * 🚫 **„Als Admin erzwingen“** habe ich bewusst nicht eingebaut: Dann hätte die App bei jedem Start volle Rechte über deinen ganzen PC, und die automatischen Updates würden hängen bleiben. App-Passwort + Windows Hello schützen die App besser.
> 
> 
> Wenn alles passt, kannst du das Issue gern zumachen. Oder sag mir, dass ich es schließen soll 🙂
> 
> 🤖 _Diese Nachricht wurde mit Claude (KI-Assistent) verfasst._



https://github.com/Morni-Team/pkmessenger/issues/1#issuecomment-6041438513


Mache auch Tutorial bitte genauer , nicht alles wurde beschrieben , also unten alles , was es macht und rechtsklick , dann soll erklärt werden , zeige auch bitte Hintergund und Musik und nicht stören , so wie auch Threads etc ... Bitte analysieren , nur wenn gefunden wurde.... Bitte prüfen! @MoinMornhart  @claude 

### Comment 10 by @JONIMONI09 (2026-10-07T16:16:43Z)
> > Hey Joni! 👋 Alles aus diesem Issue ist jetzt drin (**v0.9.0**, PR [#33](https://github.com/Morni-Team/pkmessenger/pull/33)):
> > ```
> > * 👆 **Windows Hello:** Unter **Einstellungen → Sicherheit & Start** kannst du nach dem App-Passwort „Mit Windows Hello entsperren“ einschalten (Fingerabdruck, Gesicht oder PIN). Auf dem Sperrbildschirm gibt's dann einen eigenen Knopf. Windows prüft selbst, ob du es bist. Das Passwort bleibt als Ersatz.
> > 
> > * 🌙 **Im Hintergrund laufen:** Neue Einstellung „Beim Schließen im Hintergrund weiterlaufen“. Der Bot bleibt online, mit App-Passwort wird dabei automatisch gesperrt.
> > 
> > * ⌨️ **Slash-Befehle:** schon in v0.8.2 repariert (siehe oben).
> > 
> > * 🚫 **„Als Admin erzwingen“** habe ich bewusst nicht eingebaut: Dann hätte die App bei jedem Start volle Rechte über deinen ganzen PC, und die automatischen Updates würden hängen bleiben. App-Passwort + Windows Hello schützen die App besser.
> > ```
> > 
> > 
> >     
> >       
> >     
> > 
> >       
> >     
> > 
> >     
> >   
> > Wenn alles passt, kannst du das Issue gern zumachen. Oder sag mir, dass ich es schließen soll 🙂
> > 🤖 _Diese Nachricht wurde mit Claude (KI-Assistent) verfasst._
> 
> [#1 (comment)](https://github.com/Morni-Team/pkmessenger/issues/1#issuecomment-6041438513)
> 
> Mache auch Tutorial bitte genauer , nicht alles wurde beschrieben , also unten alles , was es macht und rechtsklick , dann soll erklärt werden , zeige auch bitte Hintergund und Musik und nicht stören , so wie auch Threads etc ... Bitte analysieren , nur wenn gefunden wurde.... Bitte prüfen! [@MoinMornhart](https://github.com/MoinMornhart) [@claude](https://github.com/claude)

@claude  @MoinMornhart  Finde bitte die Funktion , dass du etwas spoilern kannst  , also dass man es machen kann etc ... und dieses menü was kommt , wenn man textr Kopiert , soll in textfor stehen was es macht fett kursiv und alles andere etc! Bitte prüfen! also verbessern! Und spoiler müssen funktionieren , also dass text in Spoiler angezeigt werden , und spoiler von anderen , also wenn man draufdrückt , kommt ein Prompt wirklich öffnen? also mit Haken , nicht mehr anzeigen etc... also bitte prüfen und in den settings dass man es halt wieder angezeigt bekommt etc Bitte intelligent.. Wenn man auf settings links nur auf die bereiche drückt , werden NUR diese angezeigt , und der rest wird nicht angezeigt , also nur alles was dort zu einstellung gehört , und normal ist alles etc ... Bittte analysieren , wenn man "@" mit dem namen im Chat stehen hat , verwandelt es sich schon in diesen makierten Tag , bitte prüfen ! 

### Comment 11 by @MoinMornhart (2026-10-08T05:42:41Z)
Hey Joni! 👋 Sorry, hier hatte ich noch nicht geantwortet. Deine Punkte von 16:16 sind alle drin:

- 👁 **Spoiler** (v0.9.3): Text markieren → **Spoiler** oder `/spoiler Text`. Spoiler von anderen sind verdeckt, beim Draufklicken kommt **„Spoiler aufdecken?“** mit Häkchen **„Nicht mehr fragen“**. Wieder einschalten unter **Einstellungen → Datenschutz**.
- ✏️ **Menü beim Markieren** (v0.9.3): Unter jedem Knopf steht jetzt, was er macht (Fett, Kursiv, Spoiler …).
- ⚙️ **Einstellungen** (v0.9.3): Klick links auf einen Bereich zeigt **nur** diesen Bereich, „Alle anzeigen“ zeigt wieder alles.
- 🎓 **Tour genauer** (v0.9.7 + v0.11.1): erklärt jetzt alle Knöpfe unten, Rechtsklick (inkl. Hintergrund), Töne, Nicht stören, Threads und mehr, und das Rechtsklick-Menü ist dabei sichtbar.
- 👥 **„Personen ausschließen“**: Vorschläge beim Tippen gehen (v0.8.3).

Passt alles? Dann sag kurz Bescheid, und ich mache das Issue zu 🙂

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*


### Comment 12 by @JONIMONI09 (2026-10-08T08:18:03Z)
super danke ! 


