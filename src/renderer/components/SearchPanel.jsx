import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMessageTime } from '../../shared/format';

// Strg+F: durchsucht die bereits geladenen Nachrichten dieses Kanals (Server-weite Suche folgt mit F14).
export default function SearchPanel({ messages, onJump, onClose }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    return messages
      .filter((m) => !m.pending && !m.failed && (m.content.toLowerCase().includes(needle) || m.author.name.toLowerCase().includes(needle)))
      .slice(-50)
      .reverse();
  }, [q, messages]);

  return (
    <aside className="search-panel" aria-label="Suche">
      <div className="search-panel__head">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && results[0]) onJump(results[0].id);
          }}
          placeholder="Im geladenen Verlauf suchen …"
        />
        <button className="icon-btn" onClick={onClose} aria-label="Suche schließen">
          ×
        </button>
      </div>
      <p className="muted small search-panel__note">Durchsucht {messages.length.toLocaleString('de-DE')} geladene Nachrichten. Hochscrollen lädt ältere nach.</p>
      <div className="search-panel__list">
        {q.trim().length >= 2 && results.length === 0 && <div className="empty empty--small">Keine Treffer.</div>}
        {results.map((m) => (
          <button key={m.id} className="search-hit" onClick={() => onJump(m.id)}>
            <span className="search-hit__head">
              <b>{m.author.name}</b> <span className="muted small">{formatMessageTime(m.createdTimestamp)}</span>
            </span>
            <span className="search-hit__text">{m.content.slice(0, 160) || '[ohne Text]'}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
