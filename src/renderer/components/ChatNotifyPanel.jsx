import { useEffect, useRef, useState } from 'react';
import { prefs } from '../prefs';
import { playPreset } from '../sounds';
import { sanitizeChatNotify } from '../../shared/notify-sounds';

// Schnellfenster „Benachrichtigungen für diesen Chat“ (JoniMoni #61): Chat oder ganzen Server stumm schalten,
// nur bei Erwähnungen melden oder einen eigenen Ton wählen. Gespeichert nur auf diesem Gerät (prefs.chatNotify).
const MODES = [
  ['alle', '🔔', 'Alle Nachrichten', 'wie in den Einstellungen'],
  ['erwaehnungen', '@', 'Nur Erwähnungen', 'und Privatnachrichten'],
  ['aus', '🔕', 'Stumm', 'keine Töne von hier'],
];
const SOUNDS = [
  ['', 'Wie eingestellt'],
  ['standard', 'Standard'],
  ['leise', 'Leise'],
  ['klar', 'Klar'],
  ['retro', 'Retro'],
  ['eigen', 'Eigene Datei'],
];

export default function ChatNotifyPanel({ channel, guild, onClose }) {
  const isDM = channel?.type === 'dm' || guild?.isDM;
  const serverKey = isDM ? '@dm' : channel?.guildId || guild?.id;
  const [scope, setScope] = useState(() => (prefs.get().chatNotify?.[channel.id] || !prefs.get().chatNotify?.[serverKey] ? 'chat' : 'server'));
  const [map, setMap] = useState(() => prefs.get().chatNotify || {});
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => prefs.subscribe((p) => setMap(p.chatNotify || {})), []);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    const onDown = (e) => !ref.current?.contains(e.target) && !e.target.closest?.('[data-notify-toggle]') && closeRef.current();
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, []);

  const key = scope === 'server' ? serverKey : channel.id;
  const rule = map[key] || { mode: 'alle', preset: null };
  const inherited = scope === 'chat' && !map[channel.id] && map[serverKey] ? map[serverKey] : null;
  const save = (patch) => {
    const next = { ...map, [key]: { ...rule, ...patch } };
    prefs.set({ chatNotify: sanitizeChatNotify(next) }); // Standard („alle“ ohne Ton) wird dabei entfernt
  };
  const reset = () => {
    const next = { ...map };
    delete next[key];
    prefs.set({ chatNotify: next });
  };
  const dnd = prefs.get().dnd;

  return (
    <div className="notify-pop" ref={ref} role="dialog" aria-label="Benachrichtigungen für diesen Chat">
      <div className="notify-pop__head">
        <b>🔔 Benachrichtigungen</b>
        <button className="icon-btn" onClick={onClose} aria-label="Schließen">
          ×
        </button>
      </div>
      {!isDM && (
        <div className="notify-pop__scope" role="radiogroup" aria-label="Gilt für">
          <button role="radio" aria-checked={scope === 'chat'} className={scope === 'chat' ? 'is-on' : ''} onClick={() => setScope('chat')}>
            Dieser Chat
          </button>
          <button role="radio" aria-checked={scope === 'server'} className={scope === 'server' ? 'is-on' : ''} onClick={() => setScope('server')}>
            Ganzer Server
          </button>
        </div>
      )}
      {isDM && <p className="muted small">Gilt für alle Privatchats.</p>}
      {inherited && <p className="muted small">Gerade gilt die Regel vom ganzen Server ({MODES.find((m) => m[0] === inherited.mode)?.[2]}). Eine Wahl hier gilt nur für diesen Chat.</p>}
      <div className="notify-pop__modes" role="radiogroup" aria-label="Wann melden">
        {MODES.map(([id, icon, label, sub]) => (
          <button key={id} role="radio" aria-checked={rule.mode === id} className={`notify-pop__mode ${rule.mode === id ? 'is-on' : ''}`} onClick={() => save({ mode: id })}>
            <span aria-hidden="true">{icon}</span>
            <span>
              <b>{label}</b>
              <small>{sub}</small>
            </span>
          </button>
        ))}
      </div>
      {rule.mode !== 'aus' && (
        <label className="notify-pop__sound">
          <span>Ton</span>
          <select value={rule.preset || ''} onChange={(e) => save({ preset: e.target.value || null })}>
            {SOUNDS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          {rule.preset && (
            <button className="btn btn--ghost btn--small" onClick={() => playPreset(rule.preset)}>
              ▶ Testen
            </button>
          )}
        </label>
      )}
      {dnd && <p className="muted small">🔕 „Nicht stören“ ist gerade an – dann kommen überall keine Töne.</p>}
      <div className="notify-pop__foot">
        {map[key] && (
          <button className="link-btn" onClick={reset}>
            Zurücksetzen
          </button>
        )}
        <button
          className="link-btn"
          onClick={() => {
            onClose();
            window.dispatchEvent(new CustomEvent('pk:open-settings', { detail: { focus: 'toene' } }));
          }}
        >
          Alle Ton-Einstellungen …
        </button>
      </div>
    </div>
  );
}
