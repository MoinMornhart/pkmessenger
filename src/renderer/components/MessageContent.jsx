import { memo, useContext, useState, createContext } from 'react';
import { tokenizeMentions } from '../../shared/mentions';
import { splitSpoilerParts } from '../../shared/spoiler';
import { NavContext } from '../state';
import { createPortal } from 'react-dom';
import { prefs } from '../prefs';
import { checkLink } from '../../shared/link-safety';
import { getLists } from '../linkLists';

// Sicheres Mini-Markdown: erzeugt nur React-Elemente, NIEMALS innerHTML.
const CODE_BLOCK = /```(?:[a-zA-Z0-9_+-]*\n)?([\s\S]*?)```/g;
// 1 Escape (\* \_ …) · 2 `code` · 3 **fett** · 4 __unterstrichen__ · 5 ~~durch~~ · 6/7 kursiv · 8 Link · 9 ||Spoiler||
const INLINE =
  /(\\[\\*_~`|>])|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\s][^*\n]*\*)|(\b_[^_\n]+_\b)|(https?:\/\/[^\s<>"']+[^\s<>"'.,:;!?)\]])|(\|\|(?:(?!\|\|)[\s\S])+?\|\|)/g;

// Spoiler: verdeckt, Klick deckt auf (wie in Discord)
// Fremde Spoiler: erst fragen („Wirklich aufdecken?“ mit „Nicht mehr fragen“, Issue #35); eigene sofort
function Spoiler({ children }) {
  const own = useContext(OwnMessageContext);
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState(false);
  const [skip, setSkip] = useState(false);
  const reveal = () => (own || !prefs.get().spoilerAsk ? setOpen(true) : setAsk(true));
  return (
    <>
      <span
        className={`spoiler ${open ? 'is-open' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={open ? undefined : 'Spoiler – zum Aufdecken klicken'}
        title={open ? '' : 'Spoiler – zum Aufdecken klicken'}
        onClick={() => !open && reveal()}
        onKeyDown={(e) => e.key === 'Enter' && !open && reveal()}
      >
        {children}
      </span>
      {ask && (
        createPortal(
        <div className="modal-backdrop" onMouseDown={() => setAsk(false)}>
          <div className="modal confirm spoiler-ask" role="dialog" aria-label="Spoiler aufdecken?" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Spoiler aufdecken?</h3>
            <p>Hier hat jemand etwas absichtlich verdeckt, z. B. das Ende eines Films oder eine Lösung.</p>
            <label className="composer__ping">
              <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Nicht mehr fragen
            </label>
            <div className="confirm__actions">
              <button className="btn btn--ghost" onClick={() => setAsk(false)}>
                Lieber nicht
              </button>
              <button
                className="btn btn--primary"
                autoFocus
                onClick={() => {
                  if (skip) prefs.set({ spoilerAsk: false });
                  setAsk(false);
                  setOpen(true);
                }}
              >
                👁 Aufdecken
              </button>
            </div>
          </div>
        </div>,
        document.body,
        )
      )}
    </>
  );
}

/** Eigene Nachricht? Dann Spoiler ohne Rückfrage aufdecken. */
export const OwnMessageContext = createContext(false);

// Link-Schutz (Issue #38): gefährliche Links (IP-Grabber, Betrug) sind weder klickbar noch kopierbar
function Link({ href }) {
  const nav = useContext(NavContext);
  const check = checkLink(href, prefs.get().trustedDomains, getLists());
  if (check.level === 'danger')
    return (
      <span className="link-danger" title={check.reasons.join(' ')} onCopy={(e) => e.preventDefault()} onContextMenu={(e) => e.stopPropagation()}>
        ⛔ gefährlicher Link ({check.host || 'unbekannt'})
      </span>
    );
  const badge = check.level === 'warn' ? '⚠️ ' : check.level === 'unknown' ? '❔ ' : '';
  return (
    <a
      href={href}
      className={`link link--${check.level}`}
      onClick={(e) => {
        e.preventDefault();
        nav.openExternal(href);
      }}
      title={`${href}${check.reasons.length ? ` – ${check.reasons.join(' ')}` : ''} (öffnet im Browser)`}
    >
      {badge}
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

// Erwähnungen + Text eines Abschnitts rendern (Zeilenanfang für Zitate „> “ wird vom Aufrufer gesetzt).
function renderSegments(text, mentions, keyBase, atLineStart) {
  const segs = tokenizeMentions(text);
  return segs.map((seg, i) =>
    seg.type === 'text'
      ? renderText(seg.value, `${keyBase}-${i}`, i === 0 ? atLineStart : segs[i - 1].type === 'text' && segs[i - 1].value.endsWith('\n'))
      : <MentionChip key={`${keyBase}-m${i}`} seg={seg} mentions={mentions} />,
  );
}

function MessageContent({ content, mentions = EMPTY_MENTIONS }) {
  // #93: Spoiler, die eine Erwähnung umschließen (||<@123>||), zuerst auf oberster Ebene erkennen – sonst würde
  // tokenizeMentions die Erwähnung vorher heraustrennen und das ||…|| zerbrechen (dann erscheint roher Pipe-Text).
  const parts = splitSpoilerParts(content);
  const atStart = (idx) => idx === 0 || content[idx - 1] === '\n';
  return (
    <div className="msg__content">
      {parts.map((p, pi) =>
        p.spoiler ? (
          <Spoiler key={`sp${pi}`}>{renderSegments(p.text, mentions, `sp${pi}`, false)}</Spoiler>
        ) : (
          <span key={`p${pi}`}>{renderSegments(p.text, mentions, `p${pi}`, atStart(p.start))}</span>
        ),
      )}
    </div>
  );
}

export default memo(MessageContent);
