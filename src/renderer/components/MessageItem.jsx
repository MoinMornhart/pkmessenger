import { memo, useState } from 'react';
import { formatShortTime, formatFull, formatDayPill } from '../../shared/format';
import MessageContent from './MessageContent.jsx';
import { ReplyQuote, Reactions, Embeds, ThreadChip, MessageActionBar, PollCard } from './MessageExtras.jsx';
import { hueFor } from './ChatList.jsx';

function Avatar({ author }) {
  const [broken, setBroken] = useState(false);
  if (!author.avatarUrl || broken) {
    const hue = hueFor(author.id);
    return (
      <div className="avatar avatar--placeholder" style={{ background: `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 60% 30%))` }}>
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
    <div className="day-pill" role="separator">
      <span>{formatDayPill(timestamp)}</span>
    </div>
  );
});

// Häkchen: ✓ = bei Discord angekommen. (Lesebestätigungen gibt es bei Discord nicht.)
function Tick({ m }) {
  if (m.pending) return <span className="tick tick--pending" title="Wird gesendet …">🕓</span>;
  if (m.failed) return <span className="tick tick--failed" title="Nicht gesendet">!</span>;
  return (
    <span className="tick" title="Gesendet">
      ✓
    </span>
  );
}

function MessageItem({ message: m, grouped, highlighted, onRetry, onDiscard }) {
  const out = m.isOwn || m.pending || m.failed;
  const cls = ['msg', out ? 'msg--out' : 'msg--in', grouped && 'msg--grouped', m.pending && 'msg--pending', m.failed && 'msg--failed', highlighted && 'msg--highlight', m.mentions?.everyone && 'msg--mass']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} data-mid={m.id}>
      {!out && (grouped ? <span className="avatar-spacer" /> : <Avatar author={m.author} />)}
      <div className={`bubble ${grouped ? '' : 'bubble--tail'}`}>
        <MessageActionBar message={m} out={out} />
        <ReplyQuote reference={m.reference} />
        {!out && !grouped && (
          <div className="bubble__author" style={{ color: m.author.color || `hsl(${hueFor(m.author.id)} 70% 68%)` }}>
            {m.author.name}
            {m.author.bot && <span className="bot-tag">BOT</span>}
          </div>
        )}
        <MessageContent content={m.content} mentions={m.mentions} />
        <Attachments items={m.attachments} />
        <PollCard message={m} />
        <Embeds embeds={m.embeds} />
        <ThreadChip thread={m.thread} />
        <span className="bubble__meta" title={formatFull(m.createdTimestamp)}>
          {m.pinned && <span title="Angeheftet">📌 </span>}
          {m.editedTimestamp && <span title={`Bearbeitet: ${formatFull(m.editedTimestamp)}`}>bearbeitet · </span>}
          {formatShortTime(m.createdTimestamp)}
          {out && <Tick m={m} />}
        </span>
        <Reactions message={m} />
      </div>
      {m.failed && (
        <div className="msg__failed">
          <span>Nicht gesendet: {m.error?.message}</span>
          {m.error?.hint && <span className="muted small">Was kann ich tun? {m.error.hint}</span>}
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
  );
}

export default memo(MessageItem);
