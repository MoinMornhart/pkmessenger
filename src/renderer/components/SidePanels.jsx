import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { bus } from '../state';
import { formatMessageTime, formatListTime } from '../../shared/format';
import { timestampOf } from '../../shared/snowflake';

// Kleiner Eingabe-Dialog (window.prompt gibt es in Electron nicht)
export function NameDialog({ title, label, initial = '', confirmLabel = 'OK', multilineLabel, onConfirm, onClose }) {
  const [name, setName] = useState(initial);
  const [text, setText] = useState('');
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const ok = name.trim().length > 0 && name.length <= 100 && (!multilineLabel || text.trim().length > 0);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal confirm" role="dialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <label className="settings__label" htmlFor="name-dialog-input">
          {label} <span className="muted small">{name.length}/100</span>
        </label>
        <div className="settings__row">
          <input id="name-dialog-input" ref={ref} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok && !multilineLabel && onConfirm(name.trim(), text.trim())} />
        </div>
        {multilineLabel && (
          <>
            <label className="settings__label" htmlFor="name-dialog-text">
              {multilineLabel}
            </label>
            <textarea id="name-dialog-text" className="dialog-textarea" rows={4} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
          </>
        )}
        <div className="confirm__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn--primary" disabled={!ok} onClick={() => onConfirm(name.trim(), text.trim())}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function PanelShell({ title, onClose, children, actions }) {
  return (
    <aside className="search-panel" aria-label={title}>
      <div className="search-panel__head">
        <strong className="panel-title">{title}</strong>
        {actions}
        <button className="icon-btn" onClick={onClose} aria-label={`${title} schließen`}>
          ×
        </button>
      </div>
      <div className="search-panel__list">{children}</div>
    </aside>
  );
}

// F13: angeheftete Nachrichten des Kanals
export function PinsPanel({ channel, onJump, onClose, toast }) {
  const [state, setState] = useState({ loading: true, items: [], error: null });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, items: [], error: null });
    api
      .listPins({ channelId: channel.id })
      .then((r) => alive && setState({ loading: false, items: r.items || [], error: null }))
      .catch((e) => alive && setState({ loading: false, items: [], error: e }));
    return () => {
      alive = false;
    };
  }, [channel.id]);
  return (
    <PanelShell title="📌 Angeheftet" onClose={onClose}>
      {state.loading && <div className="empty empty--small">Lade …</div>}
      {state.error && (
        <div className="empty empty--small">
          {state.error.message}
          {state.error.hint && <p className="muted small">Was kann ich tun? {state.error.hint}</p>}
        </div>
      )}
      {!state.loading && !state.error && state.items.length === 0 && <div className="empty empty--small">Keine angehefteten Nachrichten.</div>}
      {state.items.map(({ message: m }) => (
        <button
          key={m.id}
          className="search-hit"
          onClick={() => {
            onJump(m.id);
            toast?.({ kind: 'info', title: 'Zur Nachricht gesprungen', duration: 1500 });
          }}
        >
          <span className="search-hit__head">
            <b>{m.author?.name}</b> <span className="muted small">{formatMessageTime(m.createdTimestamp)}</span>
          </span>
          <span className="search-hit__text">{m.content?.slice(0, 160) || (m.attachments?.length ? '📎 Anhang' : '[ohne Text]')}</span>
        </button>
      ))}
    </PanelShell>
  );
}

// F12: Threads eines Kanals (auch Forum-Beiträge), neuer Thread
export function ThreadsPanel({ channel, onOpen, onClose, toast, full = false }) {
  const [state, setState] = useState({ loading: true, items: [], error: null });
  const [creating, setCreating] = useState(false);
  const isForum = channel.type === 'forum';

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .listThreads({ channelId: channel.id })
      .then((items) => setState({ loading: false, items, error: null }))
      .catch((e) => setState({ loading: false, items: [], error: e }));
  }, [channel.id]);

  useEffect(() => {
    load();
    return bus.on((type, p) => type === 'threads:changed' && p?.channelId === channel.id && load());
  }, [load, channel.id]);

  const body = (
    <>
      {state.loading && state.items.length === 0 && <div className="empty empty--small">Lade …</div>}
      {state.error && <div className="empty empty--small">{state.error.message}</div>}
      {!state.loading && !state.error && state.items.length === 0 && <div className="empty empty--small">{isForum ? 'Noch keine Beiträge.' : 'Keine Threads in diesem Kanal.'}</div>}
      {state.items.map((t) => (
        <button key={t.id} className={`search-hit thread-hit ${t.archived ? 'is-archived' : ''}`} onClick={() => onOpen(t.id)}>
          <span className="search-hit__head">
            <b>🧵 {t.name}</b>
            <span className="muted small">{formatListTime(timestampOf(t.lastMessageId || t.id))}</span>
          </span>
          <span className="muted small">
            {Number.isFinite(t.messageCount) ? `${t.messageCount} Nachrichten` : 'Thread'}
            {t.archived ? ' · archiviert' : ''}
            {t.locked ? ' · gesperrt' : ''}
          </span>
        </button>
      ))}
      {creating && (
        <NameDialog
          title={isForum ? 'Neuer Forum-Beitrag' : 'Neuer Thread'}
          label={isForum ? 'Titel des Beitrags' : 'Name des Threads'}
          multilineLabel={isForum ? 'Erste Nachricht' : undefined}
          confirmLabel="Erstellen"
          onClose={() => setCreating(false)}
          onConfirm={async (name, content) => {
            setCreating(false);
            try {
              const t = await api.createThread({ channelId: channel.id, name, ...(isForum ? { content } : {}) });
              onOpen(t.id);
            } catch (e) {
              toast?.({ kind: 'error', title: e.message, text: e.hint });
            }
          }}
        />
      )}
    </>
  );

  const createBtn = (
    <button className="btn btn--small btn--primary" onClick={() => setCreating(true)}>
      + {isForum ? 'Beitrag' : 'Thread'}
    </button>
  );

  if (full) {
    return (
      <main className="chat forum">
        <header className="chat__head">
          <div className="chat-avatar" aria-hidden="true">
            🗂
          </div>
          <div className="chat__title">
            <h1>{channel.name}</h1>
            <span className="chat__sub">Forum · {state.items.length} Beiträge</span>
          </div>
          <div className="chat__tools">{createBtn}</div>
        </header>
        <div className="forum__list">{body}</div>
      </main>
    );
  }
  return (
    <PanelShell title="🧵 Threads" onClose={onClose} actions={createBtn}>
      {body}
    </PanelShell>
  );
}
