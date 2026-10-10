import { useEffect, useRef, useState } from 'react';
import { prefs } from '../prefs';
import { WALLPAPERS, ANIMATED, wallpaperFor } from '../../shared/wallpapers';
import { addWall, list as listWalls, loadWalls, removeWall, subscribeWalls } from '../wall-store';

// Chat-Hintergrund wählen (Issue #1): für diesen Chat, den ganzen Server oder überall (Standard)
export default function WallpaperDialog({ channelId, guildId, chatName, guildName, onClose }) {
  const map = prefs.get().wallpapers;
  const [scope, setScope] = useState(channelId ? 'chat' : guildId ? 'server' : 'default');
  const key = scope === 'chat' ? channelId : scope === 'server' ? guildId : 'default';
  const [pick, setPick] = useState(wallpaperFor(map, { channelId, guildId }));
  // #131: eigene Bilder (nur auf diesem Gerät)
  const [custom, setCustom] = useState(listWalls());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => {
    loadWalls();
    return subscribeWalls(setCustom);
  }, []);
  const upload = async (file) => {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const w = await addWall(file);
      setPick(w.id);
    } catch (err) {
      setError(err?.message || 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const drop = async (id) => {
    await removeWall(id);
    // überall, wo das Bild gewählt war, zurück auf die Vorlage
    const next = Object.fromEntries(Object.entries(prefs.get().wallpapers).filter(([, v]) => v !== id));
    prefs.set({ wallpapers: next });
    if (pick === id) setPick('punkte');
  };

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
              {ANIMATED.has(w.id) && <span className="wallpaper-tile__anim" title="Bewegt sich sanft (abschaltbar unter Einstellungen → Leistung)">✨</span>}
            </button>
          ))}
          {custom.map((w) => (
            <div key={w.id} className="wallpaper-tile__wrap">
              <button role="radio" aria-checked={pick === w.id} className={`wallpaper-tile ${pick === w.id ? 'is-on' : ''}`} onClick={() => setPick(w.id)} title={w.name}>
                <span className="wallpaper-tile__preview wallpaper-tile__img" style={{ backgroundImage: `url("${w.still}")` }} />
                {w.animated ? 'GIF ✨' : 'Eigenes'}
              </button>
              <button className="wallpaper-tile__del" onClick={() => drop(w.id)} aria-label={`Bild ${w.name} löschen`} title="Bild löschen">
                🗑
              </button>
            </div>
          ))}
          <button className="wallpaper-tile wallpaper-tile--add" disabled={busy} onClick={() => fileRef.current?.click()} title="PNG, JPG, WebP oder GIF (animiert) – bleibt nur auf diesem Gerät">
            <span className="wallpaper-tile__preview wallpaper-tile__plus">{busy ? '…' : '＋'}</span>
            Eigenes Bild
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
        {error && <p className="warn small" role="alert">{error}</p>}
        <p className="muted small">Eigene Bilder bleiben nur auf diesem Gerät. GIFs bewegen sich. ✨ = bewegt sich sanft – abschaltbar unter Einstellungen → Leistung.</p>
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
