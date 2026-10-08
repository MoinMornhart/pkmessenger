import { isAndroid } from '../platform';
import { useState } from 'react';
import { api } from '../api';
import Logo from './Logo.jsx';
import SetupWizard from './SetupWizard.jsx';

const REASONS = {
  'missing-file': ['Noch kein Bot-Token eingetragen.', 'Der Assistent unten führt dich Schritt für Schritt durch. Der Token wird verschlüsselt gespeichert.'],
  'missing-token': ['Noch kein Bot-Token eingetragen.', 'Der Assistent unten führt dich Schritt für Schritt durch.'],
  'invalid-format': ['Das sieht nicht wie ein Bot-Token aus.', 'Ein Bot-Token hat drei Teile mit Punkten dazwischen. Kopiere ihn erneut aus dem Developer Portal (Bot → Reset Token).'],
  'read-error': ['Die .env-Datei konnte nicht gelesen werden.', 'Prüfe, ob die Datei von einem anderen Programm gesperrt ist.'],
  TOKEN_INVALID: ['Discord hat den Token abgelehnt.', 'Der Token ist falsch oder wurde zurückgesetzt. Erzeuge im Developer Portal unter "Bot" mit "Reset Token" einen neuen und trage ihn ein.'],
};

export default function SetupScreen({ status, onReconnect }) {
  const [reason, hint] = REASONS[status.reason] || REASONS['missing-token'];
  const [envInfo, setEnvInfo] = useState(null);
  const [busy, setBusy] = useState(false);
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

        <SetupWizard status={status} onReconnect={retry} />
        {!isAndroid && <p className="muted small">
          Alternativ: Eine <code>.env</code> mit <code>DISCORD_TOKEN=…</code> wird beim Start automatisch übernommen, verschlüsselt und gelöscht.{' '}
          <button className="link-btn" onClick={openEnv}>
            .env-Datei öffnen
          </button>
          {envInfo?.path && <span> ({envInfo.path})</span>}
        </p>}
      </div>
    </div>
  );
}
