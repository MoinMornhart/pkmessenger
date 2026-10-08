import { useEffect } from 'react';

// Erklärt, warum Kanäle fehlen bzw. nur lesbar sind, und wie man sie für den Bot freigibt (Issue #1).
export default function AccessDialog({ access, guildName, onClose, onRefresh }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hidden = access?.hidden || [];
  const readOnly = access?.readOnly || [];
  const label = (c) => `${c.type === 'voice' ? '🔊' : '#'} ${c.name}${c.category ? `  ·  ${c.category}` : ''}`;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal access" role="dialog" aria-label="Kanalzugriff des Bots" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Kanalzugriff in „{guildName}“</h3>
        <p className="muted">
          Der Bot sieht nur Kanäle, die seine <b>Rolle</b> sehen darf. Discord zeigt dir in deinem eigenen Client mehr, weil <i>du</i> andere Rechte hast als der Bot.
        </p>

        {hidden.length > 0 && (
          <>
            <h4>🔒 Gesperrt ({hidden.length})</h4>
            <ul className="access__list">
              {hidden.map((c) => (
                <li key={c.id}>{label(c)}</li>
              ))}
            </ul>
          </>
        )}
        {readOnly.length > 0 && (
          <>
            <h4>👁 Nur lesen ({readOnly.length})</h4>
            <ul className="access__list">
              {readOnly.map((c) => (
                <li key={c.id}>{label(c)}</li>
              ))}
            </ul>
          </>
        )}
        {hidden.length === 0 && readOnly.length === 0 && <p>✓ Der Bot hat in allen Text- und Sprachkanälen Zugriff.</p>}
        {(access?.unsupported?.length > 0 || access?.threads > 0) && (
          <>
            <h4>🧩 Erkannt, aber noch nicht unterstützt</h4>
            <ul className="access__list">
              {(access.unsupported || []).map((c) => (
                <li key={c.id}>
                  {c.type === 'forum' ? '🗂 Forum' : c.type === 'media' ? '🖼 Medien' : '🎙 Stage'}: {c.name}
                </li>
              ))}
              {access.threads > 0 && <li>🧵 {access.threads} aktive Threads (Anzeige kommt mit F12)</li>}
            </ul>
          </>
        )}

        <div className="callout">
          <span className="callout__label">Was kann ich tun?</span>
          <ol className="access__steps">
            <li>Eine Admin des Servers in Discord: Rechtsklick auf den Kanal (oder die Kategorie) → <b>Kanal bearbeiten</b> → <b>Berechtigungen</b>.</li>
            <li>
              <b>Mitglieder oder Rollen hinzufügen</b> → die <b>Rolle des Bots</b> wählen.
            </li>
            <li>
              Erlauben: <b>Kanal ansehen</b>, <b>Nachrichten senden</b>, <b>Nachrichtenverlauf lesen</b> (bei Sprachkanälen zusätzlich <b>Verbinden</b> und <b>Sprechen</b>).
            </li>
            <li>Hier auf <b>Jetzt aktualisieren</b> klicken.</li>
          </ol>
          <p className="muted small">Tipp: Gibst du die Rechte an der Kategorie frei, gelten sie für alle Kanäle darin, die mit der Kategorie synchronisiert sind.</p>
        </div>

        <div className="confirm__actions">
          <button className="btn btn--primary" onClick={onRefresh}>
            ⟳ Jetzt aktualisieren
          </button>
          <button className="btn btn--ghost" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
