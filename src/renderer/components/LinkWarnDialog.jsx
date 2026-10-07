import { useEffect, useState } from 'react';
import { prefs } from '../prefs';
import { describeLink } from '../../shared/media';

// Warnung vor dem Öffnen eines Links (Issue #1): zeigt das echte Ziel, warnt bei verdächtigen Adressen.
// Häkchen „Nicht mehr fragen“ schaltet die Warnung ab (wieder einschaltbar unter Einstellungen → Datenschutz).
export default function LinkWarnDialog({ url, onOpen, onClose }) {
  const [skip, setSkip] = useState(false);
  const { host, warnings } = describeLink(url);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal confirm link-warn" role="dialog" aria-label="Link öffnen?" onMouseDown={(e) => e.stopPropagation()}>
        <h3>🔗 Link im Browser öffnen?</h3>
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
        <label className="composer__ping">
          <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Nicht mehr fragen
        </label>
        <div className="confirm__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="btn btn--primary"
            autoFocus
            onClick={() => {
              if (skip) prefs.set({ linkWarn: false });
              onOpen();
            }}
          >
            Öffnen
          </button>
        </div>
      </div>
    </div>
  );
}
