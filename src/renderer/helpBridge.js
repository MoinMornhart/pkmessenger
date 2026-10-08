// Fernhilfe (Issue #79), Renderer-Seite: meldet laufend, was auf dem Bildschirm zu sehen ist (geschwärzt wird erst
// in Main), und führt erlaubte Helfer-Aktionen aus. Im Chat-Bereich wird NICHTS gemeldet und NICHTS ausgeführt.
import { api } from './api';

let timer = null;
let unAction = null;
let lastCursor = null;

const onMouse = (e) => {
  lastCursor = { x: e.clientX, y: e.clientY };
};

function currentScreen() {
  if (document.querySelector('.layout')) return 'workspace';
  if (document.querySelector('.modal.settings')) return 'settings';
  if (document.querySelector('.token-quick, .setup-head, .wizard')) return 'setup';
  return 'other';
}

const visible = (el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

// Sichtbare Bedienelemente der Einrichtung/Einstellungen mit stabiler ID versehen (für Klick/Tippen durch den Helfer)
function collectFields() {
  const scope = document.querySelector('.center-card, .modal.settings') || document.body;
  const els = [...scope.querySelectorAll('button, input, select, textarea, a.link-btn, summary')].filter(visible).slice(0, 100);
  return els.map((el, i) => {
    const id = `h${i}`;
    el.setAttribute('data-help-id', id);
    const label = (el.getAttribute('aria-label') || el.textContent || el.placeholder || el.value || '').trim().slice(0, 80);
    const secret = el.type === 'password';
    return { id, label, secret };
  });
}

function buildView() {
  const screen = currentScreen();
  const inChat = screen === 'workspace';
  return { screen, fields: inChat ? [] : collectFields(), cursor: lastCursor };
}

function pushView() {
  try {
    api.helpView(buildView());
  } catch {
    /* Hilfe evtl. gerade aus */
  }
}

function applyAction(action) {
  if (currentScreen() === 'workspace') return; // im Chat nie etwas ausführen
  const sel = `[data-help-id="${String(action.target || '').replace(/[^a-z0-9]/gi, '')}"]`;
  const el = document.querySelector(sel);
  if (!el) return;
  if (el.type === 'password') return; // Sicherheits-Felder bedient nur der Nutzer selbst
  if (action.type === 'click') el.click();
  else if (action.type === 'type' && 'value' in el && el.type !== 'password') {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, String(action.text || '').slice(0, 200));
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  } else if (action.type === 'scroll') {
    const box = document.querySelector('.settings__body, .center-screen') || document.scrollingElement;
    if (action.dir === 'top') box.scrollTo({ top: 0 });
    else if (action.dir === 'bottom') box.scrollTo({ top: box.scrollHeight });
    else box.scrollBy({ top: action.dir === 'up' ? -300 : 300 });
  }
}

export function startHelpBridge() {
  if (timer) return;
  window.addEventListener('mousemove', onMouse);
  unAction = api.onHelpAction(applyAction);
  timer = setInterval(pushView, 700);
  pushView();
}

export function stopHelpBridge() {
  clearInterval(timer);
  timer = null;
  window.removeEventListener('mousemove', onMouse);
  if (unAction) unAction();
  unAction = null;
}
