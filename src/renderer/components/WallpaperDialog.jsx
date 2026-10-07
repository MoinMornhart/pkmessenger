import { useEffect, useState } from 'react';
import { prefs } from '../prefs';
import { WALLPAPERS, wallpaperFor } from '../../shared/wallpapers';

// Chat-Hintergrund wählen (Issue #1): für diesen Chat, den ganzen Server oder überall (Standard)
export default function WallpaperDialog({ channelId, guildId, chatName, guildName, onClose }) {
  const map = prefs.get().wallpapers;
  const [scope, setScope] = useState(channelId ? 'chat' : guildId ? 'server' : 'default');
  const key = scope === 'chat' ? channelId : scope === 'server' ? guildId : 'default';
  const [pick, setPick] = useState(wallpaperFor(map, { channelId, guildId }));

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const apply = () => {
    prefs.set({ wallpapers: { ...prefs.get().wallpapers, [key]: pick } });
    onClose();
  };
  const reset = () => {
    const next = { ...prefs.get().wallpapers };
    delete next[key];
    prefs.set({ wallpapers: next });
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal wallpaper-dialog" role="dialog" aria-label="Chat-Hintergrund" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings__head">
          <h3>🖼 Chat-Hintergrund</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        <div className="wallpaper-grid" role="radiogroup" aria-label="Vorlage">
          {WALLPAPERS.map((w) => (
            <button key={w.id} role="radio" aria-checked={pick === w.id} className={`wallpaper-tile ${pick === w.id ? 'is-on' : ''}`} onClick={() => setPick(w.id)}>
              <span className="wallpaper-tile__preview chat" data-wall={w.id} />
              {w.label}
            </button>
          ))}
        </div>
        <label className="settings__label" htmlFor="wall-scope">
          Gilt für
        </label>
        <select id="wall-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
          {channelId && <option value="chat">nur diesen Chat{chatName ? ` (${chatName})` : ''}</option>}
          {guildId && <option value="server">den ganzen Server{guildName ? ` (${guildName})` : ''}</option>}
          <option value="default">alle Chats (Standard)</option>
        </select>
        <div className="confirm__actions">
          {map[key] && (
            <button className="btn btn--ghost" onClick={reset}>
              Zurücksetzen
            </button>
          )}
          <button className="btn btn--ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn--primary" onClick={apply}>
            Übernehmen
          </button>
        </div>
      </div>
    </div>
  );
}
