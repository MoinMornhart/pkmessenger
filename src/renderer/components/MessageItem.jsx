import { memo, useState } from 'react';
import { formatMessageTime, formatShortTime, formatFull, formatDayDivider } from '../../shared/format';
import MessageContent from './MessageContent.jsx';

// Stabile Farbe pro Nutzer (aus der ID), damit Initialen-Avatare unterscheidbar sind.
function hueFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function Avatar({ author }) {
  const [broken, setBroken] = useState(false);
  if (!author.avatarUrl || broken) {
    const hue = hueFor(author.id);
    return (
      <div className="avatar avatar--placeholder" style={{ background: `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 60% 30%))`, color: '#fff' }}>
        {author.name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return <img className="avatar" src={author.avatarUrl} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function Attachments({ items }) {
  if (!items?.length) return null;
  return (
    <div className="attachments">
      {items.map((a) =>
        a.contentType?.startsWith('image/') && /^https:\/\/(cdn|media)\.discordapp\.(com|net)\//.test(a.url) ? (
          <img
            key={a.id}
            className="attachment-img"
            src={a.url}
            alt={a.name}
            loading="lazy"
            decoding="async"
            style={a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined}
          />
        ) : (
          <div key={a.id} className="attachment-file">
            📎 {a.name} <span className="muted small">({formatSize(a.size)})</span>
          </div>
        ),
      )}
    </div>
  );
}

export const DayDivider = memo(function DayDivider({ timestamp }) {
  return (
    <div className="day-divider" role="separator">
      <span>{formatDayDivider(timestamp)}</span>
    </div>
  );
});

function MessageItem({ message: m, grouped, highlighted, onRetry, onDiscard }) {
  const cls = ['msg', grouped && 'msg--grouped', m.pending && 'msg--pending', m.failed && 'msg--failed', highlighted && 'msg--highlight', m.mentions?.everyone && 'msg--mass']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} data-mid={m.id}>
      {grouped ? (
        <span className="msg__gutter-time" title={formatFull(m.createdTimestamp)}>
          {formatShortTime(m.createdTimestamp)}
        </span>
      ) : (
        <Avatar author={m.author} />
      )}
      <div className="msg__body">
        {!grouped && (
          <div className="msg__head">
            <span className="msg__author" style={m.author.color ? { color: m.author.color } : undefined}>
              {m.author.name}
            </span>
            {m.author.bot && <span className="bot-tag">BOT</span>}
            <time className="msg__time" title={formatFull(m.createdTimestamp)}>
              {formatMessageTime(m.createdTimestamp)}
            </time>
          </div>
        )}
        <MessageContent content={m.content} mentions={m.mentions} />
        <Attachments items={m.attachments} />
        {m.embedsCount > 0 && <div className="muted small">[{m.embedsCount} Embed{m.embedsCount > 1 ? 's' : ''} – Anzeige kommt mit F11]</div>}
        {m.editedTimestamp && (
          <span className="msg__edited" title={`Bearbeitet: ${formatFull(m.editedTimestamp)}`}>
            (bearbeitet)
          </span>
        )}
        {m.pending && <span className="msg__state">wird gesendet …</span>}
        {m.failed && (
          <div className="msg__failed">
            <span>Nicht gesendet: {m.error?.message}</span>
            {m.error?.hint && <span className="muted small"> Was kann ich tun? {m.error.hint}</span>}
            <span className="msg__failed-actions">
              <button className="btn btn--small" onClick={() => onRetry(m)}>
                Erneut senden
              </button>
              <button className="btn btn--small btn--ghost" onClick={() => onDiscard(m)}>
                Verwerfen
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MessageItem);
