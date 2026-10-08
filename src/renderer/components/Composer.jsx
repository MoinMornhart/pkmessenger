import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { applyFormat, FORMAT_BUTTONS } from '../../shared/format-text';
import { parseCommand, suggestCommands, unknownCommand } from '../../shared/quick-commands';
import { fuzzyFilter } from '../../shared/fuzzy';
import { api } from '../api';
import { prefs } from '../prefs';
import { applyMentionTokens, findMentionQuery } from '../../shared/mentions';
import { MESSAGE_CONTENT_MAX, TYPING_THROTTLE_MS } from '../../shared/limits';
import ConfirmDialog from './ConfirmDialog.jsx';
import EmbedDialog from './EmbedDialog.jsx';
import PollDialog from './PollDialog.jsx';
import EmojiPicker from './EmojiPicker.jsx';
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
  // „@ Erwähnen“ aus einem Profil (Issue #1): Namen ans Ende setzen, als echte Erwähnung merken
  useEffect(() => {
    const onInsert = (e) => {
      const { id, name } = e.detail || {};
      if (!id || !name) return;
      const display = `@${name}`;
      setText((t) => `${t && !t.endsWith(' ') ? `${t} ` : t}${display} `);
      setInserted((list) => [...list.filter((x) => x.display !== display), { display, kind: 'user', id }]);
      requestAnimationFrame(() => taRef.current?.focus());
    };
    window.addEventListener('pk:insert-mention', onInsert);
    return () => window.removeEventListener('pk:insert-mention', onInsert);
  }, []);
  // Entwurf, der beim Start des Bearbeitens im Feld stand (Issue #1: ging beim Abbrechen verloren)
  const draftRef = useRef(null);
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
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Text markiert? → Formatierungs-Leiste (Issue #1)
  const [hasSelection, setHasSelection] = useState(false);
  const checkSelection = (ta) => setHasSelection(Boolean(ta) && ta.selectionEnd > ta.selectionStart);
  // Markieren per Maus, Tastatur oder Doppelklick zuverlässig erkennen
  useEffect(() => {
    const onSel = () => document.activeElement === taRef.current && checkSelection(taRef.current);
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);
  const format = (kind) => {
    const ta = taRef.current;
    if (!ta) return;
    const r = applyFormat(text, ta.selectionStart, ta.selectionEnd, kind);
    setText(r.text);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(r.start, r.end);
      checkSelection(ta);
    });
  };
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
  const textRef = useRef(text);
  textRef.current = text;
  const insertedRef = useRef(inserted);
  insertedRef.current = inserted;
  useEffect(() => {
    if (editing) {
      if (!draftRef.current) draftRef.current = { text: textRef.current, inserted: insertedRef.current };
      setText(editing.content || '');
      setInserted([]);
      requestAnimationFrame(() => taRef.current?.focus());
    } else if (draftRef.current) {
      // Bearbeiten beendet (gespeichert oder abgebrochen) → eigenen Entwurf zurückholen
      const d = draftRef.current;
      draftRef.current = null;
      setText(d.text);
      setInserted(d.inserted);
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
      const cmds = editing ? null : suggestCommands(value, caret);
      if (cmds) return setSuggest(cmds.length ? { trigger: '/', query: '', start: 0, items: cmds, sel: 0 } : null);
      const q = findMentionQuery(value, caret);
      if (!q || (guild.isDM && q.trigger !== '@')) return setSuggest(null); // Privatchat: keine Rollen/Kanäle
      const seq = ++searchSeq.current;
      if (q.trigger === '#') {
        const items = fuzzyFilter(
          allChannels.filter((c) => c.guildId === guild.id),
          q.query,
          (c) => [c.name],
          8,
        ).map((c) => ({ kind: 'channel', id: c.id, display: c.name }));
        return setSuggest(items.length ? { ...q, items, sel: 0 } : null);
      }
      // kleine Verzögerung, damit nicht jeder Tastendruck eine Anfrage auslöst
      await new Promise((r) => setTimeout(r, 120));
      if (seq !== searchSeq.current) return undefined;
      try {
        // Privatchat (JoniMoni #56): nur wer WIRKLICH im Chat ist – die Gesprächspartnerin/der Gesprächspartner.
        // Andere zu erwähnen ergibt hier keinen Sinn (sie sehen den Privatchat nicht und bekommen keinen Ping).
        if (guild.isDM) {
          const partner = channel.userId ? [{ kind: 'user', id: channel.userId, display: channel.name, sub: 'in diesem Privatchat', avatarUrl: channel.avatarUrl || null, status: channel.status || null }] : [];
          const items = q.query ? fuzzyFilter(partner, q.query, (p) => [p.display]) : partner;
          if (seq === searchSeq.current) setSuggest(items.length ? { ...q, items, sel: 0 } : null);
          return undefined;
        }
        let items = await api.searchMentionables({ guildId: guild.id, query: q.query });
        // Einstellung „Namensvorschläge: alle Server“ → auch Personen von den anderen Servern des Bots
        if (prefs.get().mentionScope === 'alle' && q.query) {
          const others = [...new Set(allChannels.map((c) => c.guildId))].filter((g) => g && g !== guild.id && g !== '@dm').slice(0, 4);
          const seen = new Set(items.filter((i) => i.kind === 'user').map((i) => i.id));
          for (const g of others) {
            const more = await api.searchMentionables({ guildId: g, query: q.query }).catch(() => []);
            for (const it of more) if (it.kind === 'user' && !seen.has(it.id)) seen.add(it.id), items.push({ ...it, sub: `${it.sub ? `${it.sub} · ` : ''}anderer Server` });
          }
          items = items.slice(0, 12);
        }
        if (seq === searchSeq.current) setSuggest(items.length ? { ...q, items, sel: 0 } : null);
      } catch {
        if (seq === searchSeq.current) setSuggest(null);
      }
      return undefined;
    },
    [allChannels, guild.id, guild.isDM, editing, channel.userId, channel.name, channel.avatarUrl, channel.status],
  );

  const lastSuggest = useRef(null);
  useEffect(() => {
    if (suggest?.trigger === '@') lastSuggest.current = suggest;
  }, [suggest]);
  const onChange = (e) => {
    let value = e.target.value;
    // „@anna “ getippt statt aus der Liste gewählt → bei genau passendem Namen trotzdem echte Erwähnung (Issue #35)
    const caretNow = e.target.selectionStart;
    const typed = /(^|\s)@([^\s@]{2,32}) $/.exec(value.slice(0, caretNow));
    if (typed && lastSuggest.current) {
      const hit = lastSuggest.current.items.filter((it) => (it.kind === 'user' || it.kind === 'role') && it.display.toLowerCase() === typed[2].toLowerCase());
      if (hit.length === 1) {
        const display = `@${hit[0].display}`;
        const start = caretNow - typed[2].length - 2;
        value = `${value.slice(0, start)}${display} ${value.slice(caretNow)}`;
        setInserted((list) => [...list.filter((x) => x.display !== display), { display, kind: hit[0].kind, id: hit[0].id }]);
        lastSuggest.current = null;
      }
    }
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
    if (item.kind === 'command') {
      // Befehle ohne Zusatztext (/münze, /würfel, /umfrage …) sofort ausführen statt zweimal Enter (Issue #29)
      if (item.instant) {
        setSuggest(null);
        submit(item.display);
        return;
      }
      const next = `${item.display} `;
      setText(next);
      setSuggest(null);
      requestAnimationFrame(() => {
        taRef.current?.focus();
        taRef.current?.setSelectionRange(next.length, next.length);
      });
      return;
    }
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

  const submit = (commandText) => {
    if (!commandText && (empty || tooLong || !channel.canSend)) return;
    if (commandText && !channel.canSend) return;
    // Schnellbefehle (/shrug, /me, /umfrage …) – laufen in der App, gesendet wird nur das Ergebnis
    const cmd = editing ? null : parseCommand(commandText ?? text);
    if (cmd) {
      const r = cmd.command.run(cmd.args);
      if (r.error) return setFileError(r.error);
      if (r.action === 'poll' || r.action === 'embed') {
        setText('');
        (r.action === 'poll' ? setPollOpen : setEmbedOpen)(true);
        return;
      }
      if (r.action === 'help') {
        setText('/');
        setSuggest({ trigger: '/', query: '', start: 0, items: suggestCommands('/', 1), sel: 0 });
        taRef.current?.focus();
        return;
      }
      const out = applyMentionTokens(r.content, inserted);
      onSend({ content: out.content, mentions: { users: out.users, roles: out.roles, everyone: false }, files: [], embeds: [], poll: null, replyTo: replyTo?.id || null, pingReply });
      onCancelReply();
      reset();
      return;
    }
    // „/ping“ & Co.: kein Befehl dieser App → nicht still als Text senden, sondern nachfragen (Issue #29)
    const unknown = editing || files.length || embeds.length || poll ? null : unknownCommand(text);
    if (unknown && !commandText) {
      setConfirm({
        title: `„/${unknown}“ ist kein Befehl von PKMessenger`,
        body: 'Slash-Befehle von Discord oder anderen Bots kann ein Bot nicht auslösen – das erlaubt Discord nicht. Tippe nur „/“, um die Befehle dieser App zu sehen. Oder den Text ganz normal senden?',
        actions: [
          {
            label: 'Befehle zeigen',
            kind: 'primary',
            autoFocus: true,
            onClick: () => {
              setConfirm(null);
              setText('/');
              setSuggest({ trigger: '/', query: '', start: 0, items: suggestCommands('/', 1), sel: 0 });
              taRef.current?.focus();
            },
          },
          { label: 'Als Text senden', kind: 'ghost', onClick: () => sendChecked() },
          { label: 'Abbrechen', kind: 'ghost', onClick: () => setConfirm(null) },
        ],
      });
      return;
    }
    sendChecked();
  };

  const sendChecked = () => {
    setConfirm(null);
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
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      format({ b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()]);
      return;
    }
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
          <div className="suggest__title">{suggest.trigger === '/' ? 'Befehle' : suggest.trigger === '#' ? 'Kanäle' : 'Mitglieder & Rollen'}</div>
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
              {it.kind === 'command' && <span className="ch-icon">/</span>}
              {(it.kind === 'everyone' || it.kind === 'here') && <span className="ch-icon">📣</span>}
              {it.status && <span className={`presence presence--${it.status}`} title={it.status}><span className="presence__dot" /></span>}
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
            <button className="tool-btn" onClick={() => setEmojiOpen((v) => !v)} title="Smileys" aria-label="Smileys">
              😀
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
        {hasSelection && (
          <div className="format-bar" role="toolbar" aria-label="Text formatieren">
            {FORMAT_BUTTONS.map((b) => (
              <button key={b.kind} className={`format-bar__btn format-bar__btn--${b.kind}`} title={b.title} aria-label={b.title} onMouseDown={(e) => e.preventDefault()} onClick={() => format(b.kind)}>
                <span className="format-bar__icon">{b.label}</span>
                <span className="format-bar__name">{b.name}</span>
              </button>
            ))}
          </div>
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
          onSelect={(e) => checkSelection(e.currentTarget)}
          onMouseUp={(e) => checkSelection(e.currentTarget)}
          onKeyUp={(e) => checkSelection(e.currentTarget)}
          onBlur={() => setTimeout(() => {
            setSuggest(null);
            setHasSelection(false);
          }, 150)}
          placeholder={editing ? 'Nachricht bearbeiten' : `Nachricht an ${channel.type === 'dm' ? '' : '#'}${channel.name}`}
          aria-label={`Nachricht an ${channel.type === 'dm' ? '' : '#'}${channel.name}`}
          spellCheck
        />
        <button className="send-btn" onClick={submit} disabled={empty || tooLong} aria-label={editing ? 'Speichern' : 'Senden'} title={editing ? 'Speichern (Enter)' : 'Senden (Enter)'}>
          {editing ? '✓' : '➤'}
        </button>
      </div>
      {emojiOpen && (
        <EmojiPicker
          className="emoji-panel--composer"
          onClose={() => setEmojiOpen(false)}
          onPick={(e) => {
            const ta = taRef.current;
            const start = ta ? ta.selectionStart : text.length;
            const end = ta ? ta.selectionEnd : text.length;
            const next = text.slice(0, start) + e + text.slice(end);
            setText(next);
            requestAnimationFrame(() => {
              ta?.focus();
              ta?.setSelectionRange(start + e.length, start + e.length);
            });
          }}
        />
      )}
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
