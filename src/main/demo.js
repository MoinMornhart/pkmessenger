'use strict';

// DEMO-MODUS (nur Entwicklung, `npm run demo`): simulierte Server/Kanäle/Nachrichten OHNE Discord-Verbindung.
// Dient für Screenshots und UI-Tests ohne Token. Die Oberfläche zeigt deutlich "DEMO" an.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SnowflakeUtil } = require('discord.js');
const { createFakeWorld, FAKE_TOKEN, makeMessage, Events } = require('../../tests/helpers/fake-discord');

// Keine Discord-Standardavatare: PKMessenger zeigt eigene Initialen-Avatare.
function avatarFor() {
  return () => null;
}

function createDemo() {
  const world = createFakeWorld();
  const { guild, channels, client } = world;
  guild.name = 'PK Testserver';
  guild.nameAcronym = 'PK';
  client.user.username = 'PKBot';
  client.user.displayAvatarURL = avatarFor(5);

  const people = [
    ['555555555555555501', 'Anna'],
    ['555555555555555502', 'Bernd'],
    ['555555555555555503', 'Chiara'],
  ].map(([id, name], i) => {
    const u = world.addMember(id, name);
    u.globalName = name;
    u.displayAvatarURL = avatarFor(i + 1);
    guild.members.cache.get(id).displayAvatarURL = avatarFor(i + 1);
    return u;
  });
  const [anna, bernd, chiara] = people;
  const mods = guild.roles.cache.get('333333333333333301');

    const now = Date.now();
  const add = (ch, author, content, minutesAgo, mentions) => {
    const ts = now - minutesAgo * 60000;
    const m = makeMessage({ id: SnowflakeUtil.generate({ timestamp: ts }).toString(), channel: ch, author, content, createdTimestamp: ts, mentions });
    ch.store.push(m);
    ch.lastMessageId = m.id;
    return m;
  };

  const a = channels.allgemein;
  a.topic = 'Alles rund um den Server – bitte freundlich bleiben';
  add(a, bernd, 'Moin zusammen! Hat jemand Lust, heute Abend das neue Projekt zu besprechen?', 26 * 60);
  add(a, anna, 'Klar, ab 19 Uhr bin ich da.', 26 * 60 - 2);
  add(a, anna, 'Ich bringe die Notizen von letzter Woche mit.', 26 * 60 - 1);
  add(a, chiara, 'Super, ich schau auch rein 👍', 25 * 60);
  add(a, bernd, 'Kurzer Reminder für alle: das **Repo** ist jetzt umgezogen → https://example.com/pk-projekt', 95);
  add(a, client.user, `Willkommen <@${chiara.id}>! Die Regeln findest du in <#${channels.ankuendigungen.id}>.`, 60, { users: [chiara], channels: [channels.ankuendigungen] });
  add(a, anna, `Danke! <@&${mods.id}> könnt ihr mir die Rolle "Projekt" geben?`, 40, { roles: [mods] });
  add(a, chiara, 'Hier ein Code-Beispiel aus dem Bot:\n```js\nchannel.send({ content: "Hallo", allowedMentions: { parse: [] } });\n```', 12);
  add(a, bernd, 'Sieht gut aus. `allowedMentions` ist wichtig, damit niemand aus Versehen gepingt wird.', 9);
  add(a, anna, 'Genau, und @everyone nur mit Bestätigung 😄', 8);

  channels.ankuendigungen.topic = 'Wichtige Infos';
  add(channels.ankuendigungen, client.user, '📢 Server-Regeln:\n1. Respektvoll bleiben\n2. Kein Spam\n3. Bot-Befehle nur in #projekt-a', 3 * 24 * 60);
  add(channels.projektA, chiara, 'Projekt A startet nächste Woche!', 300);
  add(channels.nurLesen, bernd, 'Dieser Kanal ist für den Bot nur lesbar.', 500);
  for (let i = 0; i < 260; i++) add(channels.projektA, i % 2 ? anna : bernd, `Testnachricht Nr. ${i + 1} für das Nachladen & die Virtualisierung`, 290 - i);

  // Live-Simulation: gelegentlich tippt jemand und schreibt eine Nachricht.
  const lines = ['Hat jemand die neue Version schon getestet?', 'Läuft bei mir flüssig 🚀', 'Ich bin gleich wieder da.', 'Top, danke für die Info!'];
  let i = 0;
  const live = setInterval(() => {
    const who = people[i % people.length];
    const ch = i % 3 === 2 ? channels.projektA : channels.allgemein;
    client.emit(Events.TypingStart, { guild, channel: ch, user: who, member: { displayName: who.globalName } });
    setTimeout(() => {
      const m = makeMessage({ id: SnowflakeUtil.generate().toString(), channel: ch, author: who, content: lines[i++ % lines.length], createdTimestamp: Date.now() });
      ch.store.push(m);
      ch.lastMessageId = m.id;
      client.emit(Events.MessageCreate, m);
    }, 3500);
  }, 15000);
  live.unref?.();

  const envPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pk-demo-')), '.env');
  fs.writeFileSync(envPath, `DISCORD_TOKEN=${FAKE_TOKEN}\n`);
  return { world, envPath, createClient: () => client };
}

module.exports = { createDemo };
