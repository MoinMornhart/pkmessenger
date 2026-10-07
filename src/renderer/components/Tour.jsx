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

export const STEPS = [
  { title: 'Willkommen bei PKMessenger 👋', text: 'Eine kurze Tour (etwa 1 Minute). Du kannst bei manchen Schritten direkt mitmachen. Überspringen geht jederzeit.' },
  { target: '.rail', title: 'Deine Server', text: 'Links sind die Server, auf denen dein Bot ist. Ganz oben (💬) findest du die Privatchats, unten kannst du einen Server hinzufügen.' },
  { target: '.chatlist__items', title: 'Deine Chats', text: 'Hier sind die Kanäle. Neue Nachrichten stehen oben. Rechtsklick auf einen Chat zeigt mehr (Hintergrund, umbenennen …).', task: 'Klick jetzt auf einen Chat.', click: '.chatlist__items .chatrow' },
  { target: '.composer', title: 'Schreiben', text: 'Hier schreibst du. Alles geht als dein Bot raus (mit BOT-Abzeichen). „@“ schlägt Namen vor, „/“ zeigt Befehle wie /münze oder /umfrage.', task: 'Tippe ein „/“ ins Feld.', done: () => ($('.composer textarea')?.value || '').startsWith('/') },
  { target: '.msglist', title: 'Nachrichten', text: 'Klick auf Bild oder Namen zeigt das Profil. Mit der Maus über eine Nachricht: antworten, reagieren, Thread. Rechtsklick: alle Aktionen.' },
  { target: '.chat__head', title: 'Oben im Chat', text: 'Suche im Chat (Strg+F), angeheftete Nachrichten, Threads und mehr. Strg+K springt schnell zu jedem Chat, auch mit Tippfehlern.' },
  { target: SETTINGS_BTN, title: 'Einstellungen', text: 'Hier stellst du alles ein: Aussehen, Töne, Sicherheit, Updates.', task: 'Klick auf das Zahnrad.', click: SETTINGS_BTN },
  { target: '.settings__nav', title: 'Alles schnell finden', text: 'Links die Bereiche, oben eine Suche („Passwort“, „Töne“ …). Jede Einstellung hat einen kurzen Erklärtext.' },
  { target: '.settings__nav [data-nav="beta"]', title: 'Beta = experimentell', text: 'Unter „Beta“ liegen neue, noch experimentelle Sachen wie KI-Agenten. Sie können sich noch ändern und sind standardmäßig aus.' },
  { target: '.settings__nav [data-nav="hilfe"]', title: 'Fertig! 🎉', text: 'Die Tour kannst du jederzeit unter „Hilfe & Tour“ neu starten. Viel Spaß mit PKMessenger!' },
];

const PAD = 8;

export default function Tour() {
  const [step, setStep] = useState(-1); // -1 = aus
  const [rect, setRect] = useState(null);
  const [done, setDone] = useState(false);

  // Start: erster Programmstart (nicht im Screenshot-Lauf) oder per „Tour starten“
  useEffect(() => {
    const onStart = () => setStep(0);
    window.addEventListener('pk:start-tour', onStart);
    let t;
    if (!tourState() && !/[?&]shots=1/.test(window.location.search)) t = setTimeout(() => setStep((s) => (s < 0 ? 0 : s)), 1500);
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
      const el = s.target ? s.target.split(',').map((x) => $(x.trim())).find(Boolean) : null;
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 ? { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 } : null);
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
  }, [step]);

  // Aufgabe erledigt → kurz zeigen, dann weiter
  useEffect(() => {
    if (!done || step < 0) return undefined;
    const t = setTimeout(() => setStep((x) => Math.min(x + 1, STEPS.length - 1)), 700);
    return () => clearTimeout(t);
  }, [done, step]);

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
