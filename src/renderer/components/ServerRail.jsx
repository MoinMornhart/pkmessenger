import { memo } from 'react';
import Logo from './Logo.jsx';

function ServerRail({ guilds, activeId, unreadGuilds, onSelect, onInvite }) {
  return (
    <nav className="rail" aria-label="Server">
      <div className="rail__logo" title="PKMessenger">
        <Logo size={40} />
      </div>
      <div className="rail__sep" />
      <div className="rail__list">
        {guilds === null &&
          Array.from({ length: 3 }, (_, i) => <div key={i} className="rail__item skeleton" />)}
        {guilds?.map((g) => (
          <button
            key={g.id}
            className={`rail__item ${g.id === activeId ? 'is-active' : ''} ${unreadGuilds.has(g.id) ? 'is-unread' : ''}`}
            title={g.name}
            aria-label={g.name}
            onClick={() => onSelect(g.id)}
          >
            <span className="rail__pill" />
            {g.iconUrl ? <img src={g.iconUrl} alt="" loading="lazy" /> : <span className="rail__acronym">{g.acronym}</span>}
          </button>
        ))}
      </div>
      <button className="rail__item rail__add" title="Bot auf einen Server einladen" aria-label="Bot einladen" onClick={onInvite}>
        +
      </button>
    </nav>
  );
}

export default memo(ServerRail);
