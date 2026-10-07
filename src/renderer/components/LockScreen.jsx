import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import Logo from './Logo.jsx';

// Sperrbildschirm (Issue #1: App-Sperre mit Passwort). Solange gesperrt, lehnt der Main-Prozess alle Anfragen ab.
export default function LockScreen({ onUnlocked }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hello, setHello] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    api
      .lockStatus()
      .then((s) => setHello(Boolean(s.hello)))
      .catch(() => {});
  }, []);

  // Windows Hello: Windows zeigt seinen eigenen Dialog (Fingerabdruck/Gesicht/PIN)
  const unlockHello = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.lockHello();
      onUnlocked();
    } catch (err) {
      setError(`${err.message} ${err.hint || ''}`.trim());
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (e) => {
    e?.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    try {
      await api.lockVerify({ password });
      setPassword('');
      onUnlocked();
    } catch (err) {
      // Hinweis nur bei der Fehlversuch-Sperre (dort steht die Wartezeit)
      setError(/Fehlversuche/.test(err.message) ? `${err.message} ${err.hint || ''}`.trim() : err.message);
      setPassword('');
      ref.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="lock-screen">
      <form className="lock-card" onSubmit={unlock}>
        <Logo size={56} />
        <h1>PKMessenger ist gesperrt</h1>
        <p className="muted">Gib dein App-Passwort ein.</p>
        <input ref={ref} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Passwort" aria-label="Passwort" />
        {error && <p className="warn small">{error}</p>}
        <button className="btn btn--primary" type="submit" disabled={!password || busy}>
          {busy ? 'Prüfe …' : '🔓 Entsperren'}
        </button>
        {hello && (
          <button className="btn" type="button" disabled={busy} onClick={unlockHello}>
            👆 Mit Windows Hello entsperren
          </button>
        )}
        <p className="muted small">Passwort vergessen? Dann App-Daten löschen: %APPDATA%\PKMessenger\settings.json → Eintrag „appLock“ entfernen.</p>
      </form>
    </main>
  );
}
