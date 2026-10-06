import { memo, useContext } from 'react';
import { tokenizeMentions } from '../../shared/mentions';
import { NavContext } from '../state';

// Sicheres Mini-Markdown: erzeugt nur React-Elemente, NIEMALS innerHTML.
const CODE_BLOCK = /```(?:[a-zA-Z0-9_+-]*\n)?([\s\S]*?)```/g;
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\s][^*\n]*\*)|(\b_[^_\n]+_\b)|(https?:\/\/[^\s<>"']+[^\s<>"'.,:;!?)\]])/g;

function Link({ href }) {
  const nav = useContext(NavContext);
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        nav.openExternal(href);
      }}
      title={`${href} (öffnet im Browser)`}
    >
      {href}
    </a>
  );
}

function renderInline(text, keyBase) {
  const out = [];
  let last = 0;
  let m;
  INLINE.lastIndex = 0;
  let i = 0;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    const s = m[0];
    if (m[1]) out.push(<code key={k}>{s.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{s.slice(2, -2)}</strong>);
    else if (m[3]) out.push(<u key={k}>{s.slice(2, -2)}</u>);
    else if (m[4]) out.push(<s key={k}>{s.slice(2, -2)}</s>);
    else if (m[5] || m[6]) out.push(<em key={k}>{s.slice(1, -1)}</em>);
    else if (m[7]) out.push(<Link key={k} href={s} />);
    last = m.index + s.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderText(text, keyBase) {
  const out = [];
  let last = 0;
  let m;
  let i = 0;
  CODE_BLOCK.lastIndex = 0;
  while ((m = CODE_BLOCK.exec(text)) !== null) {
    if (m.index > last) out.push(...renderInline(text.slice(last, m.index), `${keyBase}-t${i}`));
    out.push(
      <pre key={`${keyBase}-c${i}`} className="codeblock">
        <code>{m[1]}</code>
      </pre>,
    );
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(...renderInline(text.slice(last), `${keyBase}-t${i}`));
  return out;
}

function MentionChip({ seg, mentions }) {
  const nav = useContext(NavContext);
  if (seg.type === 'user') {
    const u = mentions.users.find((x) => x.id === seg.id);
    return <span className="mention">@{u?.name || 'Unbekannt'}</span>;
  }
  if (seg.type === 'role') {
    const r = mentions.roles.find((x) => x.id === seg.id);
    const style = r?.color ? { '--chip': r.color } : undefined;
    return (
      <span className="mention mention--role" style={style}>
        @{r?.name || 'Rolle'}
      </span>
    );
  }
  if (seg.type === 'channel') {
    const name = mentions.channels.find((x) => x.id === seg.id)?.name || nav.channelName(seg.id);
    return (
      <button className="mention mention--channel" onClick={() => nav.openChannel(seg.id)} disabled={!nav.channelName(seg.id)}>
        #{name || 'unbekannter-kanal'}
      </button>
    );
  }
  return <span className="mention mention--everyone">@{seg.type}</span>;
}

const EMPTY_MENTIONS = { users: [], roles: [], channels: [] };

function MessageContent({ content, mentions = EMPTY_MENTIONS }) {
  const segs = tokenizeMentions(content);
  return (
    <div className="msg__content">
      {segs.map((seg, i) => (seg.type === 'text' ? renderText(seg.value, `s${i}`) : <MentionChip key={`m${i}`} seg={seg} mentions={mentions} />))}
    </div>
  );
}

export default memo(MessageContent);
