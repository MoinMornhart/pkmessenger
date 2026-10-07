import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { prefs } from '../prefs';
import { formatShortTime } from '../../shared/format';

// Update-Zustand verständlich anzeigen (Issue #1: „ich drücke nach Updates suchen, aber die App sagt nichts“)
export const UPDATE_TEXT = {
  idle: 'Noch nicht geprüft',
  checking: 'Suche nach Updates …',
  downloading: 'Neue Version gefunden – wird im Hintergrund geladen …',
  current: 'Du hast die neueste Version ✓',
  ready: 'Update bereit – wird beim Neustart installiert',
  error: 'Update-Prüfung fehlgeschlagen',
  disabled: 'Automatische Updates aus',
};

const DONE = new Set(['current', 'downloading', 'ready', 'error']);
const RECENT_MS = 2 * 60 * 1000; // so kurz nach einer Prüfung erst nachfragen (Issue #1: „mehrfach drücken → Prompt“)
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

// „Das ist neu“ nach Updates ein/aus (Issue #44)
function WhatsNewToggle() {
  const [on, setOn] = useState(prefs.get().showWhatsNew);
  useEffect(() => prefs.subscribe((p) => setOn(p.showWhatsNew)), []);
  return (
    <label className="composer__ping" data-setting="whats-new">
      <input type="checkbox" checked={on} onChange={(e) => prefs.set({ showWhatsNew: e.target.checked })} /> 🎉 Nach einem Update kurz zeigen, was neu und was behoben ist
    </label>
  );
}

export default function UpdateSection({ appInfo, toast }) {
  const u = appInfo?.update || { state: 'idle' };
  const [waiting, setWaiting] = useState(false);
  const [again, setAgain] = useState(false); // Rückfrage „nochmal prüfen?“
  const [changes, setChanges] = useState(null); // null | 'busy' | { … }
  const [reinstall, setReinstall] = useState(null); // Setup-Link für „neu installieren“
  const timer = useRef(null);

  // Nach einem Klick auf „Jetzt suchen“ das Ergebnis als Hinweis melden
  useEffect(() => {
    if (!waiting || !DONE.has(u.state) || u.lastChecked < waiting) return;
    clearTimeout(timer.current);
    setWaiting(false);
    if (u.state === 'current') toast({ kind: 'info', title: 'Kein Update nötig ✓', text: `Du hast die neueste Version (v${appInfo?.version}).${u.latest ? ' Direkt bei GitHub geprüft.' : ''}`, duration: 4000 });
    else if (u.state === 'downloading') toast({ kind: 'info', title: 'Neue Version gefunden 🎉', text: 'Sie wird im Hintergrund geladen. Danach erscheint „Jetzt neu starten“.' });
    else if (u.state === 'ready') toast({ kind: 'info', title: 'Update bereit', text: 'Klicke auf „Jetzt neu starten“, um es zu installieren.' });
    else toast({ kind: 'error', title: u.error?.message || 'Update-Prüfung fehlgeschlagen', text: u.error?.hint });
  }, [waiting, u.state, u.lastChecked, u.error, u.latest, appInfo?.version, toast]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const search = async () => {
    setAgain(false);
    const started = Date.now();
    setWaiting(started);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setWaiting(false);
      toast({ kind: 'warn', title: 'Keine Antwort vom Update-Dienst', text: 'Internetverbindung prüfen und später erneut versuchen.' });
    }, 45000);
    try {
      await api.checkForUpdates();
    } catch (e) {
      clearTimeout(timer.current);
      setWaiting(false);
      toast({ kind: 'error', title: e.message, text: e.hint });
    }
  };
  // Gerade erst geprüft? Dann erst fragen, ob wirklich nochmal
  const onSearch = () => (u.state === 'current' && u.lastChecked && Date.now() - u.lastChecked < RECENT_MS ? setAgain(true) : search());

  const loadChanges = async () => {
    setChanges('busy');
    try {
      setChanges(await api.updateChanges());
    } catch (e) {
      setChanges(null);
      toast({ kind: 'error', title: e.message, text: e.hint });
    }
  };

  const busy = Boolean(waiting) || u.state === 'checking';
  const latestSetup = changes && changes !== 'busy' ? changes.releases.find((r) => r.setupUrl)?.setupUrl : null;
  return (
    <>
      <p>
        PKMessenger v{appInfo?.version || '?'} · <b>{UPDATE_TEXT[u.state] || u.state}</b>
        {u.lastChecked && u.state !== 'checking' ? <span className="muted small"> · geprüft um {formatShortTime(u.lastChecked)}</span> : null}
      </p>
      {u.state === 'disabled' && u.reason && <p className="muted small">ℹ️ {u.reason}</p>}
      {u.state === 'error' && u.error && (
        <p className="warn small">
          ⚠ {u.error.hint}
          {u.error.detail ? <span className="muted"> ({u.error.detail})</span> : null}
        </p>
      )}
      <div className="settings__row">
        {u.enabled && u.state !== 'ready' && (
          <button className="btn btn--small" disabled={busy || u.state === 'downloading'} onClick={onSearch}>
            {busy ? 'Suche …' : '🔄 Jetzt nach Updates suchen'}
          </button>
        )}
        {u.state === 'ready' && (
          <button className="btn btn--primary btn--small" onClick={() => api.installUpdate().catch((e) => toast({ kind: 'error', title: e.message }))}>
            Jetzt neu starten und installieren
          </button>
        )}
        <button className="btn btn--ghost btn--small" disabled={changes === 'busy'} onClick={loadChanges}>
          {changes === 'busy' ? 'Lade …' : '📝 Was ist neu?'}
        </button>
      </div>
      {u.enabled && <p className="muted small">Die App sucht automatisch beim Start und alle 15 Minuten. „Jetzt suchen“ fragt direkt bei GitHub.</p>}
      <WhatsNewToggle />

      {changes && changes !== 'busy' && (
        <div className="update-changes" role="region" aria-label="Was ist neu?">
          <p className="small">
            Deine Version: <b>v{changes.current}</b> · Neueste: <b>{changes.latest ? `v${changes.latest}` : '–'}</b> {changes.newer ? <span className="ok">· Update verfügbar 🎉</span> : <span className="muted">· du bist aktuell</span>}
          </p>
          {changes.commits.length > 0 && (
            <>
              <span className="settings__label">Änderungen seit deiner Version</span>
              <ul className="update-changes__list">
                {changes.commits.map((c) => (
                  <li key={c.sha}>
                    {c.merge ? '🔀' : '•'} {c.title} <span className="muted small">· {c.sha}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {changes.releases.map((r, i) => (
            <details key={r.tag} className="update-changes__release" open={i === 0}>
              <summary>
                <b>{r.name}</b> <span className="muted small">{fmtDate(r.date)}</span>
                {r.tag === `v${changes.current}` && <span className="ok small"> · installiert</span>}
              </summary>
              {r.notes.length ? (
                <ul className="update-changes__list">
                  {r.notes.map((n) => (
                    <li key={n}>• {n}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">Keine Notizen.</p>
              )}
            </details>
          ))}
          {latestSetup && (
            <button className="btn btn--ghost btn--small" onClick={() => setReinstall(latestSetup)}>
              ⬇ Neueste Version neu installieren
            </button>
          )}
        </div>
      )}

      {again && (
        <div className="modal-backdrop" onMouseDown={() => setAgain(false)}>
          <div className="modal confirm" role="dialog" aria-label="Nochmal prüfen?" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Nochmal nachsehen?</h3>
            <p>Du hast gerade erst geprüft ({formatShortTime(u.lastChecked)}) und hast die neueste Version. Soll die App trotzdem nochmal direkt bei GitHub nach dem neuesten Release schauen?</p>
            <div className="confirm__actions">
              <button className="btn btn--ghost" onClick={() => setAgain(false)}>
                Abbrechen
              </button>
              <button className="btn btn--primary" autoFocus onClick={search}>
                Ja, nochmal prüfen
              </button>
            </div>
          </div>
        </div>
      )}
      {reinstall && (
        <div className="modal-backdrop" onMouseDown={() => setReinstall(null)}>
          <div className="modal confirm" role="dialog" aria-label="Neu installieren" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Neueste Version neu installieren?</h3>
            <p>Dein Browser lädt <b>PKMessenger-Setup.exe</b> direkt von GitHub. Einfach ausführen, dann ist die App frisch installiert. Token, Einstellungen und Chats bleiben erhalten.</p>
            <p className="muted small">Hilfreich, wenn ein Update hängt oder etwas kaputt wirkt.</p>
            <div className="confirm__actions">
              <button className="btn btn--ghost" onClick={() => setReinstall(null)}>
                Abbrechen
              </button>
              <button
                className="btn btn--primary"
                autoFocus
                onClick={() => {
                  const url = reinstall;
                  setReinstall(null);
                  api.openExternal({ url }).catch((e) => toast({ kind: 'error', title: e.message }));
                }}
              >
                ⬇ Herunterladen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
