import { useEffect, useState } from 'react';
import { api } from '../api';
import Logo from './Logo.jsx';

const REASONS = {
  'missing-file': ['Noch kein Bot-Token eingetragen.', 'Füge deinen Token unten in Schritt 2 ein – er wird verschlüsselt gespeichert.'],
  'missing-token': ['Noch kein Bot-Token eingetragen.', 'Füge deinen Token unten in Schritt 2 ein.'],
  'invalid-format': ['Das sieht nicht wie ein Bot-Token aus.', 'Ein Bot-Token hat drei Teile mit Punkten dazwischen. Kopiere ihn erneut aus dem Developer Portal (Bot → Reset Token).'],
  'read-error': ['Die .env-Datei konnte nicht gelesen werden.', 'Prüfe, ob die Datei von einem anderen Programm gesperrt ist.'],
  TOKEN_INVALID: ['Discord hat den Token abgelehnt.', 'Der Token ist falsch oder wurde zurückgesetzt. Erzeuge im Developer Portal unter "Bot" mit "Reset Token" einen neuen und trage ihn ein.'],
};

const PORTAL = 'https://discord.com/developers/applications';

export default function SetupScreen({ status, onReconnect }) {
  const [reason, hint] = REASONS[status.reason] || REASONS['missing-token'];
  const [envInfo, setEnvInfo] = useState(null);
  const [inviteUrl, setInviteUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [tokenError, setTokenError] = useState(null);

  const saveToken = async () => {
    setBusy(true);
    setTokenError(null);
    try {
      const res = await api.tokenSave({ token });
      setToken(''); // nicht im Speicher der Oberfläche liegen lassen
      if (res?.state !== 'ready' && res?.error) setTokenError(res.error);
    } catch (e) {
      setTokenError({ message: e.message, hint: e.hint || '' });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    api.getInviteUrl().then(setInviteUrl).catch(() => setInviteUrl(null));
  }, [status.updatedAt]);

  const openEnv = async () => setEnvInfo(await api.openEnvFile());
  const retry = async () => {
    setBusy(true);
    await onReconnect();
    setBusy(false);
  };

  return (
    <div className="center-screen center-screen--scroll">
      <div className="center-card center-card--wide">
        <div className="setup-head">
          <Logo size={48} />
          <div>
            <h1>PKMessenger einrichten</h1>
            <p className="muted">Bot-Control-Center für Discord – alle Nachrichten gehen als dein Bot (mit BOT-Kennzeichnung) raus.</p>
          </div>
        </div>

        <div className="callout callout--warn">
          <strong>{reason}</strong>
          <p>{hint}</p>
        </div>

        <ol className="steps">
          <li>
            <h3>Bot anlegen</h3>
            <p>
              Öffne das Discord Developer Portal → <b>New Application</b> → Name vergeben → links <b>Bot</b> → <b>Reset Token</b> → Token <b>einmal</b> kopieren.
            </p>
            <button className="btn" onClick={() => api.openExternal({ url: PORTAL })}>
              Developer Portal öffnen ↗
            </button>
          </li>
          <li>
            <h3>Token hier einfügen</h3>
            <p>
              Der Token wird sofort <b>verschlüsselt</b> gespeichert (an dein Windows-Konto gebunden) und nie wieder angezeigt. Den Token <b>nie</b> teilen oder
              abfotografieren. Falls er doch irgendwo landet: sofort <b>Reset Token</b>.
            </p>
            <div className="settings__row">
              <input
                id="setup-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && token && saveToken()}
                placeholder="Bot-Token einfügen (Strg+V)"
                aria-label="Bot-Token"
              />
              <button className="btn btn--primary" onClick={saveToken} disabled={!token || busy}>
                {busy ? 'Prüfe …' : 'Speichern & verbinden'}
              </button>
            </div>
            {tokenError && (
              <p className="warn small">
                {tokenError.message} {tokenError.hint}
              </p>
            )}
            <p className="muted small">
              Alternativ: Eine <code>.env</code> mit <code>DISCORD_TOKEN=…</code> wird beim Start automatisch übernommen, verschlüsselt und gelöscht.{' '}
              <button className="link-btn" onClick={openEnv}>
                .env-Datei öffnen
              </button>
              {envInfo?.path && <span> ({envInfo.path})</span>}
            </p>
          </li>
          <li>
            <h3>Message Content Intent einschalten</h3>
            <p>
              Im Portal unter <b>Bot → Privileged Gateway Intents</b> nur <b>Message Content Intent</b> aktivieren (damit der Bot Nachrichtentexte lesen
              darf). <i>Server Members</i> und <i>Presence</i> bleiben AUS – PKMessenger braucht sie nicht.
            </p>
          </li>
          <li>
            <h3>Bot auf deinen Test-Server einladen</h3>
            <p>
              Rechte: Kanäle ansehen, Nachrichten senden, Nachrichtenverlauf lesen (+ Reaktionen, Dateien, Links einbetten für später). Der Bot sieht nur
              Kanäle, die seine Rolle sehen darf.
            </p>
            {inviteUrl ? (
              <button className="btn" onClick={() => api.openExternal({ url: inviteUrl })}>
                Einladungslink öffnen ↗
              </button>
            ) : (
              <p className="muted small">Der fertige Einladungslink erscheint hier, sobald ein Token eingetragen ist.</p>
            )}
          </li>
          <li>
            <h3>Verbinden</h3>
            <p>Solange PKMessenger nicht läuft, zeigt Discord deinen Bot als <b>offline</b>. Das ist normal.</p>
            <button className="btn btn--primary" onClick={retry} disabled={busy}>
              {busy ? 'Verbinde …' : 'Jetzt verbinden'}
            </button>
          </li>
        </ol>
      </div>
    </div>
  );
}
