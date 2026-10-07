import { useEffect, useState } from 'react';
import { api } from '../api';
import ModerationDialog from './ModerationDialog.jsx';
import { hueFor } from './ChatList.jsx';

// Profil einer Person (Issue #1: „Profile aufrufen“). Öffnet sich per Klick auf Name/Bild einer Nachricht
// oder überall mit window.dispatchEvent(new CustomEvent('pk:open-profile', { detail: { userId, guildId } })).
export function openProfile(userId, guildId) {
  window.dispatchEvent(new CustomEvent('pk:open-profile', { detail: { userId, guildId: guildId || null } }));
}

export const STATUS_TEXT = { online: 'Online', idle: 'Abwesend', dnd: 'Bitte nicht stören', offline: 'Offline' };

const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }) : '–');

export default function ProfileCard({ userId, guildId, onClose, onOpenDM, toast }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [mod, setMod] = useState(false);

  useEffect(() => {
    let off = false;
    api
      .userProfile({ userId, guildId: guildId || undefined })
      .then((r) => !off && setP(r))
      .catch((e) => !off && setErr(e.message));
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      off = true;
      window.removeEventListener('keydown', onKey);
    };
  }, [userId, guildId, onClose]);

  const hue = hueFor(userId);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal profile-card" role="dialog" aria-label="Profil" onMouseDown={(e) => e.stopPropagation()}>
        <div className="profile-card__banner" style={{ background: p?.bannerColor || `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 60% 30%))` }} />
        <button className="icon-btn profile-card__close" onClick={onClose} aria-label="Schließen">
          ×
        </button>
        {err && <p className="warn">{err}</p>}
        {!p && !err && <p className="muted">Lade …</p>}
        {p && (
          <>
            <div className="profile-card__head">
              {p.avatarUrl ? <img className="profile-card__avatar" src={p.avatarUrl} alt="" /> : <div className="profile-card__avatar profile-card__avatar--ph">{p.name.slice(0, 1).toUpperCase()}</div>}
              <div>
                <div className="profile-card__name">
                  {p.name} {p.bot && <span className="bot-tag">BOT</span>}
                </div>
                <div className="muted small">@{p.username}</div>
                {p.status && (
                  <div className={`presence presence--${p.status}`}>
                    <span className="presence__dot" /> {STATUS_TEXT[p.status] || p.status}
                    {p.activity ? ` · ${p.activity}` : ''}
                  </div>
                )}
              </div>
            </div>
            <dl className="profile-card__facts">
              <dt>Discord seit</dt>
              <dd>{fmtDate(p.createdAt)}</dd>
              {p.guildName && (
                <>
                  <dt>Auf „{p.guildName}“ seit</dt>
                  <dd>{fmtDate(p.joinedAt)}</dd>
                </>
              )}
              {p.mutualGuilds.length > 0 && (
                <>
                  <dt>Gemeinsame Server mit dem Bot</dt>
                  <dd>{p.mutualGuilds.join(', ')}</dd>
                </>
              )}
            </dl>
            {p.roles.length > 0 && (
              <div className="profile-card__roles" aria-label="Rollen">
                {p.roles.map((r) => (
                  <span key={r.id} className="role-chip" style={r.color ? { '--role': r.color } : undefined}>
                    {r.name}
                  </span>
                ))}
              </div>
            )}
            <div className="profile-card__actions">
              {!p.isSelf && !p.bot && (
                <button className="btn btn--primary btn--small" onClick={() => onOpenDM(p.id)}>
                  💬 Privat schreiben
                </button>
              )}
              {!p.isSelf && (
                <button
                  className="btn btn--small"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('pk:insert-mention', { detail: { id: p.id, name: p.name } }));
                    onClose();
                  }}
                >
                  @ Erwähnen
                </button>
              )}
              <button className="btn btn--ghost btn--small" onClick={() => api.copyText({ text: p.id }).then(() => toast?.({ kind: 'info', title: 'ID kopiert', duration: 1500 }))}>
                🆔 ID kopieren
              </button>
              {guildId && !p.isSelf && (
                <button className="btn btn--ghost btn--small" onClick={() => setMod(true)}>
                  🛡 Verwalten …
                </button>
              )}
            </div>
          </>
        )}
        {mod && <ModerationDialog guildId={guildId} userId={userId} onClose={() => setMod(false)} toast={toast} />}
      </div>
    </div>
  );
}
