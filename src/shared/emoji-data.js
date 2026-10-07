'use strict';

// Smiley-Auswahl (Issue #1: „mehr Smileys“): Kategorien wie im Discord-Client, mit deutschen Suchwörtern.
// Format je Eintrag: [Emoji, 'suchwörter durch leerzeichen']
const CATEGORIES = [
  {
    id: 'smileys',
    label: '😀',
    title: 'Smileys',
    items: [
      ['😀', 'grinsen lachen froh'], ['😃', 'lachen froh'], ['😄', 'lachen freude'], ['😁', 'grinsen zähne'], ['😆', 'lachen'], ['😅', 'schweiß lachen puh'],
      ['🤣', 'kugeln lachen'], ['😂', 'tränen lachen'], ['🙂', 'lächeln'], ['🙃', 'kopfüber'], ['😉', 'zwinkern'], ['😊', 'lächeln rot'],
      ['😇', 'engel unschuldig'], ['🥰', 'verliebt herzen'], ['😍', 'herzaugen verliebt'], ['🤩', 'sterne begeistert'], ['😘', 'kuss'], ['😋', 'lecker'],
      ['😛', 'zunge'], ['😜', 'zunge zwinkern'], ['🤪', 'verrückt'], ['😝', 'zunge augen zu'], ['🤑', 'geld'], ['🤗', 'umarmung'],
      ['🤭', 'kichern hand'], ['🤫', 'psst leise'], ['🤔', 'nachdenken hmm'], ['🤐', 'mund zu'], ['🤨', 'skeptisch'], ['😐', 'neutral'],
      ['😑', 'ausdruckslos'], ['😶', 'sprachlos'], ['😏', 'grinsen schief'], ['😒', 'genervt'], ['🙄', 'augenrollen'], ['😬', 'grimasse'],
      ['😌', 'erleichtert'], ['😔', 'nachdenklich traurig'], ['😪', 'müde'], ['🤤', 'sabbern'], ['😴', 'schlafen'], ['😷', 'maske krank'],
      ['🤒', 'fieber krank'], ['🤕', 'verletzt'], ['🤢', 'übel'], ['🤮', 'kotzen'], ['🥵', 'heiß schwitzen'], ['🥶', 'kalt frieren'],
      ['🥴', 'benommen'], ['😵', 'schwindelig'], ['🤯', 'explodierender kopf krass'], ['🤠', 'cowboy'], ['🥳', 'party feiern'], ['😎', 'cool sonnenbrille'],
      ['🤓', 'nerd'], ['🧐', 'monokel'], ['😕', 'verwirrt'], ['😟', 'besorgt'], ['🙁', 'traurig'], ['😮', 'staunen oh'],
      ['😯', 'überrascht'], ['😲', 'erstaunt'], ['😳', 'rot verlegen'], ['🥺', 'bitte bitte'], ['😦', 'entsetzt'], ['😨', 'angst'],
      ['😰', 'angst schweiß'], ['😥', 'enttäuscht'], ['😢', 'weinen träne'], ['😭', 'heulen'], ['😱', 'schrei angst'], ['😖', 'verzweifelt'],
      ['😣', 'durchhalten'], ['😞', 'enttäuscht'], ['😓', 'schweiß'], ['😩', 'erschöpft'], ['😫', 'müde fertig'], ['🥱', 'gähnen'],
      ['😤', 'schnauben'], ['😡', 'wütend'], ['😠', 'sauer'], ['🤬', 'fluchen'], ['😈', 'teufel'], ['💀', 'totenkopf tot lachen'],
      ['💩', 'kacke'], ['🤡', 'clown'], ['👻', 'geist'], ['👽', 'alien'], ['🤖', 'roboter bot'], ['😺', 'katze lachen'],
    ],
  },
  {
    id: 'gesten',
    label: '👍',
    title: 'Gesten & Menschen',
    items: [
      ['👍', 'daumen hoch gut ja'], ['👎', 'daumen runter schlecht nein'], ['👌', 'ok perfekt'], ['✌️', 'peace frieden'], ['🤞', 'daumen drücken'], ['🤟', 'love you'],
      ['🤘', 'rock'], ['🤙', 'ruf an'], ['👈', 'links'], ['👉', 'rechts'], ['👆', 'oben'], ['👇', 'unten'],
      ['☝️', 'zeigefinger'], ['✋', 'hand stopp'], ['🤚', 'hand'], ['🖐️', 'hand finger'], ['🖖', 'vulkanier'], ['👋', 'winken hallo tschüss'],
      ['🤏', 'bisschen'], ['✍️', 'schreiben'], ['👏', 'klatschen applaus'], ['🙌', 'hurra'], ['👐', 'offene hände'], ['🤲', 'hände'],
      ['🤝', 'handschlag deal'], ['🙏', 'bitte danke beten'], ['💪', 'stark muskel'], ['🧠', 'gehirn'], ['👀', 'augen schauen'], ['👁️', 'auge'],
      ['👅', 'zunge'], ['👄', 'mund'], ['🫶', 'herzhände'], ['🙋', 'melden hand hoch'], ['🤷', 'schulterzucken keine ahnung'], ['🤦', 'facepalm'],
      ['🙇', 'verbeugen'], ['💁', 'info'], ['🙆', 'ok arme'], ['🙅', 'nein arme'], ['🧑‍💻', 'programmierer computer'], ['🧑‍🎮', 'gamer zocken'],
    ],
  },
  {
    id: 'herzen',
    label: '❤️',
    title: 'Herzen & Gefühle',
    items: [
      ['❤️', 'herz rot liebe'], ['🧡', 'herz orange'], ['💛', 'herz gelb'], ['💚', 'herz grün'], ['💙', 'herz blau'], ['💜', 'herz lila'],
      ['🖤', 'herz schwarz'], ['🤍', 'herz weiß'], ['🤎', 'herz braun'], ['💔', 'gebrochenes herz'], ['❣️', 'herz ausrufezeichen'], ['💕', 'zwei herzen'],
      ['💞', 'kreisende herzen'], ['💓', 'herzklopfen'], ['💗', 'wachsendes herz'], ['💖', 'glitzerherz'], ['💘', 'amor'], ['💝', 'herz geschenk'],
      ['💯', 'hundert perfekt'], ['💢', 'wut'], ['💥', 'boom knall'], ['💫', 'schwindel stern'], ['💦', 'tropfen'], ['💨', 'schnell weg'],
      ['💬', 'sprechblase'], ['💭', 'gedanke'], ['💤', 'schlafen zzz'], ['🔥', 'feuer heiß krass'], ['✨', 'glitzer'], ['⭐', 'stern'],
    ],
  },
  {
    id: 'tiere',
    label: '🐶',
    title: 'Tiere & Natur',
    items: [
      ['🐶', 'hund'], ['🐱', 'katze'], ['🐭', 'maus'], ['🐹', 'hamster'], ['🐰', 'hase'], ['🦊', 'fuchs'],
      ['🐻', 'bär'], ['🐼', 'panda'], ['🐨', 'koala'], ['🐯', 'tiger'], ['🦁', 'löwe'], ['🐮', 'kuh'],
      ['🐷', 'schwein'], ['🐸', 'frosch'], ['🐵', 'affe'], ['🙈', 'nichts sehen affe'], ['🙉', 'nichts hören'], ['🙊', 'nichts sagen'],
      ['🐔', 'huhn'], ['🐧', 'pinguin'], ['🐦', 'vogel'], ['🦄', 'einhorn'], ['🐝', 'biene'], ['🦋', 'schmetterling'],
      ['🐢', 'schildkröte'], ['🐍', 'schlange'], ['🐙', 'krake'], ['🐬', 'delfin'], ['🐳', 'wal'], ['🦈', 'hai'],
      ['🌸', 'blüte'], ['🌹', 'rose'], ['🌻', 'sonnenblume'], ['🌲', 'baum'], ['🍀', 'kleeblatt glück'], ['🍁', 'blatt herbst'],
      ['🌞', 'sonne'], ['🌙', 'mond'], ['⛅', 'wolke sonne'], ['🌧️', 'regen'], ['⛄', 'schneemann'], ['🌈', 'regenbogen'],
    ],
  },
  {
    id: 'essen',
    label: '🍕',
    title: 'Essen & Trinken',
    items: [
      ['🍕', 'pizza'], ['🍔', 'burger'], ['🍟', 'pommes'], ['🌭', 'hotdog'], ['🌮', 'taco'], ['🍝', 'nudeln'],
      ['🍣', 'sushi'], ['🍜', 'ramen'], ['🥗', 'salat'], ['🥨', 'brezel'], ['🥐', 'croissant'], ['🍞', 'brot'],
      ['🧀', 'käse'], ['🍳', 'ei frühstück'], ['🍩', 'donut'], ['🍪', 'keks'], ['🎂', 'torte geburtstag'], ['🍰', 'kuchen'],
      ['🍫', 'schokolade'], ['🍬', 'bonbon'], ['🍭', 'lutscher'], ['🍿', 'popcorn'], ['🍎', 'apfel'], ['🍌', 'banane'],
      ['🍓', 'erdbeere'], ['🍉', 'melone'], ['🍇', 'trauben'], ['🍑', 'pfirsich'], ['🥑', 'avocado'], ['🌶️', 'chili scharf'],
      ['☕', 'kaffee'], ['🍵', 'tee'], ['🧃', 'saft'], ['🥤', 'getränk'], ['🍺', 'bier'], ['🍻', 'prost'],
    ],
  },
  {
    id: 'aktivitaet',
    label: '⚽',
    title: 'Aktivitäten',
    items: [
      ['⚽', 'fußball'], ['🏀', 'basketball'], ['🏈', 'football'], ['🎾', 'tennis'], ['🏐', 'volleyball'], ['🎱', 'billard'],
      ['🏓', 'tischtennis'], ['🥊', 'boxen'], ['⛳', 'golf'], ['🎣', 'angeln'], ['🎿', 'ski'], ['🏆', 'pokal sieg'],
      ['🥇', 'gold erster'], ['🥈', 'silber'], ['🥉', 'bronze'], ['🎮', 'zocken gaming controller'], ['🕹️', 'joystick'], ['🎲', 'würfel'],
      ['♟️', 'schach'], ['🧩', 'puzzle'], ['🎯', 'ziel treffer'], ['🎳', 'bowling'], ['🎨', 'malen kunst'], ['🎬', 'film'],
      ['🎤', 'singen mikrofon'], ['🎧', 'kopfhörer musik'], ['🎸', 'gitarre'], ['🎹', 'klavier'], ['🥁', 'schlagzeug'], ['🎉', 'party konfetti'],
      ['🎊', 'konfetti'], ['🎈', 'ballon'], ['🎁', 'geschenk'], ['🎃', 'kürbis halloween'], ['🎄', 'weihnachtsbaum'], ['🎆', 'feuerwerk'],
    ],
  },
  {
    id: 'objekte',
    label: '💡',
    title: 'Reisen & Objekte',
    items: [
      ['🚗', 'auto'], ['🚕', 'taxi'], ['🚌', 'bus'], ['🚲', 'fahrrad'], ['✈️', 'flugzeug'], ['🚀', 'rakete start'],
      ['🛸', 'ufo'], ['🚂', 'zug'], ['⛵', 'boot'], ['🏠', 'haus zuhause'], ['🏫', 'schule'], ['🏖️', 'strand urlaub'],
      ['🗺️', 'karte'], ['⏰', 'wecker'], ['⌛', 'sanduhr warten'], ['📱', 'handy'], ['💻', 'laptop'], ['🖥️', 'computer'],
      ['⌨️', 'tastatur'], ['🖱️', 'maus'], ['💡', 'idee'], ['🔦', 'taschenlampe'], ['📷', 'kamera foto'], ['📺', 'fernseher'],
      ['📚', 'bücher'], ['📝', 'notiz'], ['📌', 'pin'], ['📎', 'büroklammer'], ['✂️', 'schere'], ['🔒', 'schloss gesperrt'],
      ['🔑', 'schlüssel'], ['🔨', 'hammer'], ['🛠️', 'werkzeug'], ['⚙️', 'zahnrad einstellungen'], ['💰', 'geld'], ['💎', 'diamant'],
      ['📦', 'paket'], ['✉️', 'brief'], ['📅', 'kalender termin'], ['📈', 'aufwärts'], ['📉', 'abwärts'], ['🔔', 'glocke'],
    ],
  },
  {
    id: 'symbole',
    label: '✅',
    title: 'Symbole',
    items: [
      ['✅', 'haken erledigt ja'], ['❌', 'kreuz nein falsch'], ['❗', 'ausrufezeichen'], ['❓', 'fragezeichen'], ['⚠️', 'warnung'], ['🚫', 'verboten'],
      ['⛔', 'stopp'], ['🔴', 'rot kreis'], ['🟠', 'orange kreis'], ['🟡', 'gelb kreis'], ['🟢', 'grün kreis'], ['🔵', 'blau kreis'],
      ['🟣', 'lila kreis'], ['⚫', 'schwarz kreis'], ['⚪', 'weiß kreis'], ['➕', 'plus'], ['➖', 'minus'], ['➡️', 'pfeil rechts'],
      ['⬅️', 'pfeil links'], ['⬆️', 'pfeil hoch'], ['⬇️', 'pfeil runter'], ['🔄', 'neu laden'], ['🔁', 'wiederholen'], ['▶️', 'play'],
      ['⏸️', 'pause'], ['⏹️', 'stopp'], ['🆕', 'neu'], ['🆗', 'ok'], ['🆒', 'cool'], ['🆘', 'hilfe sos'],
      ['ℹ️', 'info'], ['🔞', 'ab 18'], ['♻️', 'recycling'], ['✔️', 'haken'], ['™️', 'marke'], ['#️⃣', 'raute'],
    ],
  },
];

const ALL = CATEGORIES.flatMap((c) => c.items);

/** Suche über Suchwörter (deutsch), z. B. „herz“, „lachen“, „pizza“. */
function searchEmojis(query, limit = 48) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  return ALL.filter(([, words]) => words.split(' ').some((w) => w.startsWith(q))).slice(0, limit).map(([e]) => e);
}

module.exports = { CATEGORIES, searchEmojis, EMOJI_COUNT: ALL.length };
