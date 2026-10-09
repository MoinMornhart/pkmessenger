# Issue #35: alles fixen bitte!

**Wurde von MoinMornhart geantwortet?** ✅ Ja

## Ursprüngliche Beschreibung
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
> 
> @claude  @MoinMornhart  Finde bitte die Funktion , dass du etwas spoilern kannst  , also dass man es machen kann etc ... und dieses menü was kommt , wenn man textr Kopiert , soll in textfor stehen was es macht fett kursiv und alles andere etc! Bitte prüfen! also verbessern! Und spoiler müssen funktionieren , also dass text in Spoiler angezeigt werden , und spoiler von anderen , also wenn man draufdrückt , kommt ein Prompt wirklich öffnen? also mit Haken , nicht mehr anzeigen etc... also bitte prüfen und in den settings dass man es halt wieder angezeigt bekommt etc Bitte intelligent.. Wenn man auf settings links nur auf die bereiche drückt , werden NUR diese angezeigt , und der rest wird nicht angezeigt , also nur alles was dort zu einstellung gehört , und normal ist alles etc ... Bittte analysieren , wenn man "@" mit dem namen im Chat stehen hat , verwandelt es sich schon in diesen makierten Tag , bitte prüfen !  

 _Originally posted by @JONIMONI09 in [#29](https://github.com/Morni-Team/pkmessenger/issues/29#issuecomment-6041987547)_

## Kommentare
### Comment 1 by @MoinMornhart (2026-10-07T16:47:38Z)
Hey Joni! 👋 Alles aus diesem Issue ist erledigt (kommt als **v0.9.3**, PR #37):

- 👁 **Spoiler** machst du so: Text markieren → **Spoiler** im Menü, oder `/spoiler dein Text`. Spoiler von anderen werden verdeckt angezeigt. Beim Draufklicken kommt erst **„Spoiler aufdecken?“** mit Häkchen **„Nicht mehr fragen“**. Wieder einschalten kannst du das unter **Einstellungen → Datenschutz**.
- 🕵️ Dabei habe ich noch einen Fehler gefunden: In der Chatliste links stand der Spoiler-Text bisher **offen** in der Vorschau. Jetzt steht da ▒▒▒▒.
- ✍️ Das **Menü beim Markieren** zeigt unter jedem Symbol, was es macht: Fett, Kursiv, Unterstr., Durchgestr., Code, Spoiler, Zitat.
- ⚙️ **Einstellungen:** Klick links auf einen Bereich → nur dieser Bereich wird angezeigt. **„📋 Alle anzeigen“** zeigt wieder alles.
- **@ Namen:** Tippst du `@anna ` von Hand, wird es zur richtigen markierten Erwähnung, wenn der Name eindeutig ist.

Wenn's passt, sag Bescheid, dann mache ich das Issue zu 🙂

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*


### Comment 2 by @JONIMONI09 (2026-10-07T19:34:31Z)
> Hey Joni! 👋 Alles aus diesem Issue ist erledigt (kommt als **v0.9.3**, PR [#37](https://github.com/Morni-Team/pkmessenger/pull/37)):
> 
>     * 👁 **Spoiler** machst du so: Text markieren → **Spoiler** im Menü, oder `/spoiler dein Text`. Spoiler von anderen werden verdeckt angezeigt. Beim Draufklicken kommt erst **„Spoiler aufdecken?“** mit Häkchen **„Nicht mehr fragen“**. Wieder einschalten kannst du das unter **Einstellungen → Datenschutz**.
> 
>     * 🕵️ Dabei habe ich noch einen Fehler gefunden: In der Chatliste links stand der Spoiler-Text bisher **offen** in der Vorschau. Jetzt steht da ▒▒▒▒.
> 
>     * ✍️ Das **Menü beim Markieren** zeigt unter jedem Symbol, was es macht: Fett, Kursiv, Unterstr., Durchgestr., Code, Spoiler, Zitat.
> 
>     * ⚙️ **Einstellungen:** Klick links auf einen Bereich → nur dieser Bereich wird angezeigt. **„📋 Alle anzeigen“** zeigt wieder alles.
> 
>     * **@ Namen:** Tippst du `@anna ` von Hand, wird es zur richtigen markierten Erwähnung, wenn der Name eindeutig ist.
> 
> 
> Wenn's passt, sag Bescheid, dann mache ich das Issue zu 🙂
> 
> 🤖 _Diese Nachricht wurde mit Claude (KI-Assistent) verfasst._



<img width="2559" height="1390" alt="Image" src="https://github.com/user-attachments/assets/5f58349d-0a81-4585-abf4-74898624a673" />


Also wenn assistent oder tour ist , soll man alles sehen können , so wie beim chat , die Box , wo dass alles drinnen steht , muss drüber angezeigt werden ... und auf dem bild bitte fixen , also wenn man rechtsklick macht , dass dann bitte auch dann auf dieses kurze m,enü verwiesen wird , und die auswahl nochmal dort angezeigt wird etc ... bitte analysieren etc! Bitte prüfen , sicherstellen , dass alles sichtbar ist und so , bitte visuell probieren!!!!! und qr Code sachen implementieren!  @MoinMornhart  @claude 


### Comment 3 by @MoinMornhart (2026-10-07T20:13:47Z)
Hey Joni! 👋 Deine Punkte von 19:34 sind erledigt:

- 👁 **Tour und Menüs** (v0.11.1, PR #54): Ist bei der Tour ein **Rechtsklick-Menü**, die Smiley-Auswahl oder ein Vorschlags-Fenster offen, wird es jetzt **mit hervorgehoben** und liegt **über** allem. Die Tour bittet dich jetzt auch: **„Mach mal Rechtsklick auf einen Chat“** bzw. **„… auf eine Nachricht“**, wartet, bis das Menü offen ist, und erklärt dann die Einträge **direkt am Menü**. Die Erklär-Box rutscht dabei zur Seite, damit sie nichts verdeckt. Hab ich mit Bildern geprüft ✅
- 📱 **QR-Code** (v0.11.0 + v0.11.2): Anmelden per QR-Code ist drin, Details stehen in #50.

Wenn's passt, sag Bescheid, dann mache ich das Issue zu.

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*


### Comment 4 by @JONIMONI09 (2026-10-08T08:17:30Z)
super danke


