import { memo, useContext, useState } from 'react';
import { tokenizeMentions } from '../../shared/mentions';
import { NavContext } from '../state';

// Sicheres Mini-Markdown: erzeugt nur React-Elemente, NIEMALS innerHTML.
const CODE_BLOCK = /```(?:[a-zA-Z0-9_+-]*\n)?([\s\S]*?)```/g;
// 1 Escape (\* \_ …) · 2 `code` · 3 **fett** · 4 __unterstrichen__ · 5 ~~durch~~ · 6/7 kursiv · 8 Link · 9 ||Spoiler||
const INLINE =
  /(\\[\\*_~`|>])|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\s][^*\n]*\*)|(\b_[^_\n]+_\b)|(https?:\/\/[^\s<>"']+[^\s<>"'.,:;!?)\]])|(\|\|[^|\n]+\|\|)/g;

// Spoiler: verdeckt, Klick deckt auf (wie in Discord)
function Spoiler({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`spoiler ${open ? 'is-open' : ''}`} role="button" tabIndex={0} title={open ? '' : 'Spoiler – zum Aufdecken klicken'} onClick={() => setOpen(true)} onKeyDown={(e) => e.key === 'Enter' && setOpen(true)}>
      {children}
    </span>
  );
}

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
  // Eigene Regex pro Aufruf: renderInline ruft sich für **fett** usw. selbst auf – eine geteilte globale Regex
  // würde dabei lastIndex zurücksetzen und eine Endlosschleife auslösen (error.md #21).
  const re = new RegExp(INLINE.source, 'g');
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    const s = m[0];
    if (m[1]) out.push(s.slice(1)); // \_ → _
    else if (m[2]) out.push(<code key={k}>{s.slice(1, -1)}</code>);
    else if (m[3]) out.push(<strong key={k}>{renderInline(s.slice(2, -2), k)}</strong>);
    else if (m[4]) out.push(<u key={k}>{renderInline(s.slice(2, -2), k)}</u>);
    else if (m[5]) out.push(<s key={k}>{renderInline(s.slice(2, -2), k)}</s>);
    else if (m[6] || m[7]) out.push(<em key={k}>{s.slice(1, -1)}</em>);
    else if (m[8]) out.push(<Link key={k} href={s} />);
    else if (m[9]) out.push(<Spoiler key={k}>{renderInline(s.slice(2, -2), k)}</Spoiler>);
    last = m.index + s.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Zitate: Zeilen, die mit „> “ beginnen, als Zitatblock
function renderLines(text, keyBase, atLineStart) {
  if (!text.includes('> ')) return renderInline(text, keyBase);
  const out = [];
  text.split('\n').forEach((line, i, all) => {
    const nl = i < all.length - 1 ? '\n' : '';
    if ((i > 0 || atLineStart) && line.startsWith('> ')) {
      out.push(
        <span key={`${keyBase}-q${i}`} className="mdquote">
          {renderInline(line.slice(2), `${keyBase}-q${i}`)}
        </span>,
      );
      if (nl) out.push(nl);
    } else out.push(...renderInline(line + nl, `${keyBase}-l${i}`));
  });
  return out;
}

function renderText(text, keyBase, atLineStart = false) {
  const out = [];
  let last = 0;
  let m;
  let i = 0;
  CODE_BLOCK.lastIndex = 0;
  while ((m = CODE_BLOCK.exec(text)) !== null) {
    if (m.index > last) out.push(...renderLines(text.slice(last, m.index), `${keyBase}-t${i}`, last === 0 ? atLineStart : text[last - 1] === '\n'));
    out.push(
      <pre key={`${keyBase}-c${i}`} className="codeblock">
        <code>{m[1]}</code>
      </pre>,
    );
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(...renderLines(text.slice(last), `${keyBase}-t${i}`, last === 0 ? atLineStart : text[last - 1] === '\n'));
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
      {segs.map((seg, i) =>
        // Zeilenanfang? (für Zitate „> “): erster Abschnitt oder vorheriger Abschnitt endet mit Zeilenumbruch
        seg.type === 'text' ? renderText(seg.value, `s${i}`, i === 0 || (segs[i - 1].type === 'text' && segs[i - 1].value.endsWith('\n'))) : <MentionChip key={`m${i}`} seg={seg} mentions={mentions} />,
      )}
    </div>
  );
}

export default memo(MessageContent);
