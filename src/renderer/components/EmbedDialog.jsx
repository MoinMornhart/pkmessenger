import { useEffect, useState } from 'react';
import MessageContent from './MessageContent.jsx';

const COLORS = ['#2dd4bf', '#6366f1', '#f59e0b', '#ef4444', '#22c55e', '#ec4899', '#94a3b8'];

// F11: Embed-Baukasten mit Live-Vorschau. Grenzen wie bei Discord (Titel 256, Beschreibung 4096).
export default function EmbedDialog({ onClose, onAdd }) {
  const [e, setE] = useState({ title: '', description: '', color: COLORS[0], url: '', footer: '' });
  const set = (k) => (ev) => setE((x) => ({ ...x, [k]: ev.target.value }));
  const urlOk = !e.url || /^https?:\/\/\S+$/.test(e.url);
  const ok = (e.title.trim() || e.description.trim()) && e.title.length <= 256 && e.description.length <= 4096 && e.footer.length <= 2048 && urlOk;

  useEffect(() => {
    const onKey = (ev) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const clean = () => Object.fromEntries(Object.entries(e).filter(([, v]) => typeof v === 'string' && v.trim() !== '').map(([k, v]) => [k, v.trim()]));

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal embed-dialog" role="dialog" aria-label="Embed erstellen" onMouseDown={(ev) => ev.stopPropagation()}>
        <div className="settings__head">
          <h3>Embed erstellen</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        <div className="embed-dialog__grid">
          <div className="embed-dialog__form">
            <label className="settings__label" htmlFor="emb-title">
              Titel <span className="muted small">{e.title.length}/256</span>
            </label>
            <input id="emb-title" value={e.title} onChange={set('title')} maxLength={256} />
            <label className="settings__label" htmlFor="emb-desc">
              Beschreibung <span className="muted small">{e.description.length}/4096 · **fett**, *kursiv*, Links</span>
            </label>
            <textarea id="emb-desc" rows={5} value={e.description} onChange={set('description')} maxLength={4096} />
            <label className="settings__label" htmlFor="emb-url">
              Link (optional)
            </label>
            <input id="emb-url" value={e.url} onChange={set('url')} placeholder="https://…" />
            {!urlOk && <span className="warn small">Link muss mit https:// beginnen.</span>}
            <label className="settings__label" htmlFor="emb-footer">
              Fußzeile (optional)
            </label>
            <input id="emb-footer" value={e.footer} onChange={set('footer')} maxLength={2048} />
            <span className="settings__label">Farbe</span>
            <div className="color-row">
              {COLORS.map((c) => (
                <button key={c} className={`color-dot ${e.color === c ? 'is-sel' : ''}`} style={{ background: c }} onClick={() => setE((x) => ({ ...x, color: c }))} aria-label={`Farbe ${c}`} />
              ))}
            </div>
          </div>
          <div>
            <span className="settings__label">Vorschau</span>
            <div className="embed" style={{ '--embed': e.color }}>
              {e.title && <div className="embed__title">{e.title}</div>}
              {e.description && (
                <div className="embed__desc">
                  <MessageContent content={e.description} />
                </div>
              )}
              {e.footer && <div className="embed__footer">{e.footer}</div>}
              {!e.title && !e.description && <span className="muted small">Titel oder Beschreibung eingeben …</span>}
            </div>
          </div>
        </div>
        <div className="confirm__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn--primary" disabled={!ok} onClick={() => onAdd(clean())}>
            Zur Nachricht hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}
