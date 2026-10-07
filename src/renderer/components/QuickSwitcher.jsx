import { useEffect, useMemo, useRef, useState } from 'react';
import { fuzzyFilter } from '../../shared/fuzzy';

export default function QuickSwitcher({ channels, guilds, isUnread, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const guildName = useMemo(() => new Map(guilds.map((g) => [g.id, g.name])), [guilds]);

  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo(() => {
    const needle = q.trim().replace(/^#/, '');
    if (needle) return fuzzyFilter(channels, needle, (c) => [c.name, guildName.get(c.guildId)], 30); // unscharf (Issue #1)
    return [...channels].sort((a, b) => Number(!isUnread(a)) - Number(!isUnread(b)) || a.name.localeCompare(b.name, 'de')).slice(0, 30);
  }, [q, channels, isUnread, guildName]);

  useEffect(() => setSel(0), [q]);

  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && results[sel]) onSelect(results[sel].id);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal quick" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Kanal-Schnellsuche">
        <input ref={inputRef} className="quick__input" placeholder="Wohin? Kanalname eingeben …" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
        <div className="quick__list">
          {results.length === 0 && <div className="empty empty--small">Kein Kanal gefunden.</div>}
          {results.map((c, i) => (
            <button key={c.id} className={`quick__item ${i === sel ? 'is-sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => onSelect(c.id)}>
              <span className="ch-icon">#</span>
              <span className={isUnread(c) ? 'strong' : ''}>{c.name}</span>
              <span className="muted small quick__guild">{guildName.get(c.guildId)}</span>
            </button>
          ))}
        </div>
        <div className="quick__foot muted small">↑↓ auswählen · Enter öffnen · Esc schließen</div>
      </div>
    </div>
  );
}
