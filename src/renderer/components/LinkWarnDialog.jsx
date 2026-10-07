import { useEffect, useState } from 'react';
import { prefs } from '../prefs';
import { checkLink, trustKey } from '../../shared/link-safety';
import { getLists } from '../linkLists';

// Warnung vor dem Öffnen eines Links (Issue #1): zeigt das echte Ziel, warnt bei verdächtigen Adressen.
// Häkchen „Nicht mehr fragen“ schaltet die Warnung ab (wieder einschaltbar unter Einstellungen → Datenschutz).
export default function LinkWarnDialog({ url, onOpen, onClose }) {
  const [skip, setSkip] = useState(false);
  const [trust, setTrust] = useState(false);
  const [risk, setRisk] = useState(false); // gefährliche Links nur mit „Ich verstehe das Risiko“
  const { level, host, reasons: warnings } = checkLink(url, prefs.get().trustedDomains, getLists());
  const danger = level === 'danger';
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal confirm link-warn" role="dialog" aria-label="Link öffnen?" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{danger ? '⛔ Gefährlicher Link!' : level === 'warn' ? '⚠️ Verdächtiger Link' : '🔗 Link im Browser öffnen?'}</h3>
        <p>
          Du verlässt PKMessenger. Ziel: <b>{host || 'unbekannt'}</b>
        </p>
        <div className="link-warn__url">{url}</div>
        {warnings.map((w) => (
          <p key={w} className="warn small">
            ⚠ {w}
          </p>
        ))}
        <p className="muted small">Die Webseite sieht deine IP-Adresse. Öffne nur Links von Leuten, denen du vertraust.</p>
        {danger ? (
          <label className="composer__ping warn">
            <input type="checkbox" checked={risk} onChange={(e) => setRisk(e.target.checked)} /> Ich verstehe das Risiko und will den Link trotzdem öffnen
          </label>
        ) : (
          <>
            {(level === 'ok' || level === 'unknown') && host && (
              <label className="composer__ping">
                <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} /> „{trustKey(host)}“ vertrauen (künftig ohne Frage öffnen)
              </label>
            )}
            <label className="composer__ping">
              <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Bei normalen Links nicht mehr fragen
            </label>
          </>
        )}
        <div className="confirm__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            autoFocus={!danger}
            disabled={danger && !risk}
            onClick={() => {
              if (skip) prefs.set({ linkWarn: false });
              if (trust) prefs.set({ trustedDomains: [...new Set([...prefs.get().trustedDomains, trustKey(host)])] });
              onOpen();
            }}
          >
            {danger ? 'Trotzdem öffnen' : 'Öffnen'}
          </button>
        </div>
      </div>
    </div>
  );
}
