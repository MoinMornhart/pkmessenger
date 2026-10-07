import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, searchEmojis } from '../../shared/emoji-data';

// Smiley-Auswahl mit Kategorien und Suche (Issue #1: „mehr Smileys“). Optional: eigene Server-Emojis (customEmojis).
export default function EmojiPicker({ onPick, onClose, customEmojis = [], className = '' }) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState(customEmojis.length ? 'server' : CATEGORIES[0].id);
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const close = (e) => !ref.current?.contains(e.target) && onClose();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const found = query ? searchEmojis(query) : null;
  const current = CATEGORIES.find((c) => c.id === cat);

  return (
    <div ref={ref} className={`emoji-panel ${className}`} role="dialog" aria-label="Smileys">
      <input ref={inputRef} className="emoji-panel__search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Smiley suchen … (z. B. herz, lachen, pizza)" aria-label="Smiley suchen" />
      {!query && (
        <div className="emoji-panel__tabs" role="tablist">
          {customEmojis.length > 0 && (
            <button role="tab" aria-selected={cat === 'server'} className={cat === 'server' ? 'is-on' : ''} title="Server-Emojis" onClick={() => setCat('server')}>
              ⭐
            </button>
          )}
          {CATEGORIES.map((c) => (
            <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? 'is-on' : ''} title={c.title} onClick={() => setCat(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="emoji-panel__title">{query ? `Treffer für „${query}“` : cat === 'server' ? 'Server-Emojis' : current?.title}</div>
      <div className="emoji-panel__grid">
        {found && found.length === 0 && <span className="muted small">Nichts gefunden.</span>}
        {(found || (cat === 'server' ? null : current.items.map(([e]) => e)) || []).map((e) => (
          <button key={e} className="emoji-panel__item" onClick={() => onPick(e)} title={e}>
            {e}
          </button>
        ))}
        {!query &&
          cat === 'server' &&
          customEmojis.map((e) => (
            <button key={e.key} className="emoji-panel__item" onClick={() => onPick(e.key, e)} title={`:${e.name}:`}>
              {e.url ? <img src={e.url} alt={e.name} /> : e.name}
            </button>
          ))}
      </div>
    </div>
  );
}
