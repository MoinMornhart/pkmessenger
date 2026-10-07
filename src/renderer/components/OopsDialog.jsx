import { useEffect, useState } from 'react';
import { api } from '../api';

// „Ups …“ (Issue #1): Bei einem unerwarteten Fehler zeigt die App einen Fehlerbericht (englisch, ohne Geheimnisse).
// Erst kopieren, dann öffnet sich die GitHub-Seite für ein neues Issue – dort einfügen (Strg+V) und abschicken.
// Gesendet wird NICHTS automatisch: Der Mensch entscheidet. Ohne GitHub-Konto: Text an MoinMornhart schicken.
export function reportError(where, error) {
  window.dispatchEvent(new CustomEvent('pk:oops', { detail: { where, error: String(error?.stack || error?.message || error || 'unknown').slice(0, 1500) } }));
}

const ISSUE_URL = 'https://github.com/Morni-Team/pkmessenger/issues/new';

export default function OopsDialog() {
  const [oops, setOops] = useState(null); // { where, error, report }
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onOops = async (e) => {
      const { where, error } = e.detail || {};
      api.logError({ where, message: error }).catch(() => {});
      let report = '';
      try {
        report = await api.errorReport({ where, error });
      } catch {
        report = `### PKMessenger error report\n- Where: ${where}\n- Error: ${error}`;
      }
      setCopied(false);
      setOops((cur) => cur || { where, error, report }); // nur der erste Fehler zählt, keine Fenster-Lawine
    };
    window.addEventListener('pk:oops', onOops);
    return () => window.removeEventListener('pk:oops', onOops);
  }, []);

  if (!oops) return null;
  const inTour = Boolean(document.querySelector('.tour'));
  const copy = () =>
    api
      .copyText({ text: oops.report })
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  const openIssue = () => {
    const title = `Fehler: ${String(oops.error).split('\n')[0].slice(0, 80)}`;
    const body = 'Bitte hier den kopierten Fehlerbericht einfügen (Strg+V) und kurz schreiben, was du gerade gemacht hast.\n\n';
    api.openExternal({ url: `${ISSUE_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}` }).catch(() => {});
  };
  return (
    <div className="modal-backdrop oops-backdrop">
      <div className="modal confirm oops" role="alertdialog" aria-label="Ups, ein Fehler">
        <h3>😵 Ups …</h3>
        <p>{inTour ? 'Eigentlich wollte ich dir gerade was zeigen, ABER da ist etwas schiefgelaufen.' : 'Da ist etwas schiefgelaufen, das hätte nicht passieren sollen.'} Hilf mit, es zu reparieren:</p>
        <ol className="oops__steps">
          <li className={copied ? 'is-done' : ''}>Fehlerbericht kopieren {copied && '✓'}</li>
          <li>GitHub öffnen, einfügen (Strg+V), abschicken</li>
        </ol>
        <textarea className="oops__report" readOnly value={oops.report} rows={7} aria-label="Fehlerbericht" onFocus={(e) => e.target.select()} />
        <p className="muted small">Der Bericht ist auf Englisch und enthält keine Passwörter, Tokens oder Nachrichten. Ohne GitHub-Konto: Text einfach an MoinMornhart schicken.</p>
        <div className="confirm__actions">
          <button className="btn btn--ghost" onClick={() => setOops(null)}>
            Schließen
          </button>
          <button className="btn" onClick={copy}>
            📋 {copied ? 'Kopiert ✓' : 'Kopieren'}
          </button>
          <button className="btn btn--primary" disabled={!copied} title={copied ? '' : 'Erst kopieren'} onClick={openIssue}>
            🐙 Auf GitHub melden
          </button>
        </div>
      </div>
    </div>
  );
}
