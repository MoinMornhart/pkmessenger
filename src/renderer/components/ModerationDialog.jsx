import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

// Person verwalten (Rechtsklick → „👤 … verwalten“, Issue #1): Rollen, Timeout, Kick, Bann.
// Nur was der Bot darf ist anklickbar; Kick und Bann fragen vorher nach.
const TIMEOUTS = [
  [1, '1 Minute'],
  [5, '5 Minuten'],
  [10, '10 Minuten'],
  [60, '1 Stunde'],
  [1440, '1 Tag'],
  [10080, '1 Woche'],
];
const BAN_DELETE = [
  [0, 'keine Nachrichten löschen'],
  [3600, 'Nachrichten der letzten Stunde löschen'],
  [86400, 'Nachrichten der letzten 24 Std. löschen'],
  [604800, 'Nachrichten der letzten 7 Tage löschen'],
];

const NEED = {
  roles: 'Dem Bot fehlt das Recht „Rollen verwalten“.',
  timeout: 'Geht nicht: Dem Bot fehlt „Mitglieder im Timeout“ oder die Person hat eine höhere Rolle als der Bot (oder ist Admin/Besitzer).',
  kick: 'Geht nicht: Dem Bot fehlt „Mitglieder kicken“ oder die Person hat eine höhere Rolle als der Bot (oder ist Besitzer).',
  ban: 'Geht nicht: Dem Bot fehlt „Mitglieder bannen“ oder die Person hat eine höhere Rolle als der Bot (oder ist Besitzer).',
};

export default function ModerationDialog({ guildId, userId, onClose, toast }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState(10);
  const [banDelete, setBanDelete] = useState(0);
  const [confirm, setConfirm] = useState(null); // 'kick' | 'ban'

  useEffect(() => {
    api
      .memberInfo({ guildId, userId })
      .then(setInfo)
      .catch((e) => setError(`${e.message} ${e.hint || ''}`.trim()));
  }, [guildId, userId]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && (confirm ? setConfirm(null) : onClose());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirm]);

  const act = useCallback(
    async (fn, ok) => {
      setBusy(true);
      try {
        const r = await fn();
        if (r && r.roles) setInfo(r);
        if (ok) toast({ kind: 'info', title: ok, duration: 3000 });
        return r;
      } catch (e) {
        toast({ kind: 'error', title: e.message, text: e.hint });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const base = { guildId, userId, reason: reason.trim() || undefined };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal moderation" role="dialog" aria-label="Person verwalten" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings__head">
          <h3>👤 {info ? info.name : 'Person'} verwalten</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        {error && <p className="warn">{error}</p>}
        {!info && !error && <p className="muted">Lade …</p>}
        {info && (
          <>
            <div className="moderation__who">
              {info.avatarUrl ? <img src={info.avatarUrl} alt="" /> : <span className="newdm__ph">{info.name.slice(0, 1)}</span>}
              <div>
                <b>{info.name}</b> <span className="muted small">@{info.username}</span>
                {info.isBot && <span className="bot-tag">BOT</span>}
                {info.isOwner && <span className="muted small"> · Server-Besitzer</span>}
                {info.timeoutUntil && <div className="warn small">⏳ Im Timeout bis {new Date(info.timeoutUntil).toLocaleString('de-DE')}</div>}
              </div>
            </div>

            <h4>🏷 Rollen</h4>
            {!info.can.roles && <p className="muted small">💡 {NEED.roles}</p>}
            <div className="moderation__roles">
              {info.roles.length === 0 && <span className="muted small">Der Server hat keine Rollen.</span>}
              {info.roles.map((r) => (
                <label key={r.id} className={`moderation__role ${r.editable ? '' : 'is-locked'}`} title={r.editable ? '' : 'Diese Rolle steht über der Bot-Rolle oder gehört zu einer Integration.'}>
                  <input type="checkbox" checked={r.has} disabled={!r.editable || busy} onChange={(e) => act(() => api.memberRole({ ...base, roleId: r.id, add: e.target.checked }), e.target.checked ? `Rolle „${r.name}“ gegeben ✓` : `Rolle „${r.name}“ entfernt`)} />
                  <span className="role-dot" style={r.color ? { background: r.color } : undefined} />
                  {r.name}
                  {!r.editable && ' 🔒'}
                </label>
              ))}
            </div>

            <label className="settings__label" htmlFor="mod-reason">
              Begründung <span className="muted small">(optional, steht im Audit-Log des Servers)</span>
            </label>
            <div className="settings__row">
              <input id="mod-reason" value={reason} maxLength={400} onChange={(e) => setReason(e.target.value)} placeholder="z. B. Spam im #allgemein" />
            </div>

            <h4>⏳ Timeout</h4>
            {info.can.timeout ? (
              <div className="settings__row">
                <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Dauer">
                  {TIMEOUTS.map(([m, l]) => (
                    <option key={m} value={m}>
                      {l}
                    </option>
                  ))}
                </select>
                <button className="btn btn--small" disabled={busy} onClick={() => act(() => api.memberTimeout({ ...base, minutes }), 'Timeout gesetzt ⏳')}>
                  Timeout setzen
                </button>
                {info.timeoutUntil && (
                  <button className="btn btn--ghost btn--small" disabled={busy} onClick={() => act(() => api.memberTimeout({ ...base, minutes: 0 }), 'Timeout aufgehoben')}>
                    Timeout aufheben
                  </button>
                )}
              </div>
            ) : (
              <p className="muted small">💡 {NEED.timeout}</p>
            )}

            <h4>🚪 Kick und Bann</h4>
            <div className="settings__row">
              <button className="btn btn--danger btn--small" disabled={!info.can.kick || busy} title={info.can.kick ? '' : NEED.kick} onClick={() => setConfirm('kick')}>
                Kicken
              </button>
              <button className="btn btn--danger btn--small" disabled={!info.can.ban || busy} title={info.can.ban ? '' : NEED.ban} onClick={() => setConfirm('ban')}>
                Bannen
              </button>
            </div>
            {!info.can.kick && !info.can.ban && <p className="muted small">💡 {NEED.kick}</p>}

            {confirm && (
              <div className="moderation__confirm" role="alertdialog" aria-label="Wirklich?">
                <p>
                  <b>{info.name}</b> wirklich {confirm === 'kick' ? 'vom Server werfen? Die Person kann mit einer Einladung zurückkommen.' : 'bannen? Die Person kann nicht mehr beitreten, bis der Bann aufgehoben wird.'}
                </p>
                {confirm === 'ban' && (
                  <select value={banDelete} onChange={(e) => setBanDelete(Number(e.target.value))} aria-label="Nachrichten löschen">
                    {BAN_DELETE.map(([s, l]) => (
                      <option key={s} value={s}>
                        {l}
                      </option>
                    ))}
                  </select>
                )}
                <div className="confirm__actions">
                  <button className="btn btn--ghost" autoFocus onClick={() => setConfirm(null)}>
                    Abbrechen
                  </button>
                  <button
                    className="btn btn--danger"
                    disabled={busy}
                    onClick={async () => {
                      const ok =
                        confirm === 'kick'
                          ? await act(() => api.memberKick(base), `${info.name} wurde gekickt`)
                          : await act(() => api.memberBan({ ...base, deleteMessageSeconds: banDelete }), `${info.name} wurde gebannt`);
                      if (ok) onClose();
                    }}
                  >
                    {confirm === 'kick' ? 'Ja, kicken' : 'Ja, bannen'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
