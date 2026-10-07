import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { prefs } from '../prefs';
import AiSection from './AiSection.jsx';
import UpdateSection from './UpdateSection.jsx';
import NotificationSection from './NotificationSection.jsx';
import VoiceFxSection from './VoiceFxSection.jsx';
import SecuritySection from './SecuritySection.jsx';
import { THEMES, ACCENTS, MOTIONS } from '../theme';
import WallpaperDialog from './WallpaperDialog.jsx';

function TokenSection({ toast }) {
  const [info, setInfo] = useState(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showId, setShowId] = useState(false);

  const load = useCallback(() => api.tokenInfo().then(setInfo).catch(() => setInfo(null)), []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.tokenSave({ token: value });
      setValue(''); // Token sofort aus der Oberfläche entfernen
      await load();
      if (res?.state === 'ready') toast({ kind: 'info', title: 'Token gespeichert ✓', text: 'Verschlüsselt gespeichert und verbunden.' });
      else toast({ kind: 'warn', title: 'Token gespeichert, aber keine Verbindung', text: res?.error?.hint || res?.error?.message || '' });
    } catch (e) {
      toast({ kind: 'error', title: e.message, text: e.hint });
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setConfirmClear(false);
    await api.tokenClear().catch((e) => toast({ kind: 'error', title: e.message }));
    await load();
  };

  if (info?.demo) return <p className="muted">Im Demo-Modus gibt es keinen echten Token.</p>;

  return (
    <>
      <div className="settings__status">
        {info?.stored ? (
          <span className="ok">
            🔐 Verschlüsselt gespeichert (Windows-Datenschutz) · Bot-ID{' '}
            <button className="link-btn" onClick={() => setShowId((v) => !v)} title={showId ? 'Verstecken' : 'Anzeigen'}>
              {showId ? info.botId : '••••••••'} {showId ? '🙈' : '👁'}
            </button>
          </span>
        ) : (
          <span className="warn">Kein Token gespeichert.</span>
        )}
        {info?.warning && <span className="warn small">⚠ {info.warning}</span>}
      </div>
      <label className="settings__label" htmlFor="token-input">
        {info?.stored ? 'Token ersetzen' : 'Token einfügen'}
      </label>
      <div className="settings__row">
        <input
          id="token-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Bot-Token aus dem Developer Portal"
          onKeyDown={(e) => e.key === 'Enter' && value && save()}
        />
        <button className="btn btn--primary" onClick={save} disabled={!value || busy}>
          {busy ? 'Prüfe …' : 'Speichern & verbinden'}
        </button>
      </div>
      <p className="muted small">
        Der Token wird sofort verschlüsselt (an dein Windows-Konto gebunden) und nie wieder angezeigt. Eine alte <code>.env</code> wird automatisch übernommen und gelöscht.
      </p>
      {info?.stored &&
        (confirmClear ? (
          <div className="settings__row">
            <span className="warn small">Wirklich entfernen? Danach ist der Bot offline, bis du einen neuen Token einträgst.</span>
            <button className="btn btn--danger btn--small" onClick={clear}>
              Ja, entfernen
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => setConfirmClear(false)}>
              Abbrechen
            </button>
          </div>
        ) : (
          <button className="btn btn--ghost btn--small" onClick={() => setConfirmClear(true)}>
            Token entfernen
          </button>
        ))}
    </>
  );
}

// Schreiben: Namensvorschläge beim Tippen von @ (Issue #1: „Autovervollständigung alle Server abfragen, als Einstellung“)
function WritingSection() {
  const [p, setP] = useState(prefs.get());
  useEffect(() => prefs.subscribe(setP), []);
  return (
    <>
      <label className="settings__label" htmlFor="mention-scope">
        Namensvorschläge beim Tippen von @
      </label>
      <select id="mention-scope" value={p.mentionScope} onChange={(e) => prefs.set({ mentionScope: e.target.value })}>
        <option value="server">nur Personen von diesem Server</option>
        <option value="alle">auch Personen von allen anderen Servern des Bots</option>
      </select>
      <p className="muted small">💡 Personen von anderen Servern sehen die Erwähnung nur, wenn sie auch auf diesem Server sind.</p>
    </>
  );
}

function WallpaperButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn--small" onClick={() => setOpen(true)}>
        🖼 Standard-Hintergrund wählen
      </button>
      <p className="muted small">Pro Chat oder Server: Rechtsklick auf einen Chat in der Liste → „Hintergrund …“.</p>
      {open && <WallpaperDialog onClose={() => setOpen(false)} />}
    </>
  );
}

// Aussehen: Design, Akzentfarbe, Animationen, Dichte – wirkt sofort, wird pro PC gemerkt
function AppearanceSection() {
  const [p, setP] = useState(prefs.get());
  useEffect(() => prefs.subscribe(setP), []);
  return (
    <>
      <span className="settings__label">Design</span>
      <div className="look-themes" role="radiogroup" aria-label="Design">
        {THEMES.map((t) => (
          <button key={t.id} role="radio" aria-checked={p.theme === t.id} className={`look-theme ${p.theme === t.id ? 'is-on' : ''}`} onClick={() => prefs.set({ theme: t.id })}>
            <span className="look-theme__preview" style={{ '--dot': t.swatch[2] }}>
              <i style={{ background: t.swatch[0] }} />
              <i style={{ background: t.swatch[1] }} />
            </span>
            {t.label}
          </button>
        ))}
      </div>
      <span className="settings__label">Akzentfarbe</span>
      <div className="look-accents" role="radiogroup" aria-label="Akzentfarbe">
        {ACCENTS.map((a) => (
          <button
            key={a || 'auto'}
            role="radio"
            aria-checked={p.accent === a}
            aria-label={a ? `Farbe ${a}` : 'Passend zum Design'}
            title={a ? a : 'Passend zum Design'}
            className={`look-accent ${a ? '' : 'look-accent--auto'} ${p.accent === a ? 'is-on' : ''}`}
            style={a ? { background: a } : undefined}
            onClick={() => prefs.set({ accent: a })}
          />
        ))}
      </div>
      <span className="settings__label">Animationen</span>
      <div className="look-seg" role="radiogroup" aria-label="Animationen">
        {MOTIONS.map((m) => (
          <button key={m.id} role="radio" aria-checked={p.motion === m.id} className={p.motion === m.id ? 'is-on' : ''} title={m.hint} onClick={() => prefs.set({ motion: m.id })}>
            {m.label}
          </button>
        ))}
      </div>
      <span className="settings__label">Chat-Hintergrund</span>
      <WallpaperButton />
      <span className="settings__label">Ansicht</span>
      <div className="look-seg" role="radiogroup" aria-label="Ansicht">
        {[
          ['normal', 'Normal'],
          ['kompakt', 'Kompakt'],
        ].map(([id, label]) => (
          <button key={id} role="radio" aria-checked={p.density === id} className={p.density === id ? 'is-on' : ''} onClick={() => prefs.set({ density: id })}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

// Bot-Profil: Name, Bild, Beschreibung (gilt überall) + Spitzname auf dem aktuellen Server
const AVATAR_MAX = 8 * 1024 * 1024;

function ProfileSection({ toast, guildId }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [nick, setNick] = useState('');
  const [avatar, setAvatar] = useState(null); // { data: Uint8Array, preview: dataURL }
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const apply = useCallback((p) => {
    setProfile(p);
    setName(p.username);
    setDesc(p.description || '');
    setNick(p.server?.nick || '');
    setAvatar(null);
  }, []);

  useEffect(() => {
    api
      .getProfile(guildId ? { guildId } : {})
      .then(apply)
      .catch((e) => setError(e.message));
  }, [guildId, apply]);

  if (error) return <p className="muted small">Profil nicht verfügbar: {error}</p>;
  if (!profile) return <p className="muted small">Lade Profil …</p>;

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > AVATAR_MAX) return toast({ kind: 'warn', title: 'Bild zu groß', text: 'Höchstens 8 MiB.' });
    const reader = new FileReader();
    reader.onload = async () => setAvatar({ data: new Uint8Array(await file.arrayBuffer()), preview: reader.result });
    reader.readAsDataURL(file);
  };

  const changes = {};
  if (name.trim() !== profile.username) changes.username = name;
  if (avatar) changes.avatar = avatar.data;
  if (desc.trim() !== (profile.description || '')) changes.description = desc;
  if (profile.server && nick.trim() !== profile.server.nick) Object.assign(changes, { guildId: profile.server.guildId, nick });
  const dirty = Object.keys(changes).length > 0;

  const save = async () => {
    setBusy(true);
    try {
      // Server-ID immer mitschicken, damit das zurückgelieferte Profil den Spitznamen-Bereich behält
      const res = await api.updateProfile(profile.server ? { guildId: profile.server.guildId, ...changes } : changes);
      apply(res.profile);
      toast({ kind: 'info', title: 'Profil gespeichert ✓', text: 'In Discord kann es ein paar Sekunden dauern, bis alle es sehen.' });
    } catch (e) {
      toast({ kind: 'error', title: e.message, text: e.hint });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="profile">
        <button className="profile__avatar" onClick={() => fileRef.current?.click()} title="Profilbild ändern" aria-label="Profilbild ändern">
          <img src={avatar?.preview || profile.avatarUrl} alt="" />
          <span>Ändern</span>
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={pickFile} />
        <div className="profile__fields">
          <label className="settings__label" htmlFor="profile-name">
            Name <span className="muted small">(max. 2 Änderungen pro Stunde)</span>
          </label>
          <div className="settings__row">
            <input id="profile-name" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
      </div>
      <label className="settings__label" htmlFor="profile-desc">
        Über mich <span className="muted small">{desc.length}/400</span>
      </label>
      <textarea id="profile-desc" className="profile__desc" value={desc} maxLength={400} rows={3} onChange={(e) => setDesc(e.target.value)} placeholder="Was macht dein Bot?" />
      {profile.server && (
        <>
          <label className="settings__label" htmlFor="profile-nick">
            Spitzname auf „{profile.server.guildName}“ <span className="muted small">(leer = normaler Name)</span>
          </label>
          <div className="settings__row">
            <input id="profile-nick" value={nick} maxLength={32} disabled={!profile.server.canChangeNick} onChange={(e) => setNick(e.target.value)} placeholder={profile.username} />
          </div>
          {!profile.server.canChangeNick && <p className="muted small">💡 Dafür braucht die Bot-Rolle auf diesem Server das Recht „Nickname ändern“.</p>}
        </>
      )}
      <div className="settings__row">
        <button className="btn btn--primary" disabled={!dirty || busy} onClick={save}>
          {busy ? 'Speichere …' : 'Profil speichern'}
        </button>
        {avatar && (
          <button className="btn btn--ghost btn--small" onClick={() => setAvatar(null)}>
            Bild verwerfen
          </button>
        )}
      </div>
    </>
  );
}

// Bildschirmschutz: andere Programme (Screenshots, Aufnahmen, Bildschirm teilen) sehen nur ein schwarzes Fenster
// Bilder/GIFs/Videos laden? Warnung vor Links? (Issue #1)
function MediaPrivacy() {
  const [p, setP] = useState(prefs.get());
  useEffect(() => prefs.subscribe(setP), []);
  return (
    <>
      <div className="settings__field" data-setting="media">
        <label className="settings__label" htmlFor="set-media">
          🖼 Bilder, GIFs und Videos in Nachrichten
        </label>
        <select id="set-media" value={p.media} onChange={(e) => prefs.set({ media: e.target.value })}>
          <option value="fragen">Erst fragen</option>
          <option value="immer">Immer laden</option>
          <option value="nie">Nie laden (nur Name/Link zeigen)</option>
        </select>
        <p className="muted small">Geladen wird nur über Discords Server: Fremde Webseiten sehen deine IP-Adresse nicht, Discord schon (wie in der normalen App).</p>
      </div>
      <label className="composer__ping" data-setting="links">
        <input type="checkbox" checked={p.linkWarn} onChange={(e) => prefs.set({ linkWarn: e.target.checked })} /> 🔗 Vor dem Öffnen von Links warnen
      </label>
    </>
  );
}

function PrivacySection({ toast }) {
  const [on, setOn] = useState(null);
  useEffect(() => {
    api
      .getSettings()
      .then((s) => setOn(s.screenProtection === true))
      .catch(() => setOn(false));
  }, []);
  const toggle = async (next) => {
    try {
      setOn(await api.setScreenProtection({ on: next }));
    } catch (e) {
      toast({ kind: 'error', title: e.message });
    }
  };
  return (
    <>
      <label className="composer__ping">
        <input type="checkbox" checked={on === true} disabled={on === null} onChange={(e) => toggle(e.target.checked)} /> 🛡 Bildschirmschutz: Screenshots und Aufnahmen verbieten
      </label>
      <p className="muted small">Andere Programme (z. B. Snipping Tool, OBS, Bildschirm teilen) sehen dann nur ein schwarzes Fenster. Ein Foto mit dem Handy kann keine App verhindern.</p>
      <MediaPrivacy />
      <p className="muted small">
        Keine Cloud, keine Telemetrie. Lokal gespeichert: verschlüsselter Token, zuletzt geöffneter Chat, Lese-Markierungen, diese Einstellungen. Sprachkanäle werden nie aufgezeichnet.
      </p>
    </>
  );
}

function AudioSection() {
  const [p, setP] = useState(prefs.get());
  const [devices, setDevices] = useState({ inputs: [], outputs: [] });
  const [hint, setHint] = useState('');

  useEffect(() => prefs.subscribe(setP), []);
  useEffect(() => {
    const load = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        const inputs = list.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
        const outputs = list.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
        setDevices({ inputs, outputs });
        if (list.some((d) => d.kind === 'audioinput' && !d.label)) setHint('Gerätenamen erscheinen, sobald du einmal im Sprachkanal das Mikro eingeschaltet hast.');
      } catch {
        setHint('Audiogeräte konnten nicht gelesen werden.');
      }
    };
    load();
    navigator.mediaDevices?.addEventListener?.('devicechange', load);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', load);
  }, []);

  const name = (d, i, kind) => d.label || `${kind} ${i + 1}`;

  return (
    <>
      <label className="settings__label" htmlFor="mic-select">
        Mikrofon
      </label>
      <select id="mic-select" value={p.micDeviceId} onChange={(e) => prefs.set({ micDeviceId: e.target.value })}>
        <option value="">Windows-Standard</option>
        {devices.inputs.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {name(d, i, 'Mikrofon')}
          </option>
        ))}
      </select>
      <label className="settings__label" htmlFor="out-select">
        Lautsprecher / Kopfhörer
      </label>
      <select id="out-select" value={p.outputDeviceId} onChange={(e) => prefs.set({ outputDeviceId: e.target.value })}>
        <option value="">Windows-Standard</option>
        {devices.outputs.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {name(d, i, 'Ausgabe')}
          </option>
        ))}
      </select>
      <label className="settings__label" htmlFor="vol">
        Lautstärke der anderen: {Math.round(p.volume * 100)} %
      </label>
      <input id="vol" type="range" min="0" max="2" step="0.05" value={p.volume} onChange={(e) => prefs.set({ volume: Number(e.target.value) })} />
      {hint && <p className="muted small">{hint}</p>}
    </>
  );
}

export default function SettingsDialog({ onClose, toast, appInfo, guildId, aiTargets = [], guilds = [], focus = null }) {
  // „Hier aktivieren“ (z. B. Medien) → direkt dorthin scrollen und kurz hervorheben
  useEffect(() => {
    if (!focus) return undefined;
    const t = setTimeout(() => {
      const el = document.querySelector(`.settings [data-setting="${focus}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('is-focus');
      setTimeout(() => el.classList.remove('is-focus'), 2500);
    }, 150);
    return () => clearTimeout(t);
  }, [focus]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal settings" role="dialog" aria-label="Einstellungen" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings__head">
          <h3>Einstellungen</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        <section>
          <h4>🎨 Aussehen</h4>
          <AppearanceSection />
        </section>
        <section>
          <h4>✍️ Schreiben</h4>
          <WritingSection />
        </section>
        <section>
          <h4>🔔 Benachrichtigungen</h4>
          <NotificationSection toast={toast} />
        </section>
        <section>
          <h4>🪪 Bot-Profil</h4>
          <ProfileSection toast={toast} guildId={guildId} />
        </section>
        <section>
          <h4>🔑 Bot-Token</h4>
          <TokenSection toast={toast} />
        </section>
        <section>
          <h4>🎧 Audio (Sprachkanäle)</h4>
          <AudioSection />
          <VoiceFxSection />
        </section>
        <section>
          <h4>🔄 Updates</h4>
          <UpdateSection appInfo={appInfo} toast={toast} />
        </section>
        <section>
          <h4>🧪 Beta</h4>
          <AiSection toast={toast} targets={aiTargets} guilds={guilds} />
        </section>
        <section>
          <h4>🛡 Sicherheit & Start</h4>
          <SecuritySection toast={toast} />
        </section>
        <section>
          <h4>🔒 Datenschutz</h4>
          <PrivacySection toast={toast} />
        </section>
      </div>
    </div>
  );
}
