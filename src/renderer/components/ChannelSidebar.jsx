import { memo, useState } from 'react';

function ChannelIcon({ channel }) {
  if (channel.type === 'announcement') return <span className="ch-icon" aria-hidden="true">📢</span>;
  return <span className="ch-icon" aria-hidden="true">#</span>;
}

function StatusFooter({ status }) {
  const bot = status.bot;
  const ready = status.state === 'ready';
  return (
    <div className="me">
      {bot?.avatarUrl ? <img className="avatar avatar--sm" src={bot.avatarUrl} alt="" /> : <div className="avatar avatar--sm avatar--placeholder" />}
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

function ChannelSidebar({ guild, groups, activeId, isUnread, onSelect, status, hasGuilds, onInvite }) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggle = (id) =>
    setCollapsed((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <aside className="sidebar">
      <header className="sidebar__head">
        <h2 title={guild?.name}>{guild?.name || (hasGuilds ? ' ' : 'Kein Server')}</h2>
        <span className="kbd-hint" title="Kanal-Schnellsuche">Strg K</span>
      </header>
      <div className="sidebar__list">
        {!hasGuilds && (
          <div className="empty empty--small">
            <p>Der Bot ist noch auf keinem Server.</p>
            <button className="btn btn--small" onClick={onInvite}>
              Bot einladen
            </button>
          </div>
        )}
        {hasGuilds && !groups && Array.from({ length: 7 }, (_, i) => <div key={i} className="ch-skeleton skeleton" style={{ width: `${55 + ((i * 17) % 35)}%` }} />)}
        {groups && groups.length === 0 && (
          <div className="empty empty--small">
            <p>Der Bot sieht hier keine Textkanäle.</p>
            <p className="muted small">Was kann ich tun? Gib der Bot-Rolle in den Kanaleinstellungen „Kanal ansehen“.</p>
          </div>
        )}
        {groups?.map((g) => {
          const key = g.category?.id || 'root';
          const isCollapsed = collapsed.has(key);
          return (
            <div key={key} className="ch-group">
              {g.category && (
                <button className="ch-category" onClick={() => toggle(key)} aria-expanded={!isCollapsed}>
                  <span className={`chev ${isCollapsed ? 'is-collapsed' : ''}`}>▾</span>
                  {g.category.name}
                </button>
              )}
              {g.channels
                .filter((c) => !isCollapsed || c.id === activeId || isUnread(c))
                .map((c) => {
                  const unread = isUnread(c);
                  return (
                    <button
                      key={c.id}
                      className={`ch ${c.id === activeId ? 'is-active' : ''} ${unread ? 'is-unread' : ''}`}
                      onClick={() => onSelect(c.id)}
                      title={c.topic || c.name}
                    >
                      <ChannelIcon channel={c} />
                      <span className="ch__name">{c.name}</span>
                      {!c.canSend && (
                        <span className="ch__badge" title="Bot darf hier nur lesen">
                          nur lesen
                        </span>
                      )}
                      {unread && <span className="ch__dot" aria-label="ungelesen" />}
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
      <StatusFooter status={status} />
    </aside>
  );
}

export default memo(ChannelSidebar);
