import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { api } from '../api';
import { pc } from '../platform';

// „Bot einladen lassen“ (Wunsch MoinMornhart 08.10.2026): Wer PKMessenger nutzt, braucht KEIN eigenes Discord-Konto,
// um den Bot auf einen Server zu holen. Den offiziellen Einladungslink öffnet eine Admin/ein Admin des Servers
// mit dem eigenen Konto (Discord verlangt dafür das Recht „Server verwalten“). Link, QR-Code und fertige Nachricht
// zum Weiterschicken. Sobald der Bot auf einem neuen Server ist, meldet sich das Fenster von selbst.
export default function InviteDialog({ guilds = [], onClose, toast }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const startCount = useRef(guilds.length);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    api
      .getInviteUrl()
      .then((u) => (u ? setUrl(u) : setError('Der Link erscheint, sobald ein Bot-Token gespeichert ist.')))
      .catch((e) => setError(e.message));
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Bot ist auf einem neuen Server → kurz Bescheid geben und schließen
  useEffect(() => {
    if (guilds.length > startCount.current) {
      toast?.({ kind: 'info', title: 'Der Bot ist jetzt auf dem Server ✓', text: 'Er erscheint links in der Leiste.', duration: 4000 });
      closeRef.current();
    }
  }, [guilds.length, toast]);

  const qr = useMemo(() => {
    if (!url) return null;
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    return q.createDataURL(5, 2);
  }, [url]);

  const message = url
    ? `Hallo! Kannst du bitte meinen Bot auf deinen Discord-Server holen? Einfach diesen Link öffnen, den Server auswählen und auf „Autorisieren“ klicken:\n${url}\n(Dafür brauchst du auf dem Server das Recht „Server verwalten“. Der Bot bekommt nur die Rechte, die im Link stehen – du kannst sie dort auch abwählen.)`
    : '';
  const copy = (text, title) =>
    api
      .copyText({ text })
      .then(() => toast?.({ kind: 'info', title, duration: 2000 }))
      .catch((e) => toast?.({ kind: 'error', title: e.message }));

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal invite" role="dialog" aria-label="Bot einladen lassen" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings__head">
          <h3>🤝 Bot auf einen Server holen</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        <p>
          <b>Du brauchst dafür kein eigenes Discord-Konto.</b> Schick den Link an eine Admin oder einen Admin des Servers. Sie öffnet ihn mit dem eigenen Konto, wählt den Server und klickt „Autorisieren“ – fertig.
        </p>
        {error && <p className="muted">{error}</p>}
        {url && (
          <div className="invite__box">
            {qr && <img className="invite__qr" src={qr} alt="QR-Code mit dem Einladungslink" />}
            <div className="invite__actions">
              <button className="btn btn--primary" onClick={() => copy(message, 'Nachricht kopiert – jetzt an die Admin schicken')}>
                📨 Nachricht für die Admin kopieren
              </button>
              <button className="btn btn--ghost" onClick={() => copy(url, 'Link kopiert')}>
                🔗 Nur den Link kopieren
              </button>
              <button className="btn btn--ghost" onClick={() => api.openExternal({ url }).catch(() => {})}>
                ↗ Selbst öffnen (wenn du Admin bist)
              </button>
              <p className="muted small">{pc('Mit dem Handy scannen: Die Admin kann den QR-Code auch direkt vom Bildschirm abfotografieren.', 'Die Admin kann den QR-Code auch direkt von deinem Bildschirm scannen.')}</p>
            </div>
          </div>
        )}
        <ol className="invite__steps">
          <li>Die Admin öffnet den Link (im Browser oder in der Discord-App).</li>
          <li>
            Bei <b>„Zu Server hinzufügen“</b> den Server wählen, <b>„Weiter“</b>.
          </li>
          <li>
            Rechte prüfen, <b>„Autorisieren“</b> klicken, ggf. Captcha lösen.
          </li>
          <li>Der Bot erscheint hier automatisch – dieses Fenster schließt sich dann von selbst.</li>
        </ol>
        <p className="muted small">
          💡 Ein Discord-Konto braucht nur, wer den Bot im Entwicklerportal <i>anlegt</i> (einmalig). Zum Benutzen von PKMessenger und zum Einladen auf Server reicht der Bot-Token.
        </p>
      </div>
    </div>
  );
}
