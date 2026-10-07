import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { applyMentionTokens, findMentionQuery } from '../../shared/mentions';
import { MESSAGE_CONTENT_MAX, TYPING_THROTTLE_MS } from '../../shared/limits';
import ConfirmDialog from './ConfirmDialog.jsx';
import EmbedDialog from './EmbedDialog.jsx';
import PollDialog from './PollDialog.jsx';
import { UPLOAD_MAX_BYTES, FILES_PER_MESSAGE_MAX } from '../../shared/limits';

const fmtSize = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

/**
 * Eingabefeld: Enter = senden, Umschalt+Enter = neue Zeile.
 * "@" / "#" öffnet die Autovervollständigung. Im Feld stehen lesbare Namen (@Anna),
 * beim Senden werden sie in <@ID>-Tokens umgewandelt (shared/mentions.js).
 */
export default function Composer({ guild, channel, bot, allChannels, onSend, replyTo = null, onCancelReply = () => {}, editing = null, onCancelEdit = () => {}, onSaveEdit = () => {} }) {
  const [text, setText] = useState('');
  const [inserted, setInserted] = useState([]);
  const [suggest, setSuggest] = useState(null); // { query, start, trigger, items, sel }
  const [confirm, setConfirm] = useState(null);
  const [files, setFiles] = useState([]); // F10: { name, size, data: Uint8Array, preview: dataURL|null }
  const [fileError, setFileError] = useState(null);
  const [embeds, setEmbeds] = useState([]); // F11
  const [embedOpen, setEmbedOpen] = useState(false);
  const [poll, setPoll] = useState(null); // Umfrage
  const [pollOpen, setPollOpen] = useState(false);
  const [pingReply, setPingReply] = useState(false); // F7
  const fileInputRef = useRef(null);
  const taRef = useRef(null);
  const lastTypingRef = useRef(0);
  const searchSeq = useRef(0);

  const final = useMemo(() => applyMentionTokens(text, inserted), [text, inserted]);
  const length = final.content.length;
  const tooLong = length > MESSAGE_CONTENT_MAX;
  const empty = text.trim().length === 0 && (editing || (files.length === 0 && embeds.length === 0 && !poll));

  // Höhe automatisch anpassen
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    // +2 px für den Rahmen (box-sizing: border-box), sonst erscheint ein überflüssiger Scrollbalken
    const full = ta.scrollHeight + 2;
    ta.style.height = `${Math.min(full, 280)}px`;
    ta.style.overflowY = full > 280 ? 'auto' : 'hidden';
  }, [text]);

  useEffect(() => {
    taRef.current?.focus();
  }, [channel.id]);

  // F9: Bearbeiten – Text der eigenen Nachricht ins Feld übernehmen
  useEffect(() => {
    if (editing) {
      setText(editing.content || '');
      setInserted([]);
      requestAnimationFrame(() => taRef.current?.focus());
    }
  }, [editing]);

  useEffect(() => {
    if (replyTo) {
      setPingReply(false);
      taRef.current?.focus();
    }
  }, [replyTo]);

  // F10: Dateien hinzufügen (📎, Einfügen, Ziehen) – Grenzen wie bei Discord prüfen
  const addFiles = async (list) => {
    setFileError(null);
    const incoming = [...(list || [])].filter(Boolean);
    if (!incoming.length) return;
    if (files.length + incoming.length > FILES_PER_MESSAGE_MAX) return setFileError(`Höchstens ${FILES_PER_MESSAGE_MAX} Dateien pro Nachricht.`);
    const total = files.reduce((a, f) => a + f.size, 0) + incoming.reduce((a, f) => a + f.size, 0);
    if (total > UPLOAD_MAX_BYTES) return setFileError('Zusammen größer als 25 MiB – das ist das Discord-Limit pro Nachricht.');
    const read = await Promise.all(
      incoming.map(async (file) => {
        const data = new Uint8Array(await file.arrayBuffer());
        let preview = null;
        if (file.type?.startsWith('image/') && file.size < 4 * 1024 * 1024)
          preview = await new Promise((res) => {
            const r = new FileReader();
            r.onload = () => res(typeof r.result === 'string' ? r.result : null);
            r.onerror = () => res(null);
            r.readAsDataURL(file);
          });
        return { name: file.name || 'datei', size: file.size, data, preview };
      }),
    );
    setFiles((f) => [...f, ...read]);
  };

  const updateSuggestions = useCallback(
    async (value, caret) => {
      const q = findMentionQuery(value, caret);
      if (!q || guild.isDM) return setSuggest(null); // Privatchat: keine Rollen/Kanäle/Mitgliedersuche
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
    [allChannels, guild.id, guild.isDM],
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
    setFiles([]);
    setEmbeds([]);
    setPoll(null);
    setFileError(null);
  };

  const doSend = (everyone) => {
    setConfirm(null);
    const mentions = { users: final.users, roles: final.roles, everyone };
    if (editing) {
      onSaveEdit({ content: final.content, mentions });
    } else {
      onSend({ content: final.content, mentions, files: files.map(({ name, data }) => ({ name, data })), embeds, poll, replyTo: replyTo?.id || null, pingReply });
      onCancelReply();
    }
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
    if (e.key === 'Escape' && (editing || replyTo)) {
      e.preventDefault();
      if (editing) {
        reset();
        onCancelEdit();
      } else onCancelReply();
      return;
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
      {/* F7 Antworten / F9 Bearbeiten */}
      {replyTo && !editing && (
        <div className="composer__bar">
          <span>
            ↩ Antwort an <b>{replyTo.author?.name || 'Nachricht'}</b>
            <span className="muted"> – {(replyTo.content || '').slice(0, 80) || '…'}</span>
          </span>
          <label className="composer__ping" title="Der Verfasser bekommt eine Benachrichtigung">
            <input type="checkbox" checked={pingReply} onChange={(e) => setPingReply(e.target.checked)} /> @ pingen
          </label>
          <button className="icon-btn" onClick={onCancelReply} aria-label="Antwort abbrechen">
            ×
          </button>
        </div>
      )}
      {editing && (
        <div className="composer__bar composer__bar--edit">
          <span>✏️ Nachricht bearbeiten · Enter speichert, Esc bricht ab</span>
          <button
            className="icon-btn"
            onClick={() => {
              reset();
              onCancelEdit();
            }}
            aria-label="Bearbeiten abbrechen"
          >
            ×
          </button>
        </div>
      )}
      {/* F10 Dateien / F11 Embeds als Vorschau */}
      {(files.length > 0 || embeds.length > 0 || poll || fileError) && !editing && (
        <div className="composer__attachments">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="att">
              {f.preview ? <img src={f.preview} alt="" /> : <span className="att__icon">📄</span>}
              <span className="att__name" title={f.name}>
                {f.name}
              </span>
              <span className="muted small">{fmtSize(f.size)}</span>
              <button className="icon-btn" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} aria-label={`${f.name} entfernen`}>
                ×
              </button>
            </div>
          ))}
          {embeds.map((e, i) => (
            <div key={`embed-${i}`} className="att att--embed" style={e.color ? { '--embed': e.color } : undefined}>
              <span className="att__icon">▤</span>
              <span className="att__name">{e.title || e.description?.slice(0, 40) || 'Embed'}</span>
              <button className="icon-btn" onClick={() => setEmbeds((l) => l.filter((_, j) => j !== i))} aria-label="Embed entfernen">
                ×
              </button>
            </div>
          ))}
          {poll && (
            <div className="att att--embed">
              <span className="att__icon">📊</span>
              <span className="att__name">{poll.question}</span>
              <span className="muted small">{poll.answers.length} Antworten</span>
              <button className="icon-btn" onClick={() => setPoll(null)} aria-label="Umfrage entfernen">
                ×
              </button>
            </div>
          )}
          {fileError && <span className="warn small">{fileError}</span>}
        </div>
      )}
      <div
        className={`composer__box ${tooLong ? 'is-error' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!editing) addFiles(e.dataTransfer?.files);
        }}
      >
        {!editing && (
          <>
            <button className="tool-btn" onClick={() => fileInputRef.current?.click()} title="Datei anhängen (max. 25 MiB)" aria-label="Datei anhängen">
              📎
            </button>
            <button className="tool-btn" onClick={() => setEmbedOpen(true)} title="Embed erstellen" aria-label="Embed erstellen">
              ▤
            </button>
            {channel.canPoll !== false && (
              <button className="tool-btn" onClick={() => setPollOpen(true)} title="Umfrage erstellen" aria-label="Umfrage erstellen">
                📊
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </>
        )}
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            if (!editing && e.clipboardData?.files?.length) {
              e.preventDefault();
              addFiles(e.clipboardData.files);
            }
          }}
          onClick={(e) => updateSuggestions(text, e.currentTarget.selectionStart)}
          onBlur={() => setTimeout(() => setSuggest(null), 150)}
          placeholder={editing ? 'Nachricht bearbeiten' : `Nachricht an ${channel.type === 'dm' ? '' : '#'}${channel.name}`}
          aria-label={`Nachricht an ${channel.type === 'dm' ? '' : '#'}${channel.name}`}
          spellCheck
        />
        <button className="send-btn" onClick={submit} disabled={empty || tooLong} aria-label={editing ? 'Speichern' : 'Senden'} title={editing ? 'Speichern (Enter)' : 'Senden (Enter)'}>
          {editing ? '✓' : '➤'}
        </button>
      </div>
      {pollOpen && (
        <PollDialog
          onClose={() => setPollOpen(false)}
          onAdd={(p) => {
            setPoll(p);
            setPollOpen(false);
          }}
        />
      )}
      {embedOpen && (
        <EmbedDialog
          onClose={() => setEmbedOpen(false)}
          onAdd={(e) => {
            setEmbeds((l) => [...l, e].slice(0, 10));
            setEmbedOpen(false);
          }}
        />
      )}
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
