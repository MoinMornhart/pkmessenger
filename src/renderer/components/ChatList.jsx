import { memo, useMemo, useState } from 'react';
import { formatListTime } from '../../shared/format';
import { api } from '../api';

const UPDATE_TEXT = {
  idle: 'Updates: –',
  checking: 'Suche nach Updates …',
  downloading: 'Update wird geladen …',
  current: 'Aktuell ✓',
  ready: 'Update bereit',
  error: 'Update-Prüfung fehlgeschlagen',
  disabled: 'Auto-Update aus',
};

function VersionLine({ appInfo }) {
  const u = appInfo?.update || { state: 'idle' };
  const title = u.state === 'disabled' ? u.reason : u.state === 'error' ? `${u.error?.message} ${u.error?.hint || ''}` : '';
  return (
    <div className="version-line" title={title}>
      <span>PKMessenger {appInfo?.version ? `v${appInfo.version}` : ''}</span>
      <span>·</span>
      <span>{UPDATE_TEXT[u.state] || u.state}</span>
      {u.enabled && (u.state === 'current' || u.state === 'error' || u.state === 'idle') && (
        <button className="link-btn" onClick={() => api.checkForUpdates().catch(() => {})}>
          Jetzt prüfen
        </button>
      )}
    </div>
  );
}

// Stabile Farbe aus einer ID – für Kanal- und Personen-Avatare ohne Bild.
// (FNV-1a + Durchmischung, damit sich auch IDs mit nur einer anderen Endziffer deutlich unterscheiden)
export function hueFor(id) {
  let h = 0x811c9dc5;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) % 360;
}

export function ChannelAvatar({ channel, size = 46 }) {
  const hue = hueFor(channel.id);
  return (
    <div
      className="chat-avatar"
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${hue} 45% 40%), hsl(${(hue + 50) % 360} 55% 28%))` }}
      aria-hidden="true"
    >
      {channel.type === 'voice' ? '🔊' : channel.type === 'announcement' ? '📢' : '#'}
    </div>
  );
}

function BotFooter({ status }) {
  const bot = status.bot;
  const ready = status.state === 'ready';
  return (
    <div className="me">
      <div className="chat-avatar chat-avatar--me" aria-hidden="true">
        {(bot?.displayName || 'B').slice(0, 1).toUpperCase()}
      </div>
      <div className="me__text">
        <div className="me__name">
          {bot?.displayName || 'Bot'} <span className="bot-tag">BOT</span>
        </div>
        <div className={`me__status ${ready ? 'is-ok' : 'is-warn'}`}>
          <span className="dot" /> {ready ? 'Verbunden ✓' : status.state === 'reconnecting' ? 'Verbinde neu …' : 'Getrennt'}
        </div>
      </div>
    </div>
  );
}

// Mini-Anrufleiste (sichtbar, solange der Bot in einem Sprachkanal ist)
function CallBar({ voice, onOpen, onToggleMic, onLeave }) {
  if (voice.state === 'idle' || voice.state === 'error') return null;
  return (
    <div className="callbar">
      <button className="callbar__info" onClick={onOpen} title="Anruf öffnen">
        <span className={`callbar__dot ${voice.state === 'connected' ? 'is-ok' : ''}`} />
        <span>
          <b>{voice.state === 'connected' ? 'Im Sprachkanal' : 'Verbinde …'}</b>
          <span className="muted small"> 🔊 {voice.channelName}</span>
        </span>
      </button>
      <button className={`icon-btn ${voice.talking ? 'is-on' : ''}`} onClick={onToggleMic} disabled={!voice.canSpeak || voice.state !== 'connected'} title={voice.talking ? 'Mikrofon aus' : 'Mikrofon an'}>
        {voice.talking ? '🎙️' : '🔇'}
      </button>
      <button className="icon-btn icon-btn--danger" onClick={onLeave} title="Auflegen">
        📞
      </button>
    </div>
  );
}

function VoiceRows({ channels, members, speaking, activeId, voice, onSelect }) {
  if (!channels.length) return null;
  return (
    <>
      <div className="chatlist__section">Sprachkanäle</div>
      {channels.map((c) => {
        const people = members[c.id] || [];
        const live = voice.channelId === c.id && voice.state === 'connected';
        const talking = people.filter((p) => speaking.has(p.id)).map((p) => p.name);
        return (
          <button key={c.id} className={`chatrow ${c.id === activeId ? 'is-active' : ''}`} onClick={() => onSelect(c.id)} title={c.name}>
            <ChannelAvatar channel={c} />
            <div className="chatrow__main">
              <div className="chatrow__top">
                <span className="chatrow__name">{c.name}</span>
                {live && <span className="chatrow__live">LIVE</span>}
              </div>
              <div className="chatrow__bottom">
                <span className={`chatrow__preview ${talking.length ? 'is-talking' : ''}`}>
                  {talking.length ? `${talking.join(', ')} spricht …` : people.length ? people.map((p) => p.name).join(', ') : <span className="muted">Niemand da</span>}
                </span>
                {!c.canConnect && <span className="chatrow__lock" title="Der Bot darf hier nicht beitreten">🔒</span>}
                {people.length > 0 && <span className="badge badge--soft">{people.length}</span>}
              </div>
            </div>
          </button>
        );
      })}
    </>
  );
}

const OTHER_LABEL = { forum: ['🗂', 'Forum – Beiträge kommen mit Threads (F12)'], media: ['🖼', 'Medienkanal – kommt mit Threads (F12)'], stage: ['🎙', 'Stage-Kanal – noch nicht unterstützt'] };

// Erkannte, aber noch nicht bedienbare Kanäle: sichtbar statt "verschwunden" (Issue #1)
function OtherRows({ channels }) {
  if (!channels.length) return null;
  return (
    <>
      <div className="chatlist__section">Weitere Kanäle</div>
      {channels.map((c) => {
        const [icon, text] = OTHER_LABEL[c.type] || ['#', 'noch nicht unterstützt'];
        return (
          <div key={c.id} className="chatrow chatrow--disabled" title={text}>
            <div className="chat-avatar chat-avatar--muted" aria-hidden="true">
              {icon}
            </div>
            <div className="chatrow__main">
              <div className="chatrow__top">
                <span className="chatrow__name">{c.name}</span>
              </div>
              <div className="chatrow__bottom">
                <span className="chatrow__preview muted">{text}</span>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function ChatList({ guild, chats, previews, activeId, isUnread, unreadCounts, onSelect, status, hasGuilds, loading, onInvite, now, appInfo, voiceChannels = [], otherChannels = [], voiceMembers = {}, speaking, voice, onToggleMic, onLeaveVoice, onRefresh, refreshing, access, onShowAccess, onOpenSettings }) {
  const [filter, setFilter] = useState('');
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase().replace(/^#/, '');
    return q ? chats.filter((c) => c.name.toLowerCase().includes(q) || (previews[c.id]?.text || '').toLowerCase().includes(q)) : chats;
  }, [chats, filter, previews]);

  return (
    <aside className="chatlist">
      <header className="chatlist__head">
        <h2 title={guild?.name}>{guild?.name || (hasGuilds ? ' ' : 'PKMessenger')}</h2>
        <button className={`icon-btn ${refreshing ? 'is-spinning' : ''}`} onClick={onRefresh} disabled={refreshing} title="Aktualisieren: Kanäle und Rechte neu von Discord laden" aria-label="Aktualisieren">
          ⟳
        </button>
        <button className="icon-btn" onClick={onOpenSettings} title="Einstellungen" aria-label="Einstellungen">
          ⚙
        </button>
      </header>
      <div className="chatlist__search">
        <span className="chatlist__search-icon" aria-hidden="true">⌕</span>
        <input id="chat-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Chats durchsuchen" aria-label="Chats durchsuchen" />
      </div>
      <div className="chatlist__items">
        {!hasGuilds && (
          <div className="empty empty--small">
            <p>Der Bot ist noch auf keinem Server.</p>
            <button className="btn btn--small" onClick={onInvite}>
              Bot einladen
            </button>
          </div>
        )}
        {hasGuilds &&
          loading &&
          Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="chatrow chatrow--skeleton">
              <div className="chat-avatar skeleton" />
              <div className="chatrow__main">
                <div className="skeleton line" style={{ width: `${40 + ((i * 17) % 30)}%` }} />
                <div className="skeleton line" style={{ width: `${60 + ((i * 13) % 30)}%` }} />
              </div>
            </div>
          ))}
        {!loading && hasGuilds && chats.length === 0 && (
          <div className="empty empty--small">
            <p>Der Bot sieht hier keine Textkanäle.</p>
            <p className="muted small">Was kann ich tun? Gib der Bot-Rolle in den Kanaleinstellungen „Kanal ansehen“.</p>
          </div>
        )}
        {!loading && filter && visible.length === 0 && <div className="empty empty--small">Kein Chat gefunden.</div>}
        {visible.map((c) => {
          const p = previews[c.id];
          const unread = isUnread(c);
          const count = unreadCounts[c.id] || 0;
          return (
            <button key={c.id} className={`chatrow ${c.id === activeId ? 'is-active' : ''} ${unread ? 'is-unread' : ''}`} onClick={() => onSelect(c.id)} title={c.topic || c.name}>
              <ChannelAvatar channel={c} />
              <div className="chatrow__main">
                <div className="chatrow__top">
                  <span className="chatrow__name">{c.name}</span>
                  {p && <span className="chatrow__time">{formatListTime(p.timestamp, now)}</span>}
                </div>
                <div className="chatrow__bottom">
                  <span className="chatrow__preview">
                    {p ? (
                      <>
                        {p.isOwn ? <span className="tick" aria-label="gesendet">✓</span> : <span className="chatrow__author">{p.authorName}: </span>}
                        {p.text || '…'}
                      </>
                    ) : (
                      <span className="muted">{c.topic || (c.canSend ? 'Noch keine Nachrichten' : 'Nur lesen')}</span>
                    )}
                  </span>
                  {!c.canSend && <span className="chatrow__lock" title="Der Bot darf hier nur lesen">🔒</span>}
                  {unread && <span className="badge">{count > 0 ? (count > 99 ? '99+' : count) : ''}</span>}
                </div>
              </div>
            </button>
          );
        })}
        {!loading && !filter && access && (access.hidden?.length > 0 || access.readOnly?.length > 0) && (
          <button className="access-hint" onClick={onShowAccess}>
            🔒 {access.hidden?.length > 0 ? `${access.hidden.length} Kanäle für den Bot gesperrt` : `${access.readOnly.length} Kanäle nur lesbar`}
            <span className="muted small"> – warum & wie freigeben?</span>
          </button>
        )}
        {!loading && !filter && (
          <VoiceRows channels={voiceChannels} members={voiceMembers} speaking={speaking} activeId={activeId} voice={voice} onSelect={onSelect} />
        )}
        {!loading && !filter && <OtherRows channels={otherChannels} />}
      </div>
      <CallBar voice={voice} onOpen={() => onSelect(voice.channelId)} onToggleMic={onToggleMic} onLeave={onLeaveVoice} />
      <BotFooter status={status} />
      <VersionLine appInfo={appInfo} />
    </aside>
  );
}

export default memo(ChatList);
