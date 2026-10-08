import { pc } from '../platform';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { messageStore, randomNonce, useChannelMessages, MessageActionsContext } from '../state';
import ConfirmDialog from './ConfirmDialog.jsx';
import ContextMenu from './ContextMenu.jsx';
import ModerationDialog from './ModerationDialog.jsx';
import { prefs } from '../prefs';
import { wallpaperFor } from '../../shared/wallpapers';
import { PinsPanel, ThreadsPanel, NameDialog } from './SidePanels.jsx';
import MessageList from './MessageList.jsx';
import Composer from './Composer.jsx';
import SearchPanel from './SearchPanel.jsx';
import { ChannelAvatar } from './ChatList.jsx';
import { typingText } from '../../shared/typing';
import { STATUS_TEXT } from './ProfileCard.jsx';

function Skeleton() {
  return (
    <div className="msglist msglist--skeleton" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="msg-skeleton">
          <div className="avatar skeleton" />
          <div className="msg-skeleton__lines">
            <div className="skeleton line" style={{ width: `${18 + ((i * 7) % 15)}%` }} />
            <div className="skeleton line" style={{ width: `${40 + ((i * 23) % 50)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Untertitel im Chat-Kopf: "Anna schreibt …" (wie im Messenger) oder das Kanalthema.
function HeaderSubtitle({ names, channel, guild, status }) {
  if (names.length) {
    const text = typingText(names);
    return (
      <span className="chat__sub chat__sub--typing" aria-live="polite">
        <span className="typing__dots">
          <i />
          <i />
          <i />
        </span>
        {text}
      </span>
    );
  }
  if (guild.isDM && status)
    return (
      <span className={`chat__sub presence presence--${status}`}>
        <span className="presence__dot" /> {STATUS_TEXT[status] || status}
      </span>
    );
  return (
    <span className="chat__sub" title={channel.topic || ''}>
      {channel.topic || (guild.isDM ? `Privatchat mit ${channel.name}${channel.isBot ? ' (Bot)' : ''}` : `${guild.name} · ${channel.canSend ? 'Bot darf schreiben' : 'Bot darf nur lesen'}`)}
    </span>
  );
}

export default function ChatView({ guild, channel, bot, typingNames, onRead, toast, searchOpen, onCloseSearch, onOpenSearch, allChannels, onOpenThread, onBack, parentName, presenceStatus = null, backLabel = null }) {
  const state = useChannelMessages(channel?.id);
  const listRef = useRef(null);
  const [replyTo, setReplyTo] = useState(null); // F7
  const [editing, setEditing] = useState(null); // F9
  const [confirmDelete, setConfirmDelete] = useState(null); // F9
  const [ctxMenu, setCtxMenu] = useState(null); // Rechtsklick-Menü { x, y, items }
  const [walls, setWalls] = useState(() => prefs.get().wallpapers);
  useEffect(() => prefs.subscribe((p) => setWalls(p.wallpapers)), []);
  const [modTarget, setModTarget] = useState(null); // Person verwalten { guildId, userId }
  const [threadFrom, setThreadFrom] = useState(null); // F12: Thread aus Nachricht starten
  const [panel, setPanel] = useState(null); // 'pins' | 'threads'
  const [emojis, setEmojis] = useState([]); // F8 Server-Emojis

  useEffect(() => {
    if (guild?.id && !guild.isDM) api.listEmojis({ guildId: guild.id }).then(setEmojis).catch(() => setEmojis([]));
  }, [guild?.id]);

  useEffect(() => {
    if (searchOpen) setPanel(null);
  }, [searchOpen]);

  useEffect(() => {
    if (channel) messageStore.loadInitial(channel.id);
  }, [channel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Neueste bestätigte Nachricht als gelesen markieren (solange das Fenster sichtbar ist).
  const newestId = [...state.messages].reverse().find((m) => !m.pending && !m.failed)?.id;
  useEffect(() => {
    if (!channel || !newestId) return undefined;
    const mark = () => !document.hidden && onRead(channel.id, newestId);
    const t = setTimeout(mark, 400);
    document.addEventListener('visibilitychange', mark);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', mark);
    };
  }, [channel, newestId, onRead]);

  const send = useCallback(
    async ({ content, mentions, files = [], embeds = [], poll = null, replyTo: replyId = null, pingReply = false }) => {
      const nonce = randomNonce();
      const replied = replyId ? state.messages.find((x) => x.id === replyId) : null;
      // Optimistisch: sofort anzeigen, Discord-Bestätigung ersetzt den Platzhalter (über die Nonce).
      messageStore.addPending(channel.id, {
        id: `pending-${nonce}`,
        nonce,
        channelId: channel.id,
        content,
        sendMentions: mentions,
        createdTimestamp: Date.now(),
        author: { id: bot?.id || 'bot', name: bot?.displayName || 'Bot', avatarUrl: bot?.avatarUrl, bot: true, color: null },
        mentions: { users: [], roles: [], channels: [], everyone: false },
        attachments: files.map((f, i) => ({ id: `p${i}`, name: f.name, size: f.data.byteLength, url: '', contentType: null })),
        embedsCount: embeds.length,
        embeds: [],
        reactions: [],
        reference: replyId ? { messageId: replyId, authorName: replied?.author?.name ?? null, text: (replied?.content || '').slice(0, 100) } : null,
        poll: poll ? { question: poll.question, answers: poll.answers.map((text, i) => ({ id: i + 1, text, count: 0 })), total: 0, allowMultiselect: poll.allowMultiselect, expiresTimestamp: Date.now() + poll.durationHours * 3600000, finalized: false } : null,
        sendArgs: { files, embeds, poll, replyTo: replyId, pingReply },
      });
      listRef.current?.scrollToBottom();
      try {
        const msg = await api.sendMessage({ channelId: channel.id, content, mentions, nonce, files, embeds, ...(poll ? { poll } : {}), replyTo: replyId || undefined, pingReply });
        messageStore.upsertConfirmed(msg);
      } catch (e) {
        messageStore.markFailed(channel.id, nonce, { message: e.message, hint: e.hint, code: e.code });
      }
    },
    [channel, bot, state.messages],
  );

  const retry = useCallback(
    (m) => {
      messageStore.discardLocal(m.channelId, m.nonce);
      send({ content: m.content, mentions: m.sendMentions || { users: [], roles: [], everyone: false }, ...(m.sendArgs || {}) });
    },
    [send],
  );
  const discard = useCallback((m) => messageStore.discardLocal(m.channelId, m.nonce), []);
  const loadOlder = useCallback(() => channel && messageStore.loadOlder(channel.id), [channel]);

  const jump = useCallback(
    (id) => {
      if (!listRef.current?.jumpTo(id)) toast({ kind: 'warn', title: 'Nachricht ist nicht mehr geladen.' });
    },
    [toast],
  );

  const fail = useCallback((e) => toast({ kind: 'error', title: e.message, text: e.hint }), [toast]);

  // Aktionen an Nachrichten (F7–F13), per Context an jede Sprechblase
  const actions = useMemo(
    () => ({
      caps: {
        canSend: Boolean(channel?.canSend),
        canThread: Boolean(channel?.canCreateThreads) && channel?.type !== 'thread',
        canPin: Boolean(channel?.canPin),
      },
      emojis,
      jump,
      reply: (m) => {
        setEditing(null);
        setReplyTo(m);
      },
      react: (m, emoji, add) =>
        api
          .react({ channelId: m.channelId, messageId: m.id, emoji, add })
          .then((msg) => messageStore.upsertConfirmed(msg))
          .catch(fail),
      edit: (m) => {
        setReplyTo(null);
        setEditing(m);
      },
      remove: (m) => setConfirmDelete(m),
      pin: (m, pin) =>
        api
          .setPinned({ channelId: m.channelId, messageId: m.id, pin })
          .then((msg) => {
            messageStore.upsertConfirmed(msg);
            toast({ kind: 'info', title: pin ? 'Angeheftet 📌' : 'Gelöst', duration: 2000 });
          })
          .catch(fail),
      startThread: (m) => setThreadFrom(m),
      endPoll: (m) =>
        api
          .endPoll({ channelId: m.channelId, messageId: m.id })
          .then((msg) => {
            messageStore.upsertConfirmed(msg);
            toast({ kind: 'info', title: 'Umfrage beendet', duration: 2000 });
          })
          .catch(fail),
      openThread: (id) => onOpenThread?.(id),
      // Rechtsklick auf eine Nachricht (Issue #1): alle Aktionen an einem Ort + Person verwalten
      contextMenu: (e, m) => {
        e.preventDefault();
        if (m.pending || m.failed) return;
        const a = actionsRef.current;
        const caps = a.caps;
        const guildPart = guild?.isDM ? '@me' : guild?.id;
        const items = [
          caps.canSend && { icon: '↩', label: 'Antworten', onClick: () => a.reply(m) },
          { icon: '👍', label: 'Daumen hoch', onClick: () => a.react(m, '👍', true) },
          { icon: '❤️', label: 'Herz', onClick: () => a.react(m, '❤️', true) },
          m.content && { icon: '📋', label: 'Text kopieren', onClick: () => api.copyText({ text: m.content.slice(0, 4000) }).then(() => toast({ kind: 'info', title: 'Text kopiert', duration: 1500 })) },
          guildPart && { icon: '🔗', label: 'Link zur Nachricht kopieren', onClick: () => api.copyText({ text: `https://discord.com/channels/${guildPart}/${m.channelId}/${m.id}` }).then(() => toast({ kind: 'info', title: 'Link kopiert', duration: 1500 })) },
          caps.canThread && !m.thread && { icon: '🧵', label: 'Thread starten', onClick: () => a.startThread(m) },
          caps.canPin && { icon: '📌', label: m.pinned ? 'Lösen' : 'Anheften', onClick: () => a.pin(m, !m.pinned) },
          m.canEdit && { icon: '✏️', label: 'Bearbeiten', onClick: () => a.edit(m) },
          m.canDelete && { icon: '🗑', label: 'Löschen', danger: true, onClick: () => a.remove(m) },
          guild && !guild.isDM && !m.isOwn && !m.system && { separator: true },
          guild && !guild.isDM && !m.isOwn && !m.system && { icon: '👤', label: `${m.author.name} verwalten …`, onClick: () => setModTarget({ guildId: guild.id, userId: m.author.id }) },
        ].filter(Boolean);
        setCtxMenu({ x: e.clientX, y: e.clientY, items });
      },
    }),
    [channel, emojis, jump, fail, toast, onOpenThread, guild],
  );

  // Für das Rechtsklick-Menü: aktuelle Aktionen (das Menü wird innerhalb von „actions“ gebaut)
  const actionsRef = useRef(null);
  actionsRef.current = actions;

  const saveEdit = useCallback(
    async ({ content, mentions }) => {
      const m = editing;
      setEditing(null);
      if (!m) return;
      try {
        messageStore.upsertConfirmed(await api.editMessage({ channelId: m.channelId, messageId: m.id, content, mentions }));
      } catch (e) {
        fail(e);
      }
    },
    [editing, fail],
  );

  if (!guild || !channel) {
    return (
      <main className="chat chat--empty">
        <div className="empty">
          <h2>Kein Kanal ausgewählt</h2>
          <p className="muted">{pc('Wähle links einen Kanal – oder drücke Strg+K für die Schnellsuche.', 'Wähle in der Liste einen Chat.')}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="chat" data-wall={wallpaperFor(walls, { channelId: channel.id, guildId: channel.guildId || guild?.id })}>
      <header className="chat__head">
        {onBack && (
          <button className="icon-btn icon-btn--lg" onClick={onBack} title={backLabel || `Zurück zu #${parentName || 'Kanal'}`} aria-label="Zurück">
            ←
          </button>
        )}
        <ChannelAvatar channel={channel} size={40} />
        <div className="chat__title">
          <h1>{channel.type === 'thread' ? `🧵 ${channel.name}` : channel.name}</h1>
          {channel.type === 'thread' ? (
            <span className="chat__sub">Thread in #{parentName || '…'}</span>
          ) : (
            <HeaderSubtitle names={typingNames} channel={channel} guild={guild} status={presenceStatus} />
          )}
        </div>
        <div className="chat__tools">
          {channel.type !== 'thread' && channel.type !== 'dm' && (
            <button className={`icon-btn icon-btn--lg ${panel === 'threads' ? 'is-on' : ''}`} onClick={() => setPanel((p) => (p === 'threads' ? null : 'threads'))} title="Threads" aria-label="Threads">
              🧵
            </button>
          )}
          <button className={`icon-btn icon-btn--lg ${panel === 'pins' ? 'is-on' : ''}`} onClick={() => setPanel((p) => (p === 'pins' ? null : 'pins'))} title="Angeheftete Nachrichten" aria-label="Angeheftete Nachrichten">
            📌
          </button>
          <button className="icon-btn icon-btn--lg" onClick={onOpenSearch} title={pc('Suchen (Strg+F)', 'Suchen')} aria-label="Suchen">
            ⌕
          </button>
        </div>
      </header>
      <MessageActionsContext.Provider value={actions}>
      <div className="chat__main">
        <div className="chat__col">
          {state.status === 'error' ? (
            <div className="empty">
              <h2>Nachrichten konnten nicht geladen werden</h2>
              <div className="callout callout--error">{state.error?.message}</div>
              {state.error?.hint && (
                <div className="callout">
                  <span className="callout__label">Was kann ich tun?</span>
                  <p>{state.error.hint}</p>
                </div>
              )}
              <button
                className="btn btn--primary"
                onClick={() => {
                  messageStore.invalidate(channel.id);
                  messageStore.loadInitial(channel.id);
                }}
              >
                Erneut versuchen
              </button>
            </div>
          ) : state.status !== 'ready' ? (
            <Skeleton />
          ) : state.messages.length === 0 ? (
            <div className="msglist">
              <div className="channel-start">
                <div className="channel-start__icon">#</div>
                <h3>Noch keine Nachrichten in #{channel.name}</h3>
                <p className="muted">Schreib die erste – sie erscheint als Bot-Nachricht.</p>
              </div>
            </div>
          ) : (
            <MessageList ref={listRef} channel={channel} state={state} onLoadOlder={loadOlder} onRetry={retry} onDiscard={discard} />
          )}
          <Composer
            guild={guild}
            channel={channel}
            bot={bot}
            allChannels={allChannels}
            onSend={send}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            editing={editing}
            onCancelEdit={() => setEditing(null)}
            onSaveEdit={saveEdit}
          />
        </div>
        {searchOpen && <SearchPanel messages={state.messages} guild={guild} channelId={channel.id} onJump={jump} onClose={onCloseSearch} toast={toast} />}
        {!searchOpen && panel === 'pins' && <PinsPanel channel={channel} onJump={jump} onClose={() => setPanel(null)} toast={toast} />}
        {!searchOpen && panel === 'threads' && <ThreadsPanel channel={channel} onOpen={(id) => onOpenThread?.(id)} onClose={() => setPanel(null)} toast={toast} />}
      </div>
      </MessageActionsContext.Provider>
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />}
      {modTarget && <ModerationDialog guildId={modTarget.guildId} userId={modTarget.userId} onClose={() => setModTarget(null)} toast={toast} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Nachricht löschen?"
          onClose={() => setConfirmDelete(null)}
          actions={[
            {
              label: 'Löschen',
              kind: 'danger',
              onClick: () => {
                const m = confirmDelete;
                setConfirmDelete(null);
                api
                  .deleteMessage({ channelId: m.channelId, messageId: m.id })
                  .then((r) => messageStore.remove(r))
                  .catch(fail);
              },
            },
            { label: 'Abbrechen', kind: 'ghost', autoFocus: true, onClick: () => setConfirmDelete(null) },
          ]}
        >
          <p>„{(confirmDelete.content || '').slice(0, 120) || 'Nachricht'}“ wird für alle gelöscht. Das lässt sich nicht rückgängig machen.</p>
        </ConfirmDialog>
      )}
      {threadFrom && (
        <NameDialog
          title="Thread starten"
          label="Name des Threads"
          initial={(threadFrom.content || 'Thread').replace(/\s+/g, ' ').slice(0, 60)}
          confirmLabel="Thread erstellen"
          onClose={() => setThreadFrom(null)}
          onConfirm={async (name) => {
            const m = threadFrom;
            setThreadFrom(null);
            try {
              const t = await api.createThread({ channelId: m.channelId, name, messageId: m.id });
              onOpenThread?.(t.id);
            } catch (e) {
              fail(e);
            }
          }}
        />
      )}
    </main>
  );
}
