import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { NavContext } from '../state';
import { formatMessageTime } from '../../shared/format';

// Strg+F: „Dieser Chat“ durchsucht die geladenen Nachrichten (sofort),
// „Ganzer Server“ nutzt die offizielle Discord-Suche (F14, max. 25 Treffer pro Seite).
export default function SearchPanel({ messages, guild, channelId, onJump, onClose, toast }) {
  const nav = useContext(NavContext);
  const [mode, setMode] = useState('chat');
  const [q, setQ] = useState('');
  const [server, setServer] = useState({ loading: false, results: [], total: 0, error: null, pending: false, searched: '' });
  const inputRef = useRef(null);
  useEffect(() => inputRef.current?.focus(), [mode]);

  const local = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    return messages
      .filter((m) => !m.pending && !m.failed && ((m.content || '').toLowerCase().includes(needle) || (m.author?.name || '').toLowerCase().includes(needle)))
      .slice(-50)
      .reverse();
  }, [q, messages]);

  const runServer = async () => {
    const content = q.trim();
    if (!content || !guild?.id) return;
    setServer((s) => ({ ...s, loading: true, error: null, pending: false }));
    try {
      const r = await api.searchMessages({ guildId: guild.id, content });
      setServer({ loading: false, results: r.results || [], total: r.total || 0, error: null, pending: Boolean(r.pending), searched: content });
    } catch (e) {
      setServer({ loading: false, results: [], total: 0, error: e, pending: false, searched: content });
    }
  };

  return (
    <aside className="search-panel" aria-label="Suche">
      <div className="search-panel__tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'chat'} className={mode === 'chat' ? 'is-sel' : ''} onClick={() => setMode('chat')}>
          Dieser Chat
        </button>
        {!guild?.isDM && (
          <button role="tab" aria-selected={mode === 'server'} className={mode === 'server' ? 'is-sel' : ''} onClick={() => setMode('server')}>
            Ganzer Server
          </button>
        )}
        <button className="icon-btn" onClick={onClose} aria-label="Suche schließen">
          ×
        </button>
      </div>
      <div className="search-panel__head">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter') {
              if (mode === 'server') runServer();
              else if (local[0]) onJump(local[0].id);
            }
          }}
          placeholder={mode === 'chat' ? 'Im geladenen Verlauf suchen …' : 'Suchbegriff, dann Enter'}
          maxLength={1024}
        />
      </div>

      {mode === 'chat' ? (
        <>
          <p className="muted small search-panel__note">Durchsucht {messages.length.toLocaleString('de-DE')} geladene Nachrichten. Hochscrollen lädt ältere nach.</p>
          <div className="search-panel__list">
            {q.trim().length >= 2 && local.length === 0 && <div className="empty empty--small">Keine Treffer.</div>}
            {local.map((m) => (
              <button key={m.id} className="search-hit" onClick={() => onJump(m.id)}>
                <span className="search-hit__head">
                  <b>{m.author?.name}</b> <span className="muted small">{formatMessageTime(m.createdTimestamp)}</span>
                </span>
                <span className="search-hit__text">{(m.content || '').slice(0, 160) || '[ohne Text]'}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="muted small search-panel__note">Offizielle Discord-Suche über alle Kanäle, die der Bot sehen darf.</p>
          <div className="search-panel__list">
            {server.loading && <div className="empty empty--small">Suche …</div>}
            {server.pending && <div className="empty empty--small">Discord baut den Suchindex für diesen Server gerade auf. Bitte in ein paar Sekunden erneut suchen.</div>}
            {server.error && (
              <div className="empty empty--small">
                {server.error.message}
                {server.error.hint && <p className="muted small">Was kann ich tun? {server.error.hint}</p>}
              </div>
            )}
            {!server.loading && !server.pending && !server.error && server.searched && server.results.length === 0 && <div className="empty empty--small">Keine Treffer für „{server.searched}“.</div>}
            {server.results.length > 0 && <p className="muted small search-panel__note">{server.total.toLocaleString('de-DE')} Treffer insgesamt (die ersten 25)</p>}
            {server.results.map((r) => (
              <button
                key={r.id}
                className="search-hit"
                onClick={() => {
                  if (r.channelId === channelId) onJump(r.id);
                  else {
                    nav.openChannel(r.channelId);
                    toast?.({ kind: 'info', title: `#${r.channelName || 'Kanal'} geöffnet`, text: 'Die Nachricht findest du dort per Strg+F.', duration: 3500 });
                  }
                }}
              >
                <span className="search-hit__head">
                  <b>{r.authorName}</b>
                  <span className="muted small">
                    #{r.channelName || '?'} · {r.timestamp ? formatMessageTime(r.timestamp) : ''}
                  </span>
                </span>
                <span className="search-hit__text">{r.content || (r.hasAttachments ? '📎 Anhang' : '[ohne Text]')}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
