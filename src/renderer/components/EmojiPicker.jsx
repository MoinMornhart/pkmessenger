import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CATEGORIES, searchEmojis } from '../../shared/emoji-data';

// Smiley-Auswahl mit Kategorien und Suche (Issue #1: „mehr Smileys“). Optional: eigene Server-Emojis (customEmojis).
export default function EmojiPicker({ onPick, onClose, customEmojis = [], className = '' }) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState(customEmojis.length ? 'server' : CATEGORIES[0].id);
  const ref = useRef(null);
  const inputRef = useRef(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    inputRef.current?.focus();
    const close = (e) => !ref.current?.contains(e.target) && closeRef.current();
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const found = query ? searchEmojis(query) : null;
  const current = CATEGORIES.find((c) => c.id === cat);

  // Immer ganz sichtbar (JoniMoni #73): ragt das Fenster aus dem Chat-Bereich (z. B. Reaktion auf eine Nachricht links),
  // rückt es so weit wie nötig hinein – seitlich und nach oben/unten. 'translate' stört die Einblend-Animation nicht.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const area = el.closest('.chat')?.getBoundingClientRect();
    const b = { left: Math.max(area?.left ?? 0, 0) + 8, right: Math.min(area?.right ?? innerWidth, innerWidth) - 8, top: 8, bottom: innerHeight - 8 };
    const r = el.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (r.right > b.right) dx = b.right - r.right;
    if (r.left + dx < b.left) dx = b.left - r.left;
    if (r.bottom > b.bottom) dy = b.bottom - r.bottom;
    if (r.top + dy < b.top) dy = b.top - r.top;
    el.style.translate = dx || dy ? `${Math.round(dx)}px ${Math.round(dy)}px` : '';
  }, []);

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
