import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { prefs } from '../prefs';

function TokenSection({ toast }) {
  const [info, setInfo] = useState(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

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
          <span className="ok">🔐 Verschlüsselt gespeichert (Windows-Datenschutz) · Bot-ID {info.botId}</span>
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

export default function SettingsDialog({ onClose, toast, appInfo }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const u = appInfo?.update || {};
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
          <h4>🔑 Bot-Token</h4>
          <TokenSection toast={toast} />
        </section>
        <section>
          <h4>🎧 Audio (Sprachkanäle)</h4>
          <AudioSection />
        </section>
        <section>
          <h4>🔄 Updates</h4>
          <p>
            PKMessenger v{appInfo?.version || '?'} ·{' '}
            {u.state === 'disabled' ? u.reason : u.state === 'current' ? 'aktuell ✓' : u.state === 'ready' ? 'Update bereit – beim Neustart installiert' : u.state || '–'}
          </p>
          {u.enabled && (
            <button className="btn btn--small" onClick={() => api.checkForUpdates().catch(() => {})}>
              Jetzt nach Updates suchen
            </button>
          )}
        </section>
        <section>
          <h4>🔒 Datenschutz</h4>
          <p className="muted small">
            Keine Cloud, keine Telemetrie. Lokal gespeichert: verschlüsselter Token, zuletzt geöffneter Chat, Lese-Markierungen, diese Audio-Einstellungen. Sprachkanäle werden nie
            aufgezeichnet.
          </p>
        </section>
      </div>
    </div>
  );
}
