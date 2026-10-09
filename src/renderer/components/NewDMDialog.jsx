import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

// Neuer Privatchat: Person auf einem Server des Bots suchen → Bot schreibt ihr privat.
// Geht nur mit Personen, die einen Server mit dem Bot teilen (Discord-Regel).
export default function NewDMDialog({ guilds, onClose, onOpened, toast }) {
  const [guildId, setGuildId] = useState('alle');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Suche mit kleiner Verzögerung; nur Personen (keine Rollen)
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        // Alle Server auf einmal, unscharf (Issue #1); die Server-Auswahl schränkt nur ein
        const res = await api.searchPeople({ query: query.trim().slice(0, 32) });
        const gName = guilds.find((g) => g.id === guildId)?.name;
        const inGuild = res.filter((i) => !i.bot && (!gName || guildId === 'alle' || i.guilds?.includes(gName)));
        if (!cancelled) setItems(inGuild);
      } catch {
        if (!cancelled) setItems([]);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [guildId, query]);

  const open = async (userId) => {
    setBusy(true);
    try {
      const dm = await api.openDM({ userId });
      onOpened(dm);
    } catch (e) {
      toast({ kind: 'error', title: e.message, text: e.hint });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal newdm" role="dialog" aria-label="Neuer Privatchat" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings__head">
          <h3>💬 Neuer Privatchat</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        {guilds.length === 0 ? (
          <p className="muted">Der Bot ist noch auf keinem Server. Privat schreiben kann er nur Leuten, mit denen er einen Server teilt.</p>
        ) : (
          <>
            {guilds.length > 1 && (
              <>
                <label className="settings__label" htmlFor="newdm-guild">
                  Server
                </label>
                <select id="newdm-guild" value={guildId} onChange={(e) => setGuildId(e.target.value)}>
                  <option value="alle">Alle Server</option>
                  {guilds.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <div className="settings__row">
              <input ref={inputRef} id="newdm-query" value={query} maxLength={32} onChange={(e) => setQuery(e.target.value)} placeholder="Name suchen …" aria-label="Name suchen" />
            </div>
            <div className="newdm__list">
              {items.length === 0 && !/^\d{17,20}$/.test(query.trim()) && <p className="muted small">{query ? 'Niemand gefunden.' : 'Tippe einen Namen.'}</p>}
              {/^\d{17,20}$/.test(query.trim()) && (
                <button className="newdm__item" disabled={busy} onClick={() => open(query.trim())}>
                  <span className="newdm__ph">🆔</span>
                  <span>
                    <b>Als Kontakt über ID hinzufügen</b> <span className="muted small">{query.trim()}</span>
                  </span>
                </button>
              )}
              {items.map((u) => (
                <button key={u.id} className="newdm__item" disabled={busy} onClick={() => open(u.id)}>
                  {u.avatarUrl ? <img src={u.avatarUrl} alt="" /> : <span className="newdm__ph">{u.display.slice(0, 1).toUpperCase()}</span>}
                  <span>
                    <b>{u.display}</b> <span className="muted small">@{u.sub}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="muted small">💡 Die Nachricht kommt vom Bot. Klappt es nicht, hat die Person Privatnachrichten von Servermitgliedern ausgeschaltet.</p>
          </>
        )}
      </div>
    </div>
  );
}
