import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
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

export default function UpdateSection({ appInfo, toast }) {
  const u = appInfo?.update || { state: 'idle' };
  const [waiting, setWaiting] = useState(false);
  const timer = useRef(null);

  // Nach einem Klick auf „Jetzt suchen“ das Ergebnis als Hinweis melden
  useEffect(() => {
    if (!waiting || !DONE.has(u.state) || u.lastChecked < waiting) return;
    clearTimeout(timer.current);
    setWaiting(false);
    if (u.state === 'current') toast({ kind: 'info', title: 'Kein Update nötig ✓', text: `Du hast die neueste Version (v${appInfo?.version}).`, duration: 4000 });
    else if (u.state === 'downloading') toast({ kind: 'info', title: 'Neue Version gefunden 🎉', text: 'Sie wird im Hintergrund geladen. Danach erscheint „Jetzt neu starten“.' });
    else if (u.state === 'ready') toast({ kind: 'info', title: 'Update bereit', text: 'Klicke auf „Jetzt neu starten“, um es zu installieren.' });
    else toast({ kind: 'error', title: u.error?.message || 'Update-Prüfung fehlgeschlagen', text: u.error?.hint });
  }, [waiting, u.state, u.lastChecked, u.error, appInfo?.version, toast]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const search = async () => {
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

  const busy = Boolean(waiting) || u.state === 'checking';
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
          <button className="btn btn--small" disabled={busy || u.state === 'downloading'} onClick={search}>
            {busy ? 'Suche …' : '🔄 Jetzt nach Updates suchen'}
          </button>
        )}
        {u.state === 'ready' && (
          <button className="btn btn--primary btn--small" onClick={() => api.installUpdate().catch((e) => toast({ kind: 'error', title: e.message }))}>
            Jetzt neu starten und installieren
          </button>
        )}
      </div>
      {u.enabled && <p className="muted small">Die App sucht automatisch beim Start und alle 15 Minuten.</p>}
    </>
  );
}
