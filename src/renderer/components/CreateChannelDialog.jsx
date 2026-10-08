import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

// Neue Gruppe (Issue #1): legt einen Text- oder Sprachkanal auf dem Server an. Privat = nur der Bot und die
// ausgewählten Personen sehen ihn. Braucht das Bot-Recht „Kanäle verwalten“.
export default function CreateChannelDialog({ guild, categories = [], onClose, onCreated, toast }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('text');
  const [parentId, setParentId] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [picked, setPicked] = useState([]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState([]);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef(null);
  const allowed = Boolean(guild?.canCreateChannels);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Personen nur von diesem Server (gleiche Suche wie „Neuer Privatchat“)
  useEffect(() => {
    if (!isPrivate) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api.searchPeople({ query: query.trim().slice(0, 32) });
        if (!cancelled) setFound(res.filter((u) => !u.bot && u.guilds?.includes(guild?.name)));
      } catch {
        if (!cancelled) setFound([]);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isPrivate, query, guild?.name]);

  const toggle = (u) => setPicked((p) => (p.some((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : p.length >= 25 ? p : [...p, u]));

  const submit = async (e) => {
    e?.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await api.channelCreate({ guildId: guild.id, name: name.trim(), kind, parentId: parentId || null, isPrivate, memberIds: picked.map((u) => u.id) });
      onCreated(res);
    } catch (err) {
      toast({ kind: 'error', title: err.message, text: err.hint });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal newgroup" role="dialog" aria-label="Neue Gruppe" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="settings__head">
          <h3>👥 Neue Gruppe</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        {!allowed ? (
          <>
            <p>Der Bot darf auf „{guild?.name}“ noch keine Kanäle anlegen.</p>
            <p className="muted small">
              Was kann ich tun? In Discord: Servereinstellungen → Rollen → Rolle des Bots → Recht <b>„Kanäle verwalten“</b> einschalten. Danach hier ⟳ drücken.
            </p>
          </>
        ) : (
          <>
            <p className="muted small">Eine Gruppe ist ein neuer Kanal auf „{guild?.name}“. Alle Nachrichten darin schreibt der Bot.</p>
            <label className="settings__label" htmlFor="newgroup-name">
              Name
            </label>
            <input ref={nameRef} id="newgroup-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="z. B. Team Planung" />
            <div className="newgroup__kinds" role="radiogroup" aria-label="Art">
              <button type="button" role="radio" aria-checked={kind === 'text'} className={`newgroup__kind ${kind === "text" ? "is-on" : ""}`} onClick={() => setKind('text')}>
                💬 Schreiben
              </button>
              <button type="button" role="radio" aria-checked={kind === 'voice'} className={`newgroup__kind ${kind === "voice" ? "is-on" : ""}`} onClick={() => setKind('voice')}>
                🔊 Sprechen
              </button>
            </div>
            {categories.length > 0 && (
              <>
                <label className="settings__label" htmlFor="newgroup-cat">
                  Kategorie
                </label>
                <select id="newgroup-cat" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  <option value="">Keine</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <label className="composer__ping newgroup__private">
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              <span>🔒 Privat: nur ausgewählte Personen sehen die Gruppe</span>
            </label>
            {isPrivate && (
              <div className="newgroup__people">
                {picked.length > 0 && (
                  <div className="newgroup__picked">
                    {picked.map((u) => (
                      <button type="button" key={u.id} className="newgroup__chip" onClick={() => toggle(u)} title="Entfernen">
                        {u.display} ×
                      </button>
                    ))}
                  </div>
                )}
                <input value={query} maxLength={32} onChange={(e) => setQuery(e.target.value)} placeholder="Person suchen …" aria-label="Person suchen" />
                <div className="newdm__list">
                  {found.length === 0 && <p className="muted small">{query ? 'Niemand gefunden.' : 'Tippe einen Namen.'}</p>}
                  {found.map((u) => {
                    const on = picked.some((x) => x.id === u.id);
                    return (
                      <button type="button" key={u.id} className={`newdm__item ${on ? 'is-on' : ''}`} onClick={() => toggle(u)} aria-pressed={on}>
                        {u.avatarUrl ? <img src={u.avatarUrl} alt="" /> : <span className="newdm__ph">{u.display.slice(0, 1).toUpperCase()}</span>}
                        <span>
                          <b>{u.display}</b> <span className="muted small">@{u.sub}</span>
                        </span>
                        <span className="newgroup__tick">{on ? '✓' : ''}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="muted small">💡 Admins des Servers sehen private Kanäle trotzdem (Discord-Regel).</p>
              </div>
            )}
            <div className="confirm__actions">
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                Abbrechen
              </button>
              <button type="submit" className="btn" disabled={!name.trim() || busy}>
                {busy ? 'Wird erstellt …' : 'Gruppe erstellen'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
