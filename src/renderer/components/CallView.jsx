import { memo } from 'react';
import { ChannelAvatar, hueFor } from './ChatList.jsx';

function Tile({ person, speaking, isBot }) {
  const hue = hueFor(person.id);
  return (
    <div className={`tile ${speaking ? 'is-speaking' : ''}`}>
      <div className="tile__avatar" style={{ background: person.avatarUrl ? undefined : `linear-gradient(135deg, hsl(${hue} 55% 45%), hsl(${(hue + 40) % 360} 60% 30%))` }}>
        {person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : person.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="tile__name">
        {person.name}
        {(person.bot || isBot) && <span className="bot-tag">BOT</span>}
      </div>
      <div className="tile__state">
        {person.deafened ? '🔈 Ton aus' : person.muted ? '🔇 stumm' : speaking ? 'spricht …' : ' '}
      </div>
    </div>
  );
}

function CallView({ channel, members, speaking, voice, bot, micLevel, onJoin, onLeave, onToggleMic, onToggleListen }) {
  const here = voice.state !== 'idle' && voice.state !== 'error' && voice.channelId === channel.id;
  const elsewhere = voice.state === 'connected' && voice.channelId !== channel.id;
  const others = members.filter((m) => !m.isMe);
  const count = members.length;

  return (
    <main className="chat call">
      <header className="chat__head">
        <ChannelAvatar channel={channel} size={40} />
        <div className="chat__title">
          <h1>{channel.name}</h1>
          <span className="chat__sub">
            Sprachkanal · {count === 0 ? 'niemand da' : count === 1 ? '1 Person' : `${count} Personen`}
            {here && voice.state === 'connected' && ' · verbunden (Ende-zu-Ende-verschlüsselt)'}
            {here && voice.state === 'connecting' && ' · verbinde …'}
            {here && voice.state === 'reconnecting' && ' · Verbindung wird wiederhergestellt …'}
          </span>
        </div>
      </header>

      <div className="call__stage">
        {count === 0 && !here && (
          <div className="call__empty">
            <div className="call__empty-icon">🔊</div>
            <p>Gerade ist niemand in {channel.name}.</p>
          </div>
        )}
        <div className="call__grid">
          {here && bot && <Tile person={{ id: bot.id, name: bot.displayName, avatarUrl: bot.avatarUrl, muted: !voice.talking, deafened: !voice.listening }} speaking={voice.talking && micLevel > 0.08} isBot />}
          {(here ? others : members).map((m) => (
            <Tile key={m.id} person={m} speaking={speaking.has(m.id)} />
          ))}
        </div>
        <p className="call__note">
          Du sprichst als <b>{bot?.displayName || 'Bot'}</b> <span className="bot-tag">BOT</span>. Zuhören ist <b>experimentell</b> (von Discord für Bots nicht offiziell
          dokumentiert). Es wird <b>nichts aufgezeichnet</b>.
        </p>
      </div>

      <footer className="call__bar">
        {!here ? (
          <>
            {elsewhere && <span className="muted small">Du bist gerade in 🔊 {voice.channelName}. Beitreten wechselt den Kanal.</span>}
            {!channel.canConnect ? (
              <span className="call__warn">🔒 Der Bot darf diesem Sprachkanal nicht beitreten. Was kann ich tun? Gib der Bot-Rolle hier „Verbinden“.</span>
            ) : (
              <button className="call-btn call-btn--join" onClick={() => onJoin(channel)} title="Beitreten">
                <span aria-hidden="true">📞</span> Beitreten
              </button>
            )}
          </>
        ) : (
          <>
            <button
              className={`call-btn ${voice.talking ? 'is-on' : ''}`}
              onClick={onToggleMic}
              disabled={!voice.canSpeak || voice.state !== 'connected'}
              title={voice.canSpeak ? (voice.talking ? 'Mikrofon ausschalten' : 'Mikrofon einschalten') : 'Der Bot darf hier nicht sprechen'}
              aria-pressed={voice.talking}
            >
              <span aria-hidden="true">{voice.talking ? '🎙️' : '🔇'}</span>
              {voice.talking ? 'Mikro an' : 'Mikro aus'}
              {voice.talking && (
                <span className="level" aria-hidden="true">
                  <i style={{ transform: `scaleX(${Math.max(0.04, micLevel)})` }} />
                </span>
              )}
            </button>
            <button className={`call-btn ${voice.listening ? 'is-on' : ''}`} onClick={onToggleListen} disabled={voice.state !== 'connected'} aria-pressed={voice.listening}>
              <span aria-hidden="true">{voice.listening ? '🔊' : '🔈'}</span>
              {voice.listening ? 'Ton an' : 'Ton aus'}
            </button>
            <button className="call-btn call-btn--hangup" onClick={onLeave} title="Auflegen">
              <span aria-hidden="true">📞</span> Auflegen
            </button>
          </>
        )}
      </footer>
    </main>
  );
}

export default memo(CallView);
