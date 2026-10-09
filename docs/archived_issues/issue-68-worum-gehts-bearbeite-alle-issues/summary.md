# Issue #68: > ## Worum geht's? bearbeite alle ISSUES!!! 

**Wurde von MoinMornhart geantwortet?** ❌ Nein

## Ursprüngliche Beschreibung
> ## Worum geht's?
> 
> Jonis Liste von heute Vormittag (#53, #56, #61, #62):
> 
>     * 💬 **Privatchat ([Erstelle im Projekt extra dass gleiche nur für Android Electron benutzen! #56](https://github.com/Morni-Team/pkmessenger/issues/56)):** Beim @ werden nur noch Leute vorgeschlagen, die **wirklich im Privatchat** sind. Andere würden die Nachricht ja nicht sehen. Schon geschriebene Erwähnungen zeigen jetzt den **echten Namen** statt „@UNBekannt“.
> 
>     * ✏️ **Namen live ([IP im Link #53](https://github.com/Morni-Team/pkmessenger/issues/53)):** Ändert jemand den Namen (auch der Bot oder sein Spitzname), wird er **sofort überall** ersetzt: in Nachrichten, Erwähnungen und Systemnachrichten, ohne Neuladen.
> 
>     * 🔔 **Schnellfenster pro Chat ([Korrektur: Android-Netzweg + „Das ist neu“ (v0.13.1) #61](https://github.com/Morni-Team/pkmessenger/pull/61)):** Glocke oben im Chat (oder Rechtsklick/langer Druck → „Benachrichtigungen …“): **Alle**, **Nur Erwähnungen** oder **Stumm**, dazu ein **eigener Ton**. Gilt für diesen Chat, den ganzen Server oder alle Privatchats. Stumme Chats zeigen 🔕 in der Liste.
> 
>     * 📂 **Einklappen ([Korrektur: Android-Netzweg + „Das ist neu“ (v0.13.1) #61](https://github.com/Morni-Team/pkmessenger/pull/61)):** „Sprachkanäle“ und „Weitere Kanäle“ lassen sich einklappen wie Kategorien.
> 
>     * ⚙️ **Einstellungen ([Build issue! #62](https://github.com/Morni-Team/pkmessenger/issues/62)):** Bei „Alle anzeigen“ ist nur noch dieser Knopf markiert; ein dezenter Strich zeigt, wo man gerade ist.
> 
>     * 📝 **CI-Regel ([Build issue! #62](https://github.com/Morni-Team/pkmessenger/issues/62)):** steht jetzt in `AGENTS.md` und in der neuen `CLAUDE.md`. Nach jedem Push werden die Checks abgewartet, Fehler selbst behoben, gemergte PRs per neuem PR korrigiert und Konflikte geprüft.
> 
> 
> ## Nicht möglich
> 
>     * „2 Namensänderungen pro Stunde“ ist eine **feste Grenze von Discord** für Bot-Namen, die App darf sie nicht umgehen. Schnell geht dafür der **Spitzname pro Server**.
> 
>     * Namensänderungen **anderer** Personen schickt Discord ohne die Erlaubnis „Server Members Intent“ erst, wenn die Person wieder etwas überträgt (z. B. eine neue Nachricht).
> 
> 
> ## Hinweis
> 
> Der Fix für die Design-Vorschau auf Android (#64) ist **nicht** dabei, weil Joni ihn mit #65 zurückgenommen hat.
> ## Geprüft
> 
>     * `npm test`: 323/323 grün (neu: `test-names-live.js`, `test-chat-notify.js`)
> 
>     * PC-Demo-Lauf (85 Bilder): Schnellfenster + 🔕, Abschnitt eingeklappt, nur ein Knopf voll markiert, @ im Privatchat zeigt nur Anna
> 
>     * Android-Bildtest ok
> 
> 
> Version 0.13.2.
> 
> Refs #53, #56, #61, #62
> 
> 🤖 Generated with [Claude Code](https://claude.com/claude-code)
> 
> 🤖 _Diese Nachricht wurde mit Claude (KI-Assistent) verfasst._

@claude  Bitte Arbeitszeiten auf 15 Minuten chrone Jobs bei dir machen , und wenn geraade aktiv gearbeitet wird , dann bitte 5 Minuten on bleiben , wenn alles behioben , dann wieder warten ! Passe auch bitte deine claude.md an , auf englisch bitte , und lass sie nur lokal nicht für andere sichtbar , sowie error aauf englisch und agents.md auf englisch , und lokal NUR für dich , und über andere auch nicht bearbeitbar machen  , wenn sie PR machen wollen etc!!! Bitte denke schlau weiter!!!!! Denkle intelligent!!!!!v @claude  @MoinMornhart

_Originally posted by @JONIMONI09 in https://github.com/Morni-Team/pkmessenger/issues/67#issuecomment-6055996132_
            

## Kommentare
### Comment 1 by @JONIMONI09 (2026-10-08T08:36:20Z)
@claude  @MoinMornhart  Ist sehr wichtig! 

### Comment 2 by @JONIMONI09 (2026-10-09T13:45:36Z)
Dieses Issue wurde analysiert und behoben. Es wird nun geschlossen. (Automated by Antigravity)


