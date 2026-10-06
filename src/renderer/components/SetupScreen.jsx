import { useEffect, useState } from 'react';
import { api } from '../api';
import Logo from './Logo.jsx';

const REASONS = {
  'missing-file': ['Noch kein Bot-Token eingetragen.', 'Die .env-Datei existiert noch nicht. Klicke auf ".env-Datei öffnen" – sie wird automatisch angelegt.'],
  'missing-token': ['Noch kein Bot-Token eingetragen.', 'Trage deinen Token in der .env-Datei hinter DISCORD_TOKEN= ein und speichere.'],
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
            <h3>Token in die .env-Datei eintragen</h3>
            <p>
              Hinter <code>DISCORD_TOKEN=</code> einfügen, speichern, schließen. Den Token <b>nie</b> teilen, committen oder screenshotten. Falls er doch
              irgendwo landet: sofort <b>Reset Token</b>.
            </p>
            <button className="btn" onClick={openEnv}>
              .env-Datei öffnen
            </button>
            {(envInfo?.path || status.envPath) && <p className="muted small">Speicherort: {envInfo?.path || status.envPath}</p>}
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
