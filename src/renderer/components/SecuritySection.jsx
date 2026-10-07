import { useEffect, useState } from 'react';
import { api, onEvent } from '../api';

// Einstellungen → Sicherheit & Start: App-Passwort, automatische Sperre, mit Windows starten (Issue #1)
const IDLE = [
  [0, 'nie automatisch'],
  [5, 'nach 5 Minuten ohne Eingabe am PC'],
  [15, 'nach 15 Minuten'],
  [60, 'nach 1 Stunde'],
];

export default function SecuritySection({ toast }) {
  const [lock, setLock] = useState(null);
  const [auto, setAuto] = useState(null);
  const [form, setForm] = useState(null); // null | { mode: 'set'|'change'|'clear', password, repeat, current }

  useEffect(() => {
    api.lockStatus().then(setLock).catch(() => setLock(null));
    api.autostartGet().then(setAuto).catch(() => setAuto({ available: false, enabled: false }));
    return onEvent((type, p) => type === 'lock' && setLock(p));
  }, []);

  const run = async (fn, ok) => {
    try {
      const r = await fn();
      if (ok) toast({ kind: 'info', title: ok, duration: 2500 });
      return r;
    } catch (e) {
      toast({ kind: 'error', title: e.message, text: e.hint });
      return null;
    }
  };

  const submit = async () => {
    if (form.mode === 'clear') {
      const r = await run(() => api.lockClear({ password: form.current }), 'App-Passwort entfernt');
      if (r) setLock(r), setForm(null);
      return;
    }
    if (form.password !== form.repeat) return toast({ kind: 'warn', title: 'Die Passwörter sind nicht gleich.' });
    const r = await run(() => api.lockSet({ password: form.password, current: form.current || undefined, idleMinutes: lock?.idleMinutes ?? 0 }), 'App-Passwort gespeichert 🔒');
    if (r) setLock(r), setForm(null);
    return undefined;
  };

  return (
    <>
      <label className="composer__ping">
        <input
          type="checkbox"
          checked={Boolean(auto?.enabled)}
          disabled={!auto?.available}
          onChange={(e) => run(async () => setAuto(await api.autostartSet({ on: e.target.checked })), e.target.checked ? 'Startet ab jetzt mit Windows' : 'Autostart aus')}
        />{' '}
        🚀 Mit Windows starten
      </label>
      {auto && !auto.available && <p className="muted small">Gibt es nur in der installierten App (PKMessenger-Setup.exe).</p>}

      <span className="settings__label">🔒 App-Passwort</span>
      {lock?.enabled ? (
        <>
          <p className="ok small">Aktiv – beim Start und bei automatischer Sperre wird das Passwort abgefragt.</p>
          <select aria-label="Automatisch sperren" value={lock.idleMinutes} onChange={(e) => run(async () => setLock(await api.lockIdle({ idleMinutes: Number(e.target.value) })))}>
            {IDLE.map(([m, l]) => (
              <option key={m} value={m}>
                Automatisch sperren: {l}
              </option>
            ))}
          </select>
          <div className="settings__row">
            <button className="btn btn--small" onClick={() => run(() => api.lockNow())}>
              🔒 Jetzt sperren
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => setForm({ mode: 'change', password: '', repeat: '', current: '' })}>
              Passwort ändern
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => setForm({ mode: 'clear', current: '' })}>
              Passwort entfernen
            </button>
          </div>
        </>
      ) : (
        !form && (
          <button className="btn btn--small" onClick={() => setForm({ mode: 'set', password: '', repeat: '' })}>
            App-Passwort festlegen
          </button>
        )
      )}
      {form && (
        <div className="lock-form">
          {form.mode !== 'set' && (
            <input type="password" autoComplete="current-password" placeholder="Bisheriges Passwort" aria-label="Bisheriges Passwort" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
          )}
          {form.mode !== 'clear' && (
            <>
              <input type="password" autoComplete="new-password" placeholder="Neues Passwort (mind. 4 Zeichen)" aria-label="Neues Passwort" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <input type="password" autoComplete="new-password" placeholder="Neues Passwort wiederholen" aria-label="Neues Passwort wiederholen" value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} />
            </>
          )}
          <div className="settings__row">
            <button className="btn btn--ghost btn--small" onClick={() => setForm(null)}>
              Abbrechen
            </button>
            <button className={`btn btn--small ${form.mode === 'clear' ? 'btn--danger' : 'btn--primary'}`} onClick={submit}>
              {form.mode === 'clear' ? 'Entfernen' : 'Speichern'}
            </button>
          </div>
          <p className="muted small">Gespeichert wird nur ein verschlüsselter Fingerabdruck (Hash), nie das Passwort selbst.</p>
        </div>
      )}
    </>
  );
}
