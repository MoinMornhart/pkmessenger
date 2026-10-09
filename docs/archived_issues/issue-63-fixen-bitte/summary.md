# Issue #63: fixen bitte

**Wurde von MoinMornhart geantwortet?** ❌ Nein

## Ursprüngliche Beschreibung
> > ## Worum geht's?
> > Zwei Fehler, beide wichtig:
> > ```
> > 1. **Android-App (v0.13.0):** Capacitor schickt Anfragen auf dem Handy über einen eigenen internen Weg (`https://localhost/_capacitor_http_interceptor_`). Die strenge Sicherheitsregel (CSP) hat den blockiert. In der echten App wären dadurch **die Discord-Anfragen gescheitert**. Gefunden im Protokoll des Emulator-Tests. PR [Android-App: PKMessenger als APK (v0.13.0) #60](https://github.com/Morni-Team/pkmessenger/pull/60) wurde zusammengeführt, kurz bevor diese Korrektur fertig war.
> > 
> > 2. **„Das ist neu“ ([Abhängigkeit aktualisieren: electron #44](https://github.com/Morni-Team/pkmessenger/issues/44)):** kam nach Updates nie. Grund war ein kaputtes Muster beim Merken der zuletzt gesehenen Version, dadurch galt jeder Start als „erster Start“.
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
> > ## Was ändert sich?
> > ```
> > * CSP erlaubt zusätzlich nur den **eigenen** internen Weg (`'self'`), sonst bleibt alles gleich streng
> > 
> > * Status- und Navigationsleiste auf Android dunkel (passt zum Design)
> > 
> > * Versionsmuster repariert, neuer Test `test-prefs-whatsnew.js`
> > 
> > * Emulator-Test prüft jetzt auch den **echten Netzweg** (Abfrage bei GitHub)
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
> > ## Geprüft
> > ```
> > * `npm test`: 316/316 grün
> > 
> > * PC-Demo-Lauf: „Das ist neu“ erscheint (2 Versionen, 6 Punkte), Layout ok
> > 
> > * Android-Bildtest ok; Emulator-Test läuft in der CI
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
> > Version 0.13.1 → wird nach dem Zusammenführen automatisch veröffentlicht (Windows + Android).
> > Refs #56, #44
> > 🤖 Generated with [Claude Code](https://claude.com/claude-code)
> > 🤖 _Diese Nachricht wurde mit Claude (KI-Assistent) verfasst._
> 
> @claude SUPER! Danke für alles! Bitte mache alles bitte zuende und weiter , daass alles funktioniert , schaue Issues , und behebe diese alle und bearbeiten! mache es so , dass man Sprachkanäle auch einklaappen kann also alle eigentlich , die man ausblenden kann etc .. es soll nochmal so ein Chateinstellung bzw floatingfenster geben , welche Kanäle man ignorieren soll , also bei Alarmen , und sound einstellung , und halt über dieses schnellefloatingfenster! Also halt , dass alles klappt etc ... und auch bitte UI fixes , siehe bitte issues!!!!

@claude  Bitte arbeite mal alles richtig ab , daanke ...

_Originally posted by @JONIMONI09 in https://github.com/Morni-Team/pkmessenger/issues/61#issuecomment-6055693104_
            

## Kommentare
### Comment 1 by @JONIMONI09 (2026-10-08T08:20:27Z)
> > > ## Worum geht's?
> > > Zwei Fehler, beide wichtig:
> > > ```
> > > 1. **Android-App (v0.13.0):** Capacitor schickt Anfragen auf dem Handy über einen eigenen internen Weg (`https://localhost/_capacitor_http_interceptor_`). Die strenge Sicherheitsregel (CSP) hat den blockiert. In der echten App wären dadurch **die Discord-Anfragen gescheitert**. Gefunden im Protokoll des Emulator-Tests. PR [Android-App: PKMessenger als APK (v0.13.0) #60](https://github.com/Morni-Team/pkmessenger/pull/60) wurde zusammengeführt, kurz bevor diese Korrektur fertig war.
> > > 
> > > 2. **„Das ist neu“ ([Abhängigkeit aktualisieren: electron #44](https://github.com/Morni-Team/pkmessenger/issues/44)):** kam nach Updates nie. Grund war ein kaputtes Muster beim Merken der zuletzt gesehenen Version, dadurch galt jeder Start als „erster Start“.
> > > ```
> > > 
> > > 
> > >     
> > >       
> > >     
> > > 
> > >       
> > >     
> > > 
> > >     
> > >   
> > > ## Was ändert sich?
> > > ```
> > > * CSP erlaubt zusätzlich nur den **eigenen** internen Weg (`'self'`), sonst bleibt alles gleich streng
> > > 
> > > * Status- und Navigationsleiste auf Android dunkel (passt zum Design)
> > > 
> > > * Versionsmuster repariert, neuer Test `test-prefs-whatsnew.js`
> > > 
> > > * Emulator-Test prüft jetzt auch den **echten Netzweg** (Abfrage bei GitHub)
> > > ```
> > > 
> > > 
> > >     
> > >       
> > >     
> > > 
> > >       
> > >     
> > > 
> > >     
> > >   
> > > ## Geprüft
> > > ```
> > > * `npm test`: 316/316 grün
> > > 
> > > * PC-Demo-Lauf: „Das ist neu“ erscheint (2 Versionen, 6 Punkte), Layout ok
> > > 
> > > * Android-Bildtest ok; Emulator-Test läuft in der CI
> > > ```
> > > 
> > > 
> > >     
> > >       
> > >     
> > > 
> > >       
> > >     
> > > 
> > >     
> > >   
> > > Version 0.13.1 → wird nach dem Zusammenführen automatisch veröffentlicht (Windows + Android).
> > > Refs [#56](https://github.com/Morni-Team/pkmessenger/issues/56), [#44](https://github.com/Morni-Team/pkmessenger/issues/44)
> > > 🤖 Generated with [Claude Code](https://claude.com/claude-code)
> > > 🤖 _Diese Nachricht wurde mit Claude (KI-Assistent) verfasst._
> > 
> > 
> > [@claude](https://github.com/claude) SUPER! Danke für alles! Bitte mache alles bitte zuende und weiter , daass alles funktioniert , schaue Issues , und behebe diese alle und bearbeiten! mache es so , dass man Sprachkanäle auch einklaappen kann also alle eigentlich , die man ausblenden kann etc .. es soll nochmal so ein Chateinstellung bzw floatingfenster geben , welche Kanäle man ignorieren soll , also bei Alarmen , und sound einstellung , und halt über dieses schnellefloatingfenster! Also halt , dass alles klappt etc ... und auch bitte UI fixes , siehe bitte issues!!!!
> 
> [@claude](https://github.com/claude) Bitte arbeite mal alles richtig ab , daanke ...
> 
> _Originally posted by [@JONIMONI09](https://github.com/JONIMONI09) in [#61 (comment)](https://github.com/Morni-Team/pkmessenger/pull/61#issuecomment-6055693104)_

@MoinMornhart  @claude  Mache bitte weiter! 

### Comment 2 by @JONIMONI09 (2026-10-08T08:28:43Z)
@claude  und prüfe ob alles auf grünen stand ist und aktuell ist! schaue in allen issues bitte rein!  @MoinMornhart 

### Comment 3 by @JONIMONI09 (2026-10-09T13:45:34Z)
Dieses Issue wurde analysiert und behoben. Es wird nun geschlossen. (Automated by Antigravity)


