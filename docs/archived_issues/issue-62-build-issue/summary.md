# Issue #62: Build issue!

**Wurde von MoinMornhart geantwortet?** ❌ Nein

## Ursprüngliche Beschreibung
Bitte immer CI checken , und wenn fehlscghlägt autonom fixen , merke dir dass bitte , trage es dir bitte in deinen Regeln ein , und prüfen , ob schon gemerged ist , wenn ja , dann fixe es , so wie Conflicte immer prüfen!!! claude.md bitte anpassen und andere!!!! 

Run reactivecircus/android-emulator-runner@a421e43855164a8197daf9d8d40fe71c6996bb0d
Configure emulator
Install Android SDK
Create AVD
Launch Emulator
/usr/bin/sh -c bash scripts/android-emulator-test.sh
INFO         | Boot completed in 31146 ms
INFO         | Increasing screen off timeout, logcat buffer size to 2M.
Performing Streamed Install
Success
Starting: Intent { cmp=io.github.morniteam.pkmessenger/.MainActivity }
Bild: 01-chatliste
Bild: 02-chat
Bild: 03-gesendet
Bild: 04-menue
Bild: 05-einstellungen
10-08 07:40:47.597  1920  1920 I Capacitor/Console: File: https://localhost/app.js - Line 43656 - Msg: [pk-autoplay] schritt 1 liste chats=0 verbunden=true
10-08 07:40:57.689  1920  1920 I Capacitor/Console: File: https://localhost/app.js - Line 43656 - Msg: [pk-autoplay] schritt 2 chat gesendet=true
10-08 07:41:05.191  1920  1920 I Capacitor/Console: File: https://localhost/app.js - Line 43656 - Msg: [pk-autoplay] schritt 3 menue=true
10-08 07:41:14.877  1920  1920 I Capacitor/Console: File: https://localhost/app.js - Line 43656 - Msg: [pk-autoplay] schritt 4 einstellungen=true zurueck=true ueberstand=false update=error
10-08 07:41:14.877  1920  1920 I Capacitor/Console: File: https://localhost/app.js - Line 43656 - Msg: [pk-autoplay] ERGEBNIS FEHLER {"chats":0,"verbunden":true,"gesendet":true,"menue":true,"zurueck":true,"einstellungen":true,"ueberstand":false,"update":"error"}
    versionName=124.0.6367.219
Error: Android-Emulator-Test fehlgeschlagen – siehe Artefakt android-test (Screenshots + autoplay.txt)
Error: The process '/usr/bin/sh' failed with exit code 1
Terminate Emulator
INFO         | Wait for emulator (pid 3680) 20 seconds to shutdown gracefully before kill;you can set environment variable ANDROID_EMULATOR_WAIT_TIME_BEFORE_KILL(in seconds) to change the default value (20 seconds)

USER_INFO    | Snapshots have been disabled by the user, save request is ignored.
INFO         | Saving snapshot 'default_boot' took 0 ms
ERROR        | stop: Not implemented
WARNING      | Emulator client has not yet been configured.. Call configure me first!
INFO         | removeAll
WARNING      | Netsim Wifi dns:///localhost:38723 is gone due to Stream removed (CANCELLED)





@claude  @MoinMornhart 

## Kommentare
### Comment 1 by @JONIMONI09 (2026-10-08T07:47:12Z)
> Bitte immer CI checken , und wenn fehlscghlägt autonom fixen , merke dir dass bitte , trage es dir bitte in deinen Regeln ein , und prüfen , ob schon gemerged ist , wenn ja , dann fixe es , so wie Conflicte immer prüfen!!! claude.md bitte anpassen und andere!!!!
> 
> Run [ReactiveCircus/android-emulator-runner@a421e43](https://github.com/ReactiveCircus/android-emulator-runner/commit/a421e43855164a8197daf9d8d40fe71c6996bb0d) Configure emulator Install Android SDK Create AVD Launch Emulator /usr/bin/sh -c bash scripts/android-emulator-test.sh INFO | Boot completed in 31146 ms INFO | Increasing screen off timeout, logcat buffer size to 2M. Performing Streamed Install Success Starting: Intent { cmp=io.github.morniteam.pkmessenger/.MainActivity } Bild: 01-chatliste Bild: 02-chat Bild: 03-gesendet Bild: 04-menue Bild: 05-einstellungen 10-08 07:40:47.597 1920 1920 I Capacitor/Console: File: https://localhost/app.js - Line 43656 - Msg: [pk-autoplay] schritt 1 liste chats=0 verbunden=true 10-08 07:40:57.689 1920 1920 I Capacitor/Console: File: https://localhost/app.js - Line 43656 - Msg: [pk-autoplay] schritt 2 chat gesendet=true 10-08 07:41:05.191 1920 1920 I Capacitor/Console: File: https://localhost/app.js - Line 43656 - Msg: [pk-autoplay] schritt 3 menue=true 10-08 07:41:14.877 1920 1920 I Capacitor/Console: File: https://localhost/app.js - Line 43656 - Msg: [pk-autoplay] schritt 4 einstellungen=true zurueck=true ueberstand=false update=error 10-08 07:41:14.877 1920 1920 I Capacitor/Console: File: https://localhost/app.js - Line 43656 - Msg: [pk-autoplay] ERGEBNIS FEHLER {"chats":0,"verbunden":true,"gesendet":true,"menue":true,"zurueck":true,"einstellungen":true,"ueberstand":false,"update":"error"} versionName=124.0.6367.219 Error: Android-Emulator-Test fehlgeschlagen – siehe Artefakt android-test (Screenshots + autoplay.txt) Error: The process '/usr/bin/sh' failed with exit code 1 Terminate Emulator INFO | Wait for emulator (pid 3680) 20 seconds to shutdown gracefully before kill;you can set environment variable ANDROID_EMULATOR_WAIT_TIME_BEFORE_KILL(in seconds) to change the default value (20 seconds)
> 
> USER_INFO | Snapshots have been disabled by the user, save request is ignored. INFO | Saving snapshot 'default_boot' took 0 ms ERROR | stop: Not implemented WARNING | Emulator client has not yet been configured.. Call configure me first! INFO | removeAll WARNING | Netsim Wifi dns:///localhost:38723 is gone due to Stream removed (CANCELLED)
> 
> [@claude](https://github.com/claude) [@MoinMornhart](https://github.com/MoinMornhart)

@claude  wurde schon behoben!

Danke! aber trotzdem IMMER schnell schauen!!!!!!  Fixe aber bitte einen Bug ... bei settings , wenn alle ausgewählt wurden , bleibt , trotzdem eine davon makiert etc ... bitte schauen ... aanalysieren!!!! mache es intelligent!!!! thx

### Comment 2 by @JONIMONI09 (2026-10-08T07:50:35Z)
> > Bitte immer CI checken , und wenn fehlscghlägt autonom fixen , merke dir dass bitte , trage es dir bitte in deinen Regeln ein , und prüfen , ob schon gemerged ist , wenn ja , dann fixe es , so wie Conflicte immer prüfen!!! claude.md bitte anpassen und andere!!!!
> > Run [ReactiveCircus/android-emulator-runner@a421e43](https://github.com/ReactiveCircus/android-emulator-runner/commit/a421e43855164a8197daf9d8d40fe71c6996bb0d) Configure emulator Install Android SDK Create AVD Launch Emulator /usr/bin/sh -c bash scripts/android-emulator-test.sh INFO | Boot completed in 31146 ms INFO | Increasing screen off timeout, logcat buffer size to 2M. Performing Streamed Install Success Starting: Intent { cmp=io.github.morniteam.pkmessenger/.MainActivity } Bild: 01-chatliste Bild: 02-chat Bild: 03-gesendet Bild: 04-menue Bild: 05-einstellungen 10-08 07:40:47.597 1920 1920 I Capacitor/Console: File: https://localhost/app.js - Line 43656 - Msg: [pk-autoplay] schritt 1 liste chats=0 verbunden=true 10-08 07:40:57.689 1920 1920 I Capacitor/Console: File: https://localhost/app.js - Line 43656 - Msg: [pk-autoplay] schritt 2 chat gesendet=true 10-08 07:41:05.191 1920 1920 I Capacitor/Console: File: https://localhost/app.js - Line 43656 - Msg: [pk-autoplay] schritt 3 menue=true 10-08 07:41:14.877 1920 1920 I Capacitor/Console: File: https://localhost/app.js - Line 43656 - Msg: [pk-autoplay] schritt 4 einstellungen=true zurueck=true ueberstand=false update=error 10-08 07:41:14.877 1920 1920 I Capacitor/Console: File: https://localhost/app.js - Line 43656 - Msg: [pk-autoplay] ERGEBNIS FEHLER {"chats":0,"verbunden":true,"gesendet":true,"menue":true,"zurueck":true,"einstellungen":true,"ueberstand":false,"update":"error"} versionName=124.0.6367.219 Error: Android-Emulator-Test fehlgeschlagen – siehe Artefakt android-test (Screenshots + autoplay.txt) Error: The process '/usr/bin/sh' failed with exit code 1 Terminate Emulator INFO | Wait for emulator (pid 3680) 20 seconds to shutdown gracefully before kill;you can set environment variable ANDROID_EMULATOR_WAIT_TIME_BEFORE_KILL(in seconds) to change the default value (20 seconds)
> > USER_INFO | Snapshots have been disabled by the user, save request is ignored. INFO | Saving snapshot 'default_boot' took 0 ms ERROR | stop: Not implemented WARNING | Emulator client has not yet been configured.. Call configure me first! INFO | removeAll WARNING | Netsim Wifi dns:///localhost:38723 is gone due to Stream removed (CANCELLED)
> > [@claude](https://github.com/claude) [@MoinMornhart](https://github.com/MoinMornhart)
> 
> [@claude](https://github.com/claude) wurde schon behoben!
> 
> Danke! aber trotzdem IMMER schnell schauen!!!!!! Fixe aber bitte einen Bug ... bei settings , wenn alle ausgewählt wurden , bleibt , trotzdem eine davon makiert etc ... bitte schauen ... aanalysieren!!!! mache es intelligent!!!! thx



[7](https://github.com/Morni-Team/pkmessenger/actions/runs/37744394464/job/113202321439?pr=61#step:10:212)
Error: Android-Emulator-Test fehlgeschlagen – siehe Artefakt android-test (Screenshots + autoplay.txt)
Error: The process '/usr/bin/sh' failed with exit code 1
Terminate Emulator
USER_INFO    | Snapshots have been disabled by the user, save request is ignored.
INFO         | Saving snapshot 'default_boot' took 0 ms
ERROR        | stop: Not implemented
WARNING      | Emulator client has not yet been configured.. Call configure me first!
INFO         | removeAll
WARNING      | Netsim Wifi dns:///localhost:45133 is gone due to Stream removed (CANCELLED)

### Comment 3 by @JONIMONI09 (2026-10-08T08:03:05Z)
wurde behoben! 


