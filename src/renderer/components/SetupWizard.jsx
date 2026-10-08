import { pc } from '../platform';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

// Einrichtungs-Assistent (Issue #38: „detaillierte Erklärung, wie man den Bot erstellt – zusammen etwas erstellen“).
// Geht Schritt für Schritt mit und prüft über die OFFIZIELLE Schnittstelle, was schon erledigt ist (kein Auslesen
// der Discord-Webseite). Manuelle Schritte hakt man selbst ab; der Haken wird nur lokal gemerkt.

const PORTAL = 'https://discord.com/developers/applications';
const KEY = 'pk.setupwizard.v1';
const loadTicks = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
};
const saveTicks = (t) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* egal */
  }
};

export function openSetupWizard() {
  window.dispatchEvent(new CustomEvent('pk:setup-wizard'));
}

/** Zustand der automatisch prüfbaren Schritte aus Status + Einrichtungs-Check. */
function autoState(status, check) {
  const ready = status?.state === 'ready';
  const byId = Object.fromEntries((check?.items || []).map((i) => [i.id, i]));
  const guildItems = (check?.items || []).filter((i) => i.id.startsWith('guild:'));
  return {
    token: ready || (status?.state === 'error' && status?.reason === 'DISALLOWED_INTENTS'),
    intent: ready,
    intentMissing: status?.state === 'error' && status?.reason === 'DISALLOWED_INTENTS',
    guild: Boolean(byId.guilds?.ok),
    channels: guildItems.some((i) => i.ok),
  };
}

export default function SetupWizard({ status, onClose = null, onReconnect = null }) {
  const [ticks, setTicks] = useState(loadTicks);
  const [check, setCheck] = useState(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [invite, setInvite] = useState(null);
  const [open, setOpen] = useState(null); // aufgeklappter Schritt

  const tick = (id, on = true) => {
    const next = { ...ticks, [id]: on };
    setTicks(next);
    saveTicks(next);
  };

  const refresh = useCallback(async () => {
    try {
      setCheck(await api.setupCheck());
    } catch {
      setCheck(null);
    }
    api.getInviteUrl().then(setInvite).catch(() => setInvite(null));
  }, []);

  // Regelmäßig nachsehen: Sobald der Bot z. B. auf dem Server ist, springt der Assistent weiter
  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 5000);
    return () => clearInterval(iv);
  }, [refresh, status?.state]);

  const auto = autoState(status, check);
  const saveToken = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.tokenSave({ token });
      setToken('');
      if (res?.state !== 'ready' && res?.error) setErr(res.error);
      refresh();
    } catch (e) {
      setErr({ message: e.message, hint: e.hint || '' });
    } finally {
      setBusy(false);
    }
  };
  const ext = (url) => api.openExternal({ url }).catch(() => {});

  const steps = [
    {
      id: 'account',
      title: 'Discord-Konto für den Bot-Besitzer',
      done: ticks.account || auto.token,
      body: (
        <>
          <p>Einen Bot kann nur jemand mit Discord-Konto anlegen (das ist Discords Regel). Das musst nur <b>du als Besitzer</b> einmal machen. Wer später nur mitliest, braucht für PKMessenger nichts weiter.</p>
          <div className="settings__row">
            <button className="btn btn--small" onClick={() => ext('https://discord.com/register')}>
              Konto erstellen ↗
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => tick('account')}>
              ✓ Habe ich schon
            </button>
          </div>
        </>
      ),
    },
    {
      id: 'app',
      title: 'Anwendung im Entwicklerportal anlegen',
      done: ticks.app || auto.token,
      body: (
        <>
          <ol className="wizard__how">
            <li>„Entwicklerportal öffnen“ klicken und mit deinem Discord-Konto anmelden.</li>
            <li>
              Oben rechts <b>„New Application“</b> klicken.
            </li>
            <li>Einen Namen eingeben, z. B. „PK“ (so heißt dein Bot später). Haken bei den Bedingungen setzen, <b>„Create“</b>.</li>
            <li>Optional: unter „General Information“ ein Bild hochladen.</li>
          </ol>
          <div className="settings__row">
            <button className="btn btn--small" onClick={() => ext(PORTAL)}>
              Entwicklerportal öffnen ↗
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => tick('app')}>
              ✓ Erledigt
            </button>
          </div>
        </>
      ),
    },
    {
      id: 'token',
      title: 'Bot-Token holen und hier einfügen',
      done: auto.token,
      body: (
        <>
          <ol className="wizard__how">
            <li>
              Links im Menü auf <b>„Bot“</b> klicken.
            </li>
            <li>
              <b>„Reset Token“</b> klicken und mit <b>„Yes, do it!“</b> bestätigen (evtl. fragt Discord nach deinem 2FA-Code).
            </li>
            <li>
              <b>„Copy“</b> klicken. Der Token wird nur <b>einmal</b> angezeigt.
            </li>
            <li>Hier einfügen ({pc('Strg+V', 'lange ins Feld drücken → Einfügen')}) und speichern. Er wird sofort verschlüsselt und nie wieder angezeigt.</li>
          </ol>
          {auto.token ? (
            <p className="ok small">✓ Token ist gespeichert und gültig.</p>
          ) : (
            <div className="settings__row">
              <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && token && saveToken()} placeholder="Bot-Token einfügen" aria-label="Bot-Token" />
              <button className="btn btn--primary btn--small" disabled={!token || busy} onClick={saveToken}>
                {busy ? 'Prüfe …' : 'Speichern & prüfen'}
              </button>
            </div>
          )}
          {err && (
            <p className="warn small">
              {err.message} {err.hint}
            </p>
          )}
          <p className="muted small">🔒 Den Token nie teilen oder abfotografieren. Falls er doch irgendwo landet: im Portal sofort „Reset Token“.</p>
        </>
      ),
    },
    {
      id: 'intent',
      title: '„Message Content Intent“ einschalten',
      done: auto.intent,
      body: (
        <>
          <ol className="wizard__how">
            <li>
              Im Portal auf der Seite <b>„Bot“</b> nach unten zu <b>„Privileged Gateway Intents“</b> scrollen.
            </li>
            <li>
              <b>„Message Content Intent“</b> einschalten (damit der Bot Nachrichten lesen darf).
            </li>
            <li>
              Unten <b>„Save Changes“</b> klicken.
            </li>
            <li>Optional für den Online-Status: auch „Presence Intent“ einschalten.</li>
          </ol>
          {auto.intentMissing && <p className="warn small">⚠ Discord meldet: Die Erlaubnis fehlt noch. Einschalten, speichern, dann „Nochmal verbinden“.</p>}
          <div className="settings__row">
            <button className="btn btn--small" onClick={() => ext(check?.portal ? `${check.portal}/bot` : PORTAL)}>
              Bot-Seite im Portal öffnen ↗
            </button>
            {!auto.intent && onReconnect && (
              <button className="btn btn--ghost btn--small" onClick={() => onReconnect()}>
                ↻ Nochmal verbinden
              </button>
            )}
          </div>
        </>
      ),
    },
    {
      id: 'server',
      title: 'Einen Server haben (oder zusammen einen anlegen)',
      done: ticks.server || auto.guild,
      body: (
        <>
          <p>Der Bot braucht einen Discord-Server. Hast du schon einen, auf dem du Admin bist? Dann weiter. Sonst legen wir jetzt zusammen einen an:</p>
          <ol className="wizard__how">
            <li>
              Discord öffnen (App oder discord.com), links unten auf das <b>„+“</b> klicken.
            </li>
            <li>
              <b>„Selbst erstellen“</b> → <b>„Für mich und meine Freunde“</b>.
            </li>
            <li>
              Namen eingeben, z. B. „Mein PK-Server“, <b>„Erstellen“</b>.
            </li>
          </ol>
          <div className="settings__row">
            <button className="btn btn--small" onClick={() => ext('https://discord.com/channels/@me')}>
              Discord öffnen ↗
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => tick('server')}>
              ✓ Server ist da
            </button>
          </div>
        </>
      ),
    },
    {
      id: 'invite',
      title: 'Bot auf den Server einladen',
      done: auto.guild,
      body: (
        <>
          <ol className="wizard__how">
            <li>„Einladungslink öffnen“ klicken.</li>
            <li>
              Bei <b>„Zu Server hinzufügen“</b> deinen Server auswählen, <b>„Weiter“</b>.
            </li>
            <li>
              Die Rechte so lassen, <b>„Autorisieren“</b> klicken und das Captcha lösen.
            </li>
            <li>Fertig. Sobald der Bot drin ist, springt dieser Schritt hier von selbst auf ✓.</li>
          </ol>
          {invite ? (
            <div className="settings__row">
              <button className="btn btn--primary btn--small" onClick={() => ext(invite)}>
                Einladungslink öffnen ↗
              </button>
              <button className="btn btn--ghost btn--small" onClick={() => window.dispatchEvent(new CustomEvent('pk:invite-dialog'))} title="Kein eigenes Discord-Konto? Eine Admin des Servers kann den Bot einladen.">
                🤝 Link an eine Admin schicken
              </button>
            </div>
          ) : (
            <p className="muted small">Der Link erscheint, sobald der Token gespeichert ist.</p>
          )}
        </>
      ),
    },
    {
      id: 'channels',
      title: 'Kanäle freigeben',
      done: auto.channels,
      body: (
        <>
          <p>Der Bot sieht nur Kanäle, die seine Rolle sehen darf. Meist passt das schon. Falls hier kein ✓ erscheint:</p>
          <ol className="wizard__how">
            <li>In Discord: Rechtsklick auf deinen Server → „Servereinstellungen“ → „Rollen“.</li>
            <li>
              Die Rolle mit dem Namen deines Bots wählen und <b>„Kanäle ansehen“</b>, <b>„Nachrichten senden“</b> und <b>„Nachrichtenverlauf lesen“</b> einschalten.
            </li>
          </ol>
          {(check?.items || [])
            .filter((i) => i.id.startsWith('guild:'))
            .map((i) => (
              <p key={i.id} className={`small ${i.ok ? 'ok' : 'warn'}`}>
                {i.ok ? '✓' : '⚠'} {i.text}
              </p>
            ))}
        </>
      ),
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const current = steps.find((s) => !s.done);
  const shownId = open || current?.id || null;
  return (
    <div className="wizard">
      <div className="wizard__progress" aria-label={`Schritt ${doneCount} von ${steps.length} erledigt`}>
        <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <p className="small muted">
        {doneCount === steps.length ? '🎉 Alles eingerichtet! Viel Spaß mit PKMessenger.' : `${doneCount} von ${steps.length} erledigt · Ich prüfe automatisch mit, was ich prüfen kann.`}
      </p>
      <ol className="wizard__steps">
        {steps.map((s, i) => (
          <li key={s.id} className={`wizard__step ${s.done ? 'is-done' : ''} ${shownId === s.id ? 'is-open' : ''}`}>
            <button className="wizard__head" onClick={() => setOpen(shownId === s.id ? '__none' : s.id)} aria-expanded={shownId === s.id}>
              <span className="wizard__num">{s.done ? '✓' : i + 1}</span>
              <span>{s.title}</span>
              {current?.id === s.id && <span className="wizard__now">jetzt dran</span>}
            </button>
            {shownId === s.id && <div className="wizard__body">{s.body}</div>}
          </li>
        ))}
      </ol>
      {onClose && (
        <div className="confirm__actions">
          <button className="btn btn--primary" onClick={onClose}>
            {doneCount === steps.length ? 'Los geht’s' : 'Schließen'}
          </button>
        </div>
      )}
    </div>
  );
}
