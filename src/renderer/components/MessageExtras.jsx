import { memo, useContext, useEffect, useRef, useState } from 'react';
import { MessageActionsContext, NavContext, QUICK_REACTIONS } from '../state';
import MessageContent from './MessageContent.jsx';

// F7: Zitat der Nachricht, auf die geantwortet wurde (Klick springt hin)
export const ReplyQuote = memo(function ReplyQuote({ reference }) {
  const actions = useContext(MessageActionsContext);
  if (!reference) return null;
  return (
    <button className="reply-quote" onClick={() => actions?.jump(reference.messageId)} title="Zur Originalnachricht springen">
      <b>{reference.authorName || 'Nachricht'}</b>
      <span>{reference.text || 'Originalnachricht ist nicht geladen'}</span>
    </button>
  );
});

// F8: Reaktionen unter der Blase; Klick schaltet die eigene Reaktion um
export const Reactions = memo(function Reactions({ message }) {
  const actions = useContext(MessageActionsContext);
  if (!message.reactions?.length) return null;
  return (
    <div className="reactions">
      {message.reactions.map((r) => (
        <button key={r.key} className={`reaction ${r.me ? 'is-me' : ''}`} onClick={() => actions?.react(message, r.key, !r.me)} title={r.me ? 'Reaktion des Bots entfernen' : 'Mit dem Bot reagieren'}>
          {r.url ? <img src={r.url} alt={r.name} /> : <span>{r.name}</span>}
          <span className="reaction__count">{r.count}</span>
        </button>
      ))}
    </div>
  );
});

// F11: Embed-Karte mit Farbstreifen
export const Embeds = memo(function Embeds({ embeds }) {
  const nav = useContext(NavContext);
  if (!embeds?.length) return null;
  return embeds.map((e, i) => (
    <div key={i} className="embed" style={e.color ? { '--embed': e.color } : undefined}>
      {e.author?.name && <div className="embed__author">{e.author.name}</div>}
      {e.title &&
        (e.url ? (
          <a
            className="embed__title"
            href={e.url}
            onClick={(ev) => {
              ev.preventDefault();
              nav.openExternal(e.url);
            }}
          >
            {e.title}
          </a>
        ) : (
          <div className="embed__title">{e.title}</div>
        ))}
      {e.description && (
        <div className="embed__desc">
          <MessageContent content={e.description} />
        </div>
      )}
      {e.fields?.length > 0 && (
        <div className="embed__fields">
          {e.fields.map((f, j) => (
            <div key={j} className={`embed__field ${f.inline ? 'is-inline' : ''}`}>
              <b>{f.name}</b>
              <MessageContent content={f.value} />
            </div>
          ))}
        </div>
      )}
      {e.image && /^https:\/\/(cdn|media)\.discordapp\.(com|net)\//.test(e.image) && <img className="embed__image" src={e.image} alt="" loading="lazy" />}
      {e.footer && <div className="embed__footer">{e.footer}</div>}
    </div>
  ));
});

// F12: Hinweis "Thread mit N Nachrichten" → öffnet den Thread
export const ThreadChip = memo(function ThreadChip({ thread }) {
  const actions = useContext(MessageActionsContext);
  if (!thread) return null;
  return (
    <button className="thread-chip" onClick={() => actions?.openThread(thread.id)}>
      🧵 {thread.name}
      {Number.isFinite(thread.messageCount) && <span className="muted"> · {thread.messageCount} Nachrichten</span>}
    </button>
  );
});

// Aktionsleiste beim Drüberfahren (F7 Antworten, F8 Reagieren, F9 Bearbeiten/Löschen, F12 Thread, F13 Anheften)
export function MessageActionBar({ message, out }) {
  const actions = useContext(MessageActionsContext);
  const [picker, setPicker] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!picker) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setPicker(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [picker]);
  if (!actions || message.pending || message.failed) return null;
  const caps = actions.caps || {};
  return (
    <div className={`msg-actions ${out ? 'is-out' : ''}`} ref={ref}>
      {caps.canSend && (
        <button title="Antworten" aria-label="Antworten" onClick={() => actions.reply(message)}>
          ↩
        </button>
      )}
      <button title="Reagieren" aria-label="Reagieren" onClick={() => setPicker((v) => !v)}>
        😊
      </button>
      {caps.canThread && !message.thread && (
        <button title="Thread starten" aria-label="Thread starten" onClick={() => actions.startThread(message)}>
          🧵
        </button>
      )}
      {caps.canPin && (
        <button title={message.pinned ? 'Lösen' : 'Anheften'} aria-label={message.pinned ? 'Lösen' : 'Anheften'} onClick={() => actions.pin(message, !message.pinned)}>
          📌
        </button>
      )}
      {message.canEdit && (
        <button title="Bearbeiten" aria-label="Bearbeiten" onClick={() => actions.edit(message)}>
          ✏️
        </button>
      )}
      {message.canDelete && (
        <button title="Löschen" aria-label="Löschen" className="danger" onClick={() => actions.remove(message)}>
          🗑
        </button>
      )}
      {picker && (
        <div className="emoji-picker" role="listbox" aria-label="Emoji auswählen">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => {
                setPicker(false);
                actions.react(message, e, true);
              }}
            >
              {e}
            </button>
          ))}
          {(actions.emojis || []).slice(0, 24).map((e) => (
            <button
              key={e.key}
              title={`:${e.name}:`}
              onClick={() => {
                setPicker(false);
                actions.react(message, e.key, true);
              }}
            >
              {e.url ? <img src={e.url} alt={e.name} /> : e.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
