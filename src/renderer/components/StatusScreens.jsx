import { useEffect, useState } from 'react';
import Logo from './Logo.jsx';

export function ConnectingScreen() {
  return (
    <div className="center-screen">
      <div className="center-card center-card--slim">
        <div className="pulse-logo">
          <Logo size={56} />
        </div>
        <h1>Verbinde mit Discord …</h1>
        <p className="muted">Der Bot meldet sich gerade beim Discord-Gateway an.</p>
      </div>
    </div>
  );
}

const AUTO_RETRY = new Set(['NETWORK', 'LOGIN_TIMEOUT']);

export function ErrorScreen({ status, onReconnect }) {
  const err = status.error || { message: 'Verbindung getrennt.', hint: 'Klicke auf "Neu verbinden".' };
  const auto = AUTO_RETRY.has(err.code);
  const [countdown, setCountdown] = useState(20);

  useEffect(() => {
    if (!auto) return undefined;
    setCountdown(20);
    const t = setInterval(() => setCountdown((c) => (c <= 1 ? (onReconnect(), 20) : c - 1)), 1000);
    return () => clearInterval(t);
  }, [auto, status.updatedAt, onReconnect]);

  return (
    <div className="center-screen">
      <div className="center-card">
        <Logo size={48} />
        <h1>Keine Verbindung</h1>
        <div className="callout callout--error">
          <strong>{err.message}</strong>
        </div>
        <div className="callout">
          <span className="callout__label">Was kann ich tun?</span>
          <p>{err.hint}</p>
        </div>
        <div className="row-actions">
          <button className="btn btn--primary" onClick={onReconnect}>
            Neu verbinden
          </button>
          {auto && <span className="muted">Automatischer Versuch in {countdown} s</span>}
        </div>
      </div>
    </div>
  );
}
