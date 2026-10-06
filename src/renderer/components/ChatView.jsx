import { useCallback, useEffect, useRef } from 'react';
import { api } from '../api';
import { messageStore, randomNonce, useChannelMessages } from '../state';
import MessageList from './MessageList.jsx';
import Composer from './Composer.jsx';
import SearchPanel from './SearchPanel.jsx';

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

function TypingIndicator({ names }) {
  if (!names.length) return <div className="typing" />;
  const text = names.length === 1 ? `${names[0]} schreibt …` : names.length === 2 ? `${names[0]} und ${names[1]} schreiben …` : 'Mehrere Leute schreiben …';
  return (
    <div className="typing" aria-live="polite">
      <span className="typing__dots">
        <i />
        <i />
        <i />
      </span>
      {text}
    </div>
  );
}

export default function ChatView({ guild, channel, bot, typingNames, onRead, toast, searchOpen, onCloseSearch, onOpenSearch, allChannels }) {
  const state = useChannelMessages(channel?.id);
  const listRef = useRef(null);

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
    async ({ content, mentions }) => {
      const nonce = randomNonce();
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
        attachments: [],
        embedsCount: 0,
      });
      listRef.current?.scrollToBottom();
      try {
        const msg = await api.sendMessage({ channelId: channel.id, content, mentions, nonce });
        messageStore.upsertConfirmed(msg);
      } catch (e) {
        messageStore.markFailed(channel.id, nonce, { message: e.message, hint: e.hint, code: e.code });
      }
    },
    [channel, bot],
  );

  const retry = useCallback(
    (m) => {
      messageStore.discardLocal(m.channelId, m.nonce);
      send({ content: m.content, mentions: m.sendMentions || { users: [], roles: [], everyone: false } });
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

  if (!guild || !channel) {
    return (
      <main className="chat chat--empty">
        <div className="empty">
          <h2>Kein Kanal ausgewählt</h2>
          <p className="muted">Wähle links einen Kanal – oder drücke Strg+K für die Schnellsuche.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="chat">
      <header className="chat__head">
        <span className="ch-icon ch-icon--lg">{channel.type === 'announcement' ? '📢' : '#'}</span>
        <h1>{channel.name}</h1>
        {channel.topic && <span className="chat__topic" title={channel.topic}>{channel.topic}</span>}
        <div className="chat__tools">
          <button className="btn btn--small btn--ghost" onClick={onOpenSearch} title="Suchen (Strg+F)">
            🔍 Suchen <span className="kbd-hint">Strg F</span>
          </button>
        </div>
      </header>
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
          <TypingIndicator names={typingNames} />
          <Composer guild={guild} channel={channel} bot={bot} allChannels={allChannels} onSend={send} />
        </div>
        {searchOpen && <SearchPanel messages={state.messages} onJump={jump} onClose={onCloseSearch} />}
      </div>
    </main>
  );
}
