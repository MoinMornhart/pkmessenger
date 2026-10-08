import { isAndroid } from '../platform';
import { useEffect, useState } from 'react';
import { LoginLinkForm } from './LoginLink.jsx';
import { pc } from '../platform';
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

// Schnellstart (JoniMoni #71/#44): Zum Benutzen braucht man NUR den Bot-Token – kein eigenes Discord-Konto.
// Wer noch keinen Bot hat, findet den ausführlichen Assistenten (Bot neu anlegen) darunter.
function TokenQuickStart({ onDone }) {
  const [token, setToken] = useState('');
  // Anmelde-Link (JoniMoni #77): eingefügt oder per Kamera-QR (Android) → Code abfragen statt Token
  const [link, setLink] = useState(() => window.pkPendingLoginLink?.() || null);
  useEffect(() => {
    const on = (e) => e.detail?.url && setLink(e.detail.url);
    window.addEventListener('pk:login-link', on);
    return () => window.removeEventListener('pk:login-link', on);
  }, []);
  useEffect(() => {
    if (token.trim().startsWith('pkmessenger://login')) {
      setLink(token.trim());
      setToken('');
    }
  }, [token]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.tokenSave({ token });
      setToken('');
      if (res?.state !== 'ready') setErr({ message: res?.error?.message || 'Verbindung fehlgeschlagen.', hint: res?.error?.hint || '' });
      else onDone?.();
    } catch (e) {
      setErr({ message: e.message, hint: e.hint });
    } finally {
      setBusy(false);
    }
  };
  if (link)
    return (
      <div className="token-quick">
        <h2>📱 Mit Anmelde-Link anmelden</h2>
        <LoginLinkForm link={link} onCancel={() => setLink(null)} onDone={onDone} />
      </div>
    );
  return (
    <div className="token-quick">
      <h2>🔑 Bot-Token eingeben – mehr brauchst du nicht</h2>
      <p>
        Den Token bekommst du von der Person, der der Bot gehört. Danach bist du sofort drin und schreibst als dieser Bot.
      </p>
      <div className="token-quick__row">
        <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && token && !busy && save()} placeholder="Bot-Token oder Anmelde-Link einfügen" aria-label="Bot-Token" autoFocus />
        <button className="btn btn--primary" disabled={!token.trim() || busy} onClick={save}>
          {busy ? 'Verbinde …' : 'Verbinden'}
        </button>
      </div>
      {err && (
        <p className="warn small">
          {err.message} {err.hint}
        </p>
      )}
      <p className="muted small">
        🔒 Der Token wird sofort verschlüsselt {pc('(an diesen PC gebunden)', '(im Android-Schlüsselspeicher)')} und nie wieder angezeigt. Ist schon ein anderes Gerät angemeldet, geht es auch ohne Abtippen: dort „Anderes Gerät anmelden“ wählen und den QR-Code scannen bzw. den Link hier einfügen. Einfügen: {pc('Strg+V', 'lange ins Feld drücken → Einfügen')}.
      </p>
    </div>
  );
}

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

        {/* Hinweis nur bei echten Problemen – „noch kein Token“ ist der Normalfall und steht im Kasten darunter */}
        {['invalid-format', 'read-error', 'TOKEN_INVALID'].includes(status.reason) && (
          <div className="callout callout--warn">
            <strong>{reason}</strong>
            <p>{hint}</p>
          </div>
        )}

        <TokenQuickStart onDone={retry} />
        <p className="setup-help">
          <button className="link-btn" onClick={() => window.dispatchEvent(new CustomEvent('pk:help-open'))}>
            🙋 Jemanden um Hilfe bitten (im selben WLAN)
          </button>
        </p>

        <details className="setup-more">
          <summary>Noch keinen Bot? Hier einen neuen anlegen (einmalig)</summary>
          <SetupWizard status={status} onReconnect={retry} />
        </details>
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
