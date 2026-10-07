import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { prefs } from '../prefs';
import { playPreset, forgetCustomSound } from '../sounds';

// Einstellungen → Benachrichtigungen → Töne (Issue #12)
const PRESET_LABEL = { standard: 'Standard', leise: 'Leise', klar: 'Klar', retro: 'Retro', eigen: 'Eigene Datei', aus: 'Kein Ton' };
const EVENT_LABEL = {
  otherChat: 'Neue Nachricht in einem anderen Chat',
  activeChat: 'Neue Nachricht im offenen Chat',
  mention: 'Jemand erwähnt den Bot / antwortet ihm',
  dm: 'Privatnachricht',
  ai: 'KI hat geantwortet',
  error: 'Verbindung getrennt / Fehler',
};

export default function NotificationSection({ toast }) {
  const [p, setP] = useState(prefs.get());
  const [custom, setCustom] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => prefs.subscribe(setP), []);
  useEffect(() => {
    api
      .soundCustomInfo()
      .then((i) => setCustom(Boolean(i?.has)))
      .catch(() => setCustom(false));
  }, []);

  const s = p.sound;
  const setSound = (patch) => prefs.set({ sound: { ...s, ...patch } });
  const setEvent = (e, patch) => setSound({ events: { ...s.events, [e]: { ...s.events[e], ...patch } } });

  const pickFile = async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    try {
      await api.soundCustomSet({ data: new Uint8Array(await file.arrayBuffer()) });
      forgetCustomSound();
      setCustom(true);
      toast({ kind: 'info', title: 'Eigener Ton gespeichert ✓', text: 'Wähle bei einem Ereignis „Eigene Datei“.', duration: 3000 });
    } catch (e) {
      toast({ kind: 'error', title: e.message, text: e.hint });
    }
  };

  const removeFile = async () => {
    await api.soundCustomClear().catch(() => {});
    forgetCustomSound();
    setCustom(false);
  };

  return (
    <>
      <label className="composer__ping">
        <input type="checkbox" checked={p.dnd} onChange={(e) => prefs.set({ dnd: e.target.checked })} /> 🔕 Nicht stören (keine Töne, bis du es wieder ausschaltest)
      </label>
      <label className="composer__ping">
        <input type="checkbox" checked={s.enabled} onChange={(e) => setSound({ enabled: e.target.checked })} /> 🔔 Töne einschalten
      </label>
      {s.enabled && (
        <>
          <label className="settings__label" htmlFor="sound-vol">
            Lautstärke: {Math.round(s.volume * 100)} %
          </label>
          <input id="sound-vol" type="range" min="0" max="1" step="0.05" value={s.volume} onChange={(e) => setSound({ volume: Number(e.target.value) })} />
          <div className="sound-events" role="group" aria-label="Töne je Ereignis">
            {Object.keys(EVENT_LABEL).map((e) => (
              <div key={e} className="sound-event">
                <label className="sound-event__name">
                  <input type="checkbox" checked={s.events[e].on} onChange={(x) => setEvent(e, { on: x.target.checked })} /> {EVENT_LABEL[e]}
                </label>
                <select aria-label={`Ton für: ${EVENT_LABEL[e]}`} value={s.events[e].preset} disabled={!s.events[e].on} onChange={(x) => setEvent(e, { preset: x.target.value })}>
                  {Object.keys(PRESET_LABEL)
                    .filter((k) => k !== 'eigen' || custom)
                    .map((k) => (
                      <option key={k} value={k}>
                        {PRESET_LABEL[k]}
                      </option>
                    ))}
                </select>
                <button className="icon-btn" title="Testton" aria-label={`Testton: ${EVENT_LABEL[e]}`} disabled={!s.events[e].on || s.events[e].preset === 'aus'} onClick={() => playPreset(s.events[e].preset, s.volume)}>
                  ▶
                </button>
              </div>
            ))}
          </div>
          <label className="composer__ping">
            <input type="checkbox" checked={s.quietInOpenChat} onChange={(e) => setSound({ quietInOpenChat: e.target.checked })} /> Kein Ton für den Chat, den ich gerade offen habe
          </label>
          <div className="settings__row">
            <input ref={fileRef} type="file" accept=".wav,audio/wav" hidden onChange={pickFile} />
            <button className="btn btn--small" onClick={() => fileRef.current?.click()}>
              🎵 {custom ? 'Eigene WAV-Datei ersetzen' : 'Eigene WAV-Datei wählen'}
            </button>
            {custom && (
              <button className="btn btn--ghost btn--small" onClick={removeFile}>
                Eigene Datei entfernen
              </button>
            )}
          </div>
          <p className="muted small">Töne kommen auch bei minimiertem Fenster. Höchstens ein Ton pro 1,5 Sekunden, nie für eigene Nachrichten. Alles bleibt auf diesem PC.</p>
        </>
      )}
    </>
  );
}
