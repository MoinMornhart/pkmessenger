import { useCallback, useEffect, useState } from 'react';

// Einführungs-Tour (Issue #1): Alles außer dem erklärten Teil wird dunkel und unscharf, um den Teil leuchtet ein Rahmen.
// Bei Mitmach-Schritten („Klick auf einen Chat“) geht es automatisch weiter, sobald man es gemacht hat.
// Gespeichert wird nur, ob die Tour fertig oder übersprungen ist (localStorage „pk.tour.v1“, keine Geheimnisse).

const KEY = 'pk.tour.v1';
export function tourState() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}
function saveTour(status, step) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ status, step, at: Date.now() }));
  } catch {
    /* Speicher nicht verfügbar */
  }
}
export function startTour() {
  window.dispatchEvent(new CustomEvent('pk:start-tour'));
}

const $ = (sel) => (sel ? document.querySelector(sel) : null);
const SETTINGS_BTN = '.chatlist__head .icon-btn[aria-label="Einstellungen"]';

const has = (sel) => Boolean($(sel));

/**
 * Schritte passend zum Stand (Issue #1: „Tutorial individuell“): ohne Server → Einladen erklären,
 * ohne sichtbare Chats → Freigabe erklären, sonst die volle Tour mit allen Knöpfen.
 * target: CSS-Auswahl (mehrere mit „|“ = alle zusammen hervorheben), task + click/done = Mitmachen.
 */
export function buildSteps() {
  const hasServer = has('.rail__item:not(.rail__dm):not(.rail__add)');
  const hasChats = has('.chatlist__items .chatrow');
  const steps = [{ title: 'Willkommen bei PKMessenger 👋', text: 'Eine kurze Tour. Bei manchen Schritten machst du direkt mit. Überspringen geht jederzeit (Esc).' }];
  if (!hasServer) {
    steps.push(
      { target: '.rail [aria-label="Bot einladen"]', title: 'Erst mal: Bot einladen', text: 'Dein Bot ist noch auf keinem Server. Über diesen Knopf lädst du ihn auf deinen Server ein: Server wählen, „Autorisieren“, fertig.', task: 'Klick auf den Knopf.', click: '.rail [aria-label="Bot einladen"]' },
      { target: '.rail [aria-label="Server beitreten"]', title: 'Server per Einladungslink', text: 'Hast du einen Einladungslink zu einem fremden Server? Hier einfügen, die App zeigt dir den Weg.' },
      { title: 'Danach geht\'s weiter', text: 'Sobald der Bot auf einem Server ist, erscheint er links. Dann starte die Tour nochmal unter Einstellungen → Hilfe & Tour, und ich zeige dir den Rest 🙂' },
    );
    return steps;
  }
  steps.push({ target: '.rail', title: 'Deine Server', text: 'Links die Server deines Bots. 💬 oben = Privatchats, unten: Bot einladen und Server per Link beitreten.' });
  if (!hasChats) {
    steps.push(
      { target: '.chatlist', title: 'Noch keine Chats sichtbar', text: 'Der Bot darf hier noch keinen Kanal sehen. Gib der Bot-Rolle in Discord unter Servereinstellungen → Rollen das Recht „Kanäle ansehen“, dann tauchen die Kanäle hier auf (⟳ aktualisiert).' },
      { title: 'Danach geht\'s weiter', text: 'Wenn Kanäle da sind, starte die Tour nochmal unter Einstellungen → Hilfe & Tour.' },
    );
    return steps;
  }
  steps.push(
    { target: '.chatlist__items', title: 'Deine Chats', text: 'Neue Nachrichten stehen oben, ein Punkt zeigt Ungelesenes.', task: 'Klick jetzt auf einen Chat.', click: '.chatlist__items .chatrow' },
    { target: '.chatlist__items .chatrow', title: 'Rechtsklick auf einen Chat', text: 'Als gelesen markieren, 🖼 eigenen Hintergrund für diesen Chat oder Server, Link kopieren, umbenennen und verschieben (wenn der Bot darf).' },
    { target: '.chatlist__head [aria-label="Aktualisieren"]|.chatlist__head [aria-label="Sortierung wechseln"]|.chatlist__head [aria-label="Nicht stören"]|.chatlist__head [aria-label="Einstellungen"]', title: 'Oben in der Liste', text: '⟳ neu laden · ☰ sortieren (neueste oder nach Kategorien) · 🔔 Nicht stören (keine Töne) · ⚙ Einstellungen. Töne und eigene Benachrichtigungstöne stellst du in den Einstellungen ein.' },
    { target: '.composer textarea', title: 'Schreiben', text: 'Alles geht als dein Bot raus (mit BOT-Abzeichen). „@“ schlägt Namen vor, „#“ Kanäle, „/“ Befehle wie /münze, /spoiler oder /umfrage. Text markieren → Menü zum Formatieren.', task: 'Tippe ein „/“ ins Feld.', done: () => ($('.composer textarea')?.value || '').startsWith('/') },
    { target: '.composer .tool-btn', all: true, title: 'Die Knöpfe unten', text: '📎 Dateien anhängen (bis 25 MB) · ▤ Embed bauen (Kasten mit Titel, Farbe, Bild) · 😀 Smileys · 📊 Umfrage erstellen.' },
    { target: '.msglist .msg', title: 'Nachrichten', text: 'Klick auf Bild oder Namen zeigt das Profil. Maus drüber: antworten, reagieren, Thread. Rechtsklick: alle Aktionen, auch kopieren, anheften und Person verwalten. Gefährliche Links werden automatisch gesperrt.' },
    { target: '.chat__head [aria-label="Threads"]|.chat__head [aria-label="Angeheftete Nachrichten"]|.chat__head [aria-label="Suchen"]', title: 'Threads, Pins, Suche', text: '🧵 Threads (Neben-Unterhaltungen) ansehen und starten · 📌 angeheftete Nachrichten · 🔎 im Chat suchen (Strg+F). Strg+K springt zu jedem Chat, auch mit Tippfehlern.' },
  );
  if (has('.chatlist__section')) steps.push({ target: '.chatlist__section', title: 'Sprachkanäle', text: 'Klick auf einen Sprachkanal: Der Bot tritt bei und du sprichst über ihn. Alle hören „PK BOT“. Unten erscheint dann die Anrufleiste.' });
  steps.push(
    { target: SETTINGS_BTN, title: 'Einstellungen', text: 'Hier stellst du alles ein.', task: 'Klick auf das Zahnrad.', click: SETTINGS_BTN },
    { target: '.settings__nav', title: 'Alles schnell finden', text: 'Klick links auf einen Bereich, dann siehst du nur diesen. Oben suchen („Passwort“, „Töne“, „Hintergrund“ …), auch mit Tippfehlern.' },
    { target: '.settings__nav [data-nav="toene"]|.settings__nav [data-nav="aussehen"]', title: 'Töne & Aussehen', text: '🔔 Töne, eigener Ton, Nicht stören · 🎨 Designs, Akzentfarbe, Animationen und Chat-Hintergründe.' },
    { target: '.settings__nav [data-nav="datenschutz"]|.settings__nav [data-nav="sicherheit"]', title: 'Datenschutz & Sicherheit', text: 'Bilder/GIFs erst nach Rückfrage, Link-Warnungen, vertraute Seiten, Spoiler · App-Passwort, Windows Hello, mit Windows starten, im Hintergrund weiterlaufen.' },
    { target: '.settings__nav [data-nav="beta"]', title: 'Beta = experimentell', text: 'Hier liegen neue, noch experimentelle Sachen wie KI-Agenten. Sie sind standardmäßig aus und können sich noch ändern.' },
    { target: '.settings__nav [data-nav="hilfe"]', title: 'Fertig! 🎉', text: 'Unter „Hilfe & Tour“ startest du die Tour neu, prüfst die Einrichtung und findest Tastenkürzel. Viel Spaß!' },
  );
  return steps;
}

const PAD = 8;

export default function Tour() {
  const [step, setStep] = useState(-1); // -1 = aus
  const [STEPS, setSteps] = useState(() => buildSteps());
  const [rect, setRect] = useState(null);
  const [done, setDone] = useState(false);

  // Start: erster Programmstart (nicht im Screenshot-Lauf) oder per „Tour starten“
  useEffect(() => {
    const onStart = () => {
      setSteps(buildSteps()); // passend zum aktuellen Stand
      setStep(0);
    };
    window.addEventListener('pk:start-tour', onStart);
    let t;
    if (!tourState() && !/[?&]shots=1/.test(window.location.search))
      t = setTimeout(() => {
        setSteps(buildSteps());
        setStep((s) => (s < 0 ? 0 : s));
      }, 1500);
    return () => {
      window.removeEventListener('pk:start-tour', onStart);
      clearTimeout(t);
    };
  }, []);

  const finish = useCallback((status) => {
    saveTour(status, step);
    setStep(-1);
    setRect(null);
  }, [step]);

  // Ziel verfolgen (Fenstergröße, Scrollen) + Mitmach-Aufgabe prüfen
  useEffect(() => {
    if (step < 0) return undefined;
    setDone(false);
    const s = STEPS[step];
    const tick = () => {
      // Mehrere Ziele („a|b|c“ oder all: true) → gemeinsamen Rahmen um alle legen
      const els = !s.target ? [] : s.all ? [...document.querySelectorAll(s.target)] : s.target.split('|').map((x) => $(x.trim())).filter(Boolean);
      const rs = els.map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0);
      if (!rs.length) setRect(null);
      else {
        const x1 = Math.min(...rs.map((r) => r.left));
        const y1 = Math.min(...rs.map((r) => r.top));
        const x2 = Math.max(...rs.map((r) => r.right));
        const y2 = Math.max(...rs.map((r) => r.bottom));
        setRect({ x: x1 - PAD, y: y1 - PAD, w: x2 - x1 + PAD * 2, h: y2 - y1 + PAD * 2 });
      }
      if (s.done && s.done()) setDone(true);
    };
    tick();
    const iv = setInterval(tick, 250);
    // Mitmach-Schritt „Klick auf …“: zählt nur ein Klick WÄHREND dieses Schritts
    const onClick = (e) => s.click && e.target.closest?.(s.click) && setDone(true);
    document.addEventListener('click', onClick, true);
    return () => {
      clearInterval(iv);
      document.removeEventListener('click', onClick, true);
    };
  }, [step, STEPS]);

  // Aufgabe erledigt → kurz zeigen, dann weiter
  useEffect(() => {
    if (!done || step < 0) return undefined;
    const t = setTimeout(() => setStep((x) => Math.min(x + 1, STEPS.length - 1)), 700);
    return () => clearTimeout(t);
  }, [done, step, STEPS.length]);

  useEffect(() => {
    if (step < 0) return undefined;
    const onKey = (e) => e.key === 'Escape' && finish('skipped');
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [step, finish]);

  if (step < 0) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Karte neben/unter dem Ziel, sonst in der Mitte
  let card = { left: vw / 2 - 180, top: vh / 2 - 110 };
  if (rect) {
    const below = rect.y + rect.h + 14;
    const above = rect.y - 14 - 220;
    const right = rect.x + rect.w + 14;
    if (rect.w < vw * 0.45 && right + 360 < vw) card = { left: right, top: Math.min(Math.max(12, rect.y), vh - 240) };
    else if (below + 220 < vh) card = { left: Math.min(Math.max(12, rect.x), vw - 372), top: below };
    else if (above > 12) card = { left: Math.min(Math.max(12, rect.x), vw - 372), top: above };
  }
  const shade = (style) => <div className="tour__shade" style={style} />;
  return (
    <div className="tour" role="dialog" aria-label="Einführungs-Tour">
      {rect ? (
        <>
          {shade({ left: 0, top: 0, width: '100%', height: Math.max(0, rect.y) })}
          {shade({ left: 0, top: rect.y + rect.h, width: '100%', bottom: 0 })}
          {shade({ left: 0, top: rect.y, width: Math.max(0, rect.x), height: rect.h })}
          {shade({ left: rect.x + rect.w, top: rect.y, right: 0, height: rect.h })}
          <div className={`tour__ring ${done ? 'is-done' : ''}`} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
        </>
      ) : (
        shade({ inset: 0 })
      )}
      <div className="tour__card" style={card}>
        <div className="tour__count">
          {step + 1} / {STEPS.length}
        </div>
        <h3>{s.title}</h3>
        <p>{s.text}</p>
        {s.task && <p className={`tour__task ${done ? 'is-done' : ''}`}>{done ? '✓ Super, genau so!' : `👉 ${s.task}`}</p>}
        <div className="tour__actions">
          {!last && (
            <button className="btn btn--ghost btn--small" onClick={() => finish('skipped')}>
              Tour überspringen
            </button>
          )}
          {step > 0 && (
            <button className="btn btn--ghost btn--small" onClick={() => setStep(step - 1)}>
              Zurück
            </button>
          )}
          <button className="btn btn--primary btn--small" autoFocus onClick={() => (last ? finish('done') : setStep(step + 1))}>
            {last ? 'Fertig' : s.task && !done ? 'Weiter ohne ausprobieren' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  );
}
