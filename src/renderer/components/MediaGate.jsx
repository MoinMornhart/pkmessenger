import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { prefs } from '../prefs';

// #98: Only ONE "Medien laden?" dialog may be open at a time. Opening a new one closes the previous one.
// The dialog is rendered via a portal into document.body: message rows live inside a virtualized list whose
// rows use CSS transforms, which trap `position: fixed` and made two dialogs fight each other on screen.
let closeOpenGate = null;

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
  const [ask, setAskRaw] = useState(false);
  const closerRef = useRef(null);
  useEffect(() => prefs.subscribe((p) => setMode(p.media)), []);
  // Single-open guard: opening this dialog closes any other open media dialog first.
  // The global closer is only cleared if it still belongs to THIS instance (no race with a newer dialog).
  const release = () => {
    if (closeOpenGate && closeOpenGate === closerRef.current) closeOpenGate = null;
  };
  const setAsk = (on) => {
    if (on) {
      if (closeOpenGate && closeOpenGate !== closerRef.current) closeOpenGate();
      closerRef.current = () => setAskRaw(false);
      closeOpenGate = closerRef.current;
    } else release();
    setAskRaw(on);
  };
  useEffect(() => release, []); // unmount (e.g. row scrolled out of the virtual list)

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
      {ask &&
        createPortal(
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
          </div>,
          document.body,
        )}
    </div>
  );
}
