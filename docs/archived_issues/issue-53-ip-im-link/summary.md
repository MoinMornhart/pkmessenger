# Issue #53: IP im Link

**Wurde von MoinMornhart geantwortet?** ✅ Ja

## Ursprüngliche Beschreibung
IP adresse im Link sofort beheben , sicherheit warnung jederr kennt IP!!! beheben!!!! @MoinMornhart  @claude  anders lösen!!!!! 

denke auch an die anmeldemöglichkeit das alles kllappt ! also mit dem qrcode! etc aber keine ipadresse verschlüssdele es bitte! 

## Kommentare
### Comment 1 by @MoinMornhart (2026-10-07T20:13:45Z)
Hey Joni! 👋 Behoben, die **IP-Adresse ist raus** (kommt als **v0.11.2**, PR #55):

- 🔗 **Link und QR-Code** enthalten jetzt nur noch den **Namen deines PCs** (z. B. `morni.local`) und einen geheimen Schlüssel. Keine IP mehr.
- 🔐 Der Schlüssel war schon vorher **verschlüsselt** und wird nie übers Netz geschickt. Alles, was zwischen Handy und PC hin- und hergeht, ist verschlüsselt.
- 🙈 Auch in der App steht nirgends mehr eine IP (Geräteliste, Protokoll, Bestätigungsfenster).
- 📱 **Anmelden per QR-Code** klappt wie vorher: scannen → Passwort eingeben → am PC bestätigen. Hab ich komplett durchgespielt (Handy gekoppelt, Nachricht gesendet ✅).
- 🛟 Falls ein Handy den PC-Namen mal nicht findet (manche Android-Geräte), gibt's den Knopf **„Klappt nicht? Ersatz-Link“**.

Kleiner Trost zur Beruhigung: Die alte Adresse war nur die Adresse **in deinem WLAN** (z. B. 192.168…), nicht deine Internet-Adresse. Von außen kam damit niemand rein. Aber du hast recht, ohne ist besser 🙂

Wenn's passt, sag Bescheid, dann mache ich das Issue zu.

---
🤖 *Diese Nachricht wurde mit Claude (KI-Assistent) verfasst.*


### Comment 2 by @JONIMONI09 (2026-10-07T21:09:10Z)
> Hey Joni! 👋 Behoben, die **IP-Adresse ist raus** (kommt als **v0.11.2**, PR [#55](https://github.com/Morni-Team/pkmessenger/pull/55)):
> 
> * 🔗 **Link und QR-Code** enthalten jetzt nur noch den **Namen deines PCs** (z. B. `morni.local`) und einen geheimen Schlüssel. Keine IP mehr.
> * 🔐 Der Schlüssel war schon vorher **verschlüsselt** und wird nie übers Netz geschickt. Alles, was zwischen Handy und PC hin- und hergeht, ist verschlüsselt.
> * 🙈 Auch in der App steht nirgends mehr eine IP (Geräteliste, Protokoll, Bestätigungsfenster).
> * 📱 **Anmelden per QR-Code** klappt wie vorher: scannen → Passwort eingeben → am PC bestätigen. Hab ich komplett durchgespielt (Handy gekoppelt, Nachricht gesendet ✅).
> * 🛟 Falls ein Handy den PC-Namen mal nicht findet (manche Android-Geräte), gibt's den Knopf **„Klappt nicht? Ersatz-Link“**.
> 
> Kleiner Trost zur Beruhigung: Die alte Adresse war nur die Adresse **in deinem WLAN** (z. B. 192.168…), nicht deine Internet-Adresse. Von außen kam damit niemand rein. Aber du hast recht, ohne ist besser 🙂
> 
> Wenn's passt, sag Bescheid, dann mache ich das Issue zu.
> 
> 🤖 _Diese Nachricht wurde mit Claude (KI-Assistent) verfasst._

Verbessern habe dir im Issue beschrieben!!! @claude 

### Comment 3 by @JONIMONI09 (2026-10-08T08:04:43Z)
@claude  @MoinMornhart  WEnn sich auch namen ändern etc , oder ich meinen namen ändere , und andere im chat noch mein Ping steht , muss der mitgeändert werden ÜBERALL!!! also aauch bei systemnachrichten! und mache dieses Limit mit der stunde weg , also bitte schaue aauch andere issues ... danke @MoinMornhart  @claude  :)

### Comment 4 by @JONIMONI09 (2026-10-08T08:05:32Z)
> [@claude](https://github.com/claude) [@MoinMornhart](https://github.com/MoinMornhart) WEnn sich auch namen ändern etc , oder ich meinen namen ändere , und andere im chat noch mein Ping steht , muss der mitgeändert werden ÜBERALL!!! also aauch bei systemnachrichten! und mache dieses Limit mit der stunde weg , also bitte schaue aauch andere issues ... danke [@MoinMornhart](https://github.com/MoinMornhart) [@claude](https://github.com/claude) :)

also auch wenn ich mich noch in der aapp befinde , muss es funktionieren!!!!! Danke :)  @MoinMornhart  @claude 

### Comment 5 by @JONIMONI09 (2026-10-09T13:45:31Z)
Dieses Issue wurde analysiert und behoben. Es wird nun geschlossen. (Automated by Antigravity)


