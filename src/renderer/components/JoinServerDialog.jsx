import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { parseInviteCode, inviteJoinUrl } from '../../shared/invites';

// „Server beitreten“: Du trittst SELBST in der offiziellen Discord-App bei (eigener Account, kein Admin nötig).
// Danach kannst du deinen Bot mitnehmen – der Server ist in der Einladung schon vorausgewählt.
export default function JoinServerDialog({ onClose, onRefresh, toast }) {
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(1);
  const inputRef = useRef(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const code = parseInviteCode(value);

  const check = async () => {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const p = await api.invitePreview({ invite: value });
      setPreview(p);
      setStep(2);
    } catch (e) {
      setError({ message: e.message, hint: e.hint });
    } finally {
      setBusy(false);
    }
  };

  const joinInDiscord = async () => {
    await api.openExternal({ url: inviteJoinUrl(preview.code) }).catch((e) => toast({ kind: 'error', title: e.message }));
    setStep(3);
  };

  const bringBot = async () => {
    const url = await api.getInviteUrl({ guildId: preview.guild.id }).catch(() => null);
    if (url) await api.openExternal({ url }).catch((e) => toast({ kind: 'error', title: e.message }));
    setStep(4);
  };

  const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString('de-DE') : '–');

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal join" role="dialog" aria-label="Server beitreten" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings__head">
          <h3>Server beitreten</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        <p className="muted">
          Du trittst <b>selbst</b> mit deinem Discord-Account bei, ganz ohne Admin. Danach kannst du deinen Bot mitnehmen, damit der Server auch in PKMessenger erscheint.
        </p>

        <label className="settings__label" htmlFor="invite-input">
          Einladungslink
        </label>
        <div className="settings__row">
          <input
            id="invite-input"
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setStep(1);
              setPreview(null);
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && code && check()}
            placeholder="z. B. https://discord.gg/abc123"
            spellCheck={false}
          />
          <button className="btn btn--primary" onClick={check} disabled={!code || busy}>
            {busy ? 'Prüfe …' : 'Vorschau'}
          </button>
        </div>
        {value && !code && <p className="warn small">Das sieht nicht wie ein Discord-Einladungslink aus.</p>}
        {error && (
          <div className="callout callout--error">
            <strong>{error.message}</strong>
            {error.hint && <p>{error.hint}</p>}
          </div>
        )}

        {preview && (
          <div className="join__card">
            <div className="join__icon">{preview.guild.iconUrl ? <img src={preview.guild.iconUrl} alt="" /> : preview.guild.name.slice(0, 2).toUpperCase()}</div>
            <div className="join__info">
              <strong>{preview.guild.name}</strong>
              <span className="muted small">
                <span className="dot dot--ok" /> {fmt(preview.onlineCount)} online · {fmt(preview.memberCount)} Mitglieder
              </span>
              {preview.botAlreadyThere && <span className="ok small">✓ Dein Bot ist schon auf diesem Server.</span>}
            </div>
          </div>
        )}

        {preview && (
          <ol className="join__steps">
            <li className={step >= 3 ? 'is-done' : ''}>
              <div>
                <b>Selbst beitreten</b>
                <span className="muted small"> – öffnet die offizielle Discord-Seite bzw. App, dort auf „Einladung annehmen“.</span>
              </div>
              <button className="btn btn--small btn--primary" onClick={joinInDiscord}>
                In Discord beitreten ↗
              </button>
            </li>
            <li className={step >= 4 || preview.botAlreadyThere ? 'is-done' : ''}>
              <div>
                <b>Bot mitnehmen</b>
                <span className="muted small">
                  {' '}
                  – nur möglich, wenn du auf dem Server „Server verwalten“ darfst. Sonst den Link einem Admin schicken.
                </span>
              </div>
              <button className="btn btn--small" onClick={bringBot} disabled={preview.botAlreadyThere}>
                {preview.botAlreadyThere ? 'Schon da ✓' : 'Bot einladen ↗'}
              </button>
            </li>
            <li>
              <div>
                <b>Fertig?</b>
                <span className="muted small"> – PKMessenger aktualisieren, dann erscheint der Server links.</span>
              </div>
              <button
                className="btn btn--small"
                onClick={() => {
                  onRefresh();
                  onClose();
                }}
              >
                ⟳ Aktualisieren
              </button>
            </li>
          </ol>
        )}
      </div>
    </div>
  );
}
