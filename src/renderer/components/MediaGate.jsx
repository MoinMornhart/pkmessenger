import { useEffect, useState } from 'react';
import { prefs } from '../prefs';

// Schutz vor ungefragtem Laden von Bildern, GIFs und Videos (Issue #1).
// Modus aus den Einstellungen: „fragen“ (Standard), „immer“, „nie“.
// „Hier aktivieren“ öffnet die Einstellungen direkt an der richtigen Stelle.

export function openSettingsAt(focus) {
  window.dispatchEvent(new CustomEvent('pk:open-settings', { detail: { focus } }));
}

const LABEL = { image: 'Bild', gif: 'GIF', gifv: 'GIF', video: 'Video' };

export default function MediaGate({ kind, name, children }) {
  const [mode, setMode] = useState(prefs.get().media);
  const [once, setOnce] = useState(false);
  const [ask, setAsk] = useState(false);
  useEffect(() => prefs.subscribe((p) => setMode(p.media)), []);

  if (mode === 'immer' || once) return children;

  const label = `${kind === 'video' ? '🎬' : '🖼'} ${LABEL[kind] || 'Medium'}${name ? `: ${name}` : ''}`;
  if (mode === 'nie') {
    return (
      <div className="media-off">
        <span>{label}</span>
        <span className="media-off__note">
          <b>PK</b> Medien sind in den Einstellungen aus ·{' '}
          <button className="linklike" onClick={() => openSettingsAt('media')}>
            Hier aktivieren
          </button>
        </span>
      </div>
    );
  }
  return (
    <div className="media-off">
      <span>{label}</span>
      <button className="btn btn--small" onClick={() => setAsk(true)}>
        ▶ Anzeigen
      </button>
      {ask && (
        <div className="modal-backdrop" onMouseDown={() => setAsk(false)}>
          <div className="modal confirm" role="dialog" aria-label="Medien laden?" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Medien laden?</h3>
            <p>
              Bilder, GIFs und Videos kommen über die Server von Discord. Discord sieht dabei deine IP-Adresse, so wie in der normalen Discord-App. Fremde Webseiten sehen sie nicht: PKMessenger lädt nur über
              Discords Zwischenserver.
            </p>
            <p className="muted small">Du kannst das jederzeit in den Einstellungen unter „Datenschutz“ ändern.</p>
            <div className="confirm__actions">
              <button className="btn btn--ghost" onClick={() => setAsk(false)}>
                Abbrechen
              </button>
              <button
                className="btn"
                onClick={() => {
                  setAsk(false);
                  setOnce(true);
                }}
              >
                Nur dieses
              </button>
              <button
                className="btn btn--primary"
                autoFocus
                onClick={() => {
                  setAsk(false);
                  prefs.set({ media: 'immer' });
                }}
              >
                Immer laden (nicht mehr fragen)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
