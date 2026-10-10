import { memo, useContext, useEffect, useRef, useState } from 'react';
import { MessageActionsContext, NavContext, QUICK_REACTIONS } from '../state';
import MessageContent from './MessageContent.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import MediaGate from './MediaGate.jsx';
import { embedMedia } from '../../shared/media';
import { checkLink } from '../../shared/link-safety';
import { prefs } from '../prefs';
import { getLists } from '../linkLists';

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
// GIFs (Tenor/Giphy kommen als „gifv“-Video), Videos und Bilder – nur über Discords Proxy, hinter MediaGate (Issue #1)
function EmbedMedia({ e }) {
  const m = embedMedia(e);
  if (!m) return null;
  return (
    <MediaGate kind={m.kind} name={e.title || e.provider || ''}>
      {m.kind === 'image' ? (
        <img className="embed__image" src={m.src} alt="" loading="lazy" />
      ) : m.kind === 'gifv' ? (
        <video className="embed__image" src={m.src} poster={m.poster || undefined} autoPlay loop muted playsInline />
      ) : (
        <video className="embed__image" src={m.src} poster={m.poster || undefined} controls preload="metadata" playsInline />
      )}
    </MediaGate>
  );
}

export const Embeds = memo(function Embeds({ embeds, mentions }) {
  const nav = useContext(NavContext);
  if (!embeds?.length) return null;
  return embeds.map((e, i) => {
    if (e.url) {
      const check = checkLink(e.url, prefs.get().trustedDomains, getLists());
      if (check.level === 'danger') {
        return (
          <div key={i} className="embed">
            <span className="link-danger">⛔ Embed blockiert (gefährlicher Link)</span>
          </div>
        );
      }
    }
    return (
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
          <MessageContent content={e.description} mentions={mentions} />
        </div>
      )}
      {e.fields?.length > 0 && (
        <div className="embed__fields">
          {e.fields.map((f, j) => (
            <div key={j} className={`embed__field ${f.inline ? 'is-inline' : ''}`}>
              <b>{f.name}</b>
              <MessageContent content={f.value} mentions={mentions} />
            </div>
          ))}
        </div>
      )}
      <EmbedMedia e={e} />
      {e.footer && <div className="embed__footer">{e.footer}</div>}
    </div>
    );
  });
});

// Umfrage: Ergebnisse als Balken, Restzeit, eigene Umfrage beenden
function timeLeft(ts) {
  const ms = ts - Date.now();
  if (ms <= 0) return 'beendet';
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `endet in ${Math.round(h / 24)} Tag${Math.round(h / 24) === 1 ? '' : 'en'}`;
  if (h >= 1) return `endet in ${h} Std.`;
  return `endet in ${Math.max(1, Math.round(ms / 60000))} Min.`;
}

export const PollCard = memo(function PollCard({ message }) {
  const actions = useContext(MessageActionsContext);
  const p = message.poll;
  if (!p) return null;
  const ended = p.finalized || (p.expiresTimestamp && p.expiresTimestamp <= Date.now());
  const max = Math.max(1, ...p.answers.map((a) => a.count));
  return (
    <div className="poll">
      <div className="poll__q">📊 {p.question}</div>
      {p.answers.map((a) => {
        const pct = p.total ? Math.round((a.count / p.total) * 100) : 0;
        return (
          <div key={a.id} className={`poll__a ${ended && a.count === max && p.total ? 'is-win' : ''}`}>
            <div className="poll__bar" style={{ width: `${pct}%` }} />
            <span className="poll__text">
              {a.emoji ? `${a.emoji} ` : ''}
              {a.text}
            </span>
            <span className="poll__pct">
              {pct} % · {a.count}
            </span>
          </div>
        );
      })}
      <div className="poll__foot">
        <span>
          {p.total} Stimme{p.total === 1 ? '' : 'n'} · {ended ? (p.finalized ? 'beendet ✓' : 'beendet') : p.expiresTimestamp ? timeLeft(p.expiresTimestamp) : 'läuft'}
          {p.allowMultiselect ? ' · Mehrfachwahl' : ''}
        </span>
        {message.canEdit && !ended && actions?.endPoll && (
          <button className="btn btn--small btn--ghost" onClick={() => actions.endPoll(message)}>
            Jetzt beenden
          </button>
        )}
      </div>
      <div className="poll__note muted small" style={{ marginTop: '8px' }}>
        💡 Discord verbietet Bots die Teilnahme an Umfragen.
      </div>
    </div>
  );
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
  const [more, setMore] = useState(false);
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
          <button title="Mehr Smileys" aria-label="Mehr Smileys" onClick={() => (setPicker(false), setMore(true))}>
            ➕
          </button>
        </div>
      )}
      {more && (
        <EmojiPicker
          className="emoji-panel--reactions"
          customEmojis={actions.emojis || []}
          onClose={() => setMore(false)}
          onPick={(key) => {
            setMore(false);
            actions.react(message, key, true);
          }}
        />
      )}
    </div>
  );
}
