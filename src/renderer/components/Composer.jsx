import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { applyMentionTokens, findMentionQuery } from '../../shared/mentions';
import { MESSAGE_CONTENT_MAX, TYPING_THROTTLE_MS } from '../../shared/limits';
import ConfirmDialog from './ConfirmDialog.jsx';

/**
 * Eingabefeld: Enter = senden, Umschalt+Enter = neue Zeile.
 * "@" / "#" öffnet die Autovervollständigung. Im Feld stehen lesbare Namen (@Anna),
 * beim Senden werden sie in <@ID>-Tokens umgewandelt (shared/mentions.js).
 */
export default function Composer({ guild, channel, bot, allChannels, onSend }) {
  const [text, setText] = useState('');
  const [inserted, setInserted] = useState([]);
  const [suggest, setSuggest] = useState(null); // { query, start, trigger, items, sel }
  const [confirm, setConfirm] = useState(null);
  const taRef = useRef(null);
  const lastTypingRef = useRef(0);
  const searchSeq = useRef(0);

  const final = useMemo(() => applyMentionTokens(text, inserted), [text, inserted]);
  const length = final.content.length;
  const tooLong = length > MESSAGE_CONTENT_MAX;
  const empty = text.trim().length === 0;

  // Höhe automatisch anpassen
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 280)}px`;
  }, [text]);

  useEffect(() => {
    taRef.current?.focus();
  }, [channel.id]);

  const updateSuggestions = useCallback(
    async (value, caret) => {
      const q = findMentionQuery(value, caret);
      if (!q) return setSuggest(null);
      const seq = ++searchSeq.current;
      if (q.trigger === '#') {
        const needle = q.query.toLowerCase();
        const items = allChannels
          .filter((c) => c.guildId === guild.id && c.name.toLowerCase().includes(needle))
          .slice(0, 8)
          .map((c) => ({ kind: 'channel', id: c.id, display: c.name }));
        return setSuggest(items.length ? { ...q, items, sel: 0 } : null);
      }
      // kleine Verzögerung, damit nicht jeder Tastendruck eine Anfrage auslöst
      await new Promise((r) => setTimeout(r, 120));
      if (seq !== searchSeq.current) return undefined;
      try {
        const items = await api.searchMentionables({ guildId: guild.id, query: q.query });
        if (seq === searchSeq.current) setSuggest(items.length ? { ...q, items, sel: 0 } : null);
      } catch {
        if (seq === searchSeq.current) setSuggest(null);
      }
      return undefined;
    },
    [allChannels, guild.id],
  );

  const onChange = (e) => {
    const value = e.target.value;
    setText(value);
    updateSuggestions(value, e.target.selectionStart);
    const now = Date.now();
    if (value.trim() && channel.canSend && now - lastTypingRef.current > TYPING_THROTTLE_MS) {
      lastTypingRef.current = now;
      api.sendTyping({ channelId: channel.id }).catch(() => {});
    }
  };

  const pick = (item) => {
    if (!suggest) return;
    const ta = taRef.current;
    const caret = ta.selectionStart;
    let display;
    if (item.kind === 'everyone' || item.kind === 'here') display = `@${item.kind}`;
    else if (item.kind === 'channel') display = `#${item.display}`;
    else display = `@${item.display}`;
    const next = `${text.slice(0, suggest.start)}${display} ${text.slice(caret)}`;
    setText(next);
    if (item.kind === 'user' || item.kind === 'role' || item.kind === 'channel') {
      setInserted((list) => [...list.filter((x) => x.display !== display), { display, kind: item.kind, id: item.id }]);
    }
    setSuggest(null);
    requestAnimationFrame(() => {
      const pos = suggest.start + display.length + 1;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const reset = () => {
    setText('');
    setInserted([]);
    setSuggest(null);
  };

  const doSend = (everyone) => {
    setConfirm(null);
    onSend({ content: final.content, mentions: { users: final.users, roles: final.roles, everyone } });
    reset();
  };

  const submit = () => {
    if (empty || tooLong || !channel.canSend) return;
    if (final.massMention) {
      if (!channel.canMentionEveryone) {
        setConfirm({
          title: '@everyone / @here wird NICHT pingen',
          body: 'Dem Bot fehlt in diesem Kanal das Recht „@everyone, @here und alle Rollen erwähnen“. Die Nachricht kann trotzdem gesendet werden – aber ohne Benachrichtigung.',
          actions: [
            { label: 'Ohne Ping senden', kind: 'primary', autoFocus: true, onClick: () => doSend(false) },
            { label: 'Abbrechen', kind: 'ghost', onClick: () => setConfirm(null) },
          ],
        });
      } else {
        setConfirm({
          title: 'Wirklich alle benachrichtigen?',
          body: '@everyone/@here pingt potenziell ALLE Mitglieder dieses Kanals. Bitte nur für wichtige Ankündigungen verwenden.',
          actions: [
            { label: 'Ja, alle pingen', kind: 'danger', onClick: () => doSend(true) },
            { label: 'Ohne Ping senden', kind: 'primary', autoFocus: true, onClick: () => doSend(false) },
            { label: 'Abbrechen', kind: 'ghost', onClick: () => setConfirm(null) },
          ],
        });
      }
      return;
    }
    doSend(false);
  };

  const onKeyDown = (e) => {
    if (suggest) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setSuggest((s) => ({ ...s, sel: (s.sel + d + s.items.length) % s.items.length }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(suggest.items[suggest.sel]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuggest(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  if (!channel.canSend) {
    return (
      <div className="composer composer--disabled">
        <span>🔒 Der Bot darf in #{channel.name} nicht schreiben.</span>
        <span className="muted small">Was kann ich tun? Gib der Bot-Rolle in den Kanaleinstellungen „Nachrichten senden“.</span>
      </div>
    );
  }

  return (
    <div className="composer">
      {suggest && (
        <div className="suggest" role="listbox">
          <div className="suggest__title">{suggest.trigger === '#' ? 'Kanäle' : 'Mitglieder & Rollen'}</div>
          {suggest.items.map((it, i) => (
            <button
              key={`${it.kind}-${it.id}`}
              role="option"
              aria-selected={i === suggest.sel}
              className={`suggest__item ${i === suggest.sel ? 'is-sel' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(it);
              }}
            >
              {it.kind === 'user' &&
                (it.avatarUrl ? <img className="avatar avatar--xs" src={it.avatarUrl} alt="" /> : <span className="avatar avatar--xs avatar--placeholder" />)}
              {it.kind === 'role' && <span className="role-dot" style={it.color ? { background: it.color } : undefined} />}
              {it.kind === 'channel' && <span className="ch-icon">#</span>}
              {(it.kind === 'everyone' || it.kind === 'here') && <span className="ch-icon">📣</span>}
              <span className="suggest__name">{it.kind === 'everyone' || it.kind === 'here' ? `@${it.display}` : it.display}</span>
              {it.sub && <span className="muted small">{it.sub}</span>}
              {it.bot && <span className="bot-tag">BOT</span>}
              {it.kind === 'role' && !it.pingable && <span className="muted small">(nicht pingbar)</span>}
              {(it.kind === 'everyone' || it.kind === 'here') && <span className="muted small">mit Bestätigung</span>}
            </button>
          ))}
        </div>
      )}
      <div className={`composer__box ${tooLong ? 'is-error' : ''}`}>
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onClick={(e) => updateSuggestions(text, e.currentTarget.selectionStart)}
          onBlur={() => setTimeout(() => setSuggest(null), 150)}
          placeholder={`Nachricht an #${channel.name}`}
          aria-label={`Nachricht an #${channel.name}`}
          spellCheck
        />
        <button className="send-btn" onClick={submit} disabled={empty || tooLong} aria-label="Senden" title="Senden (Enter)">
          ➤
        </button>
      </div>
      <div className="composer__meta">
        <span className="muted small">
          Wird gesendet als <b>{bot?.displayName || 'Bot'}</b> <span className="bot-tag">BOT</span> · Enter senden · Umschalt+Enter neue Zeile · @ erwähnen
        </span>
        <span className={`counter ${tooLong ? 'is-error' : length > MESSAGE_CONTENT_MAX * 0.9 ? 'is-warn' : ''}`}>
          {length.toLocaleString('de-DE')} / {MESSAGE_CONTENT_MAX.toLocaleString('de-DE')}
        </span>
      </div>
      {confirm && (
        <ConfirmDialog title={confirm.title} actions={confirm.actions} onClose={() => setConfirm(null)}>
          <p>{confirm.body}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
