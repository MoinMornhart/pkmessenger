import { useEffect, useState } from 'react';

// Umfrage erstellen – Limits wie bei Discord: Frage 300, 1–10 Antworten à 55 Zeichen, Laufzeit bis 32 Tage.
const DURATIONS = [
  [1, '1 Stunde'],
  [4, '4 Stunden'],
  [8, '8 Stunden'],
  [24, '1 Tag'],
  [72, '3 Tage'],
  [168, '1 Woche'],
  [336, '2 Wochen'],
];

export default function PollDialog({ onClose, onAdd }) {
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState(['', '']);
  const [hours, setHours] = useState(24);
  const [multi, setMulti] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filled = answers.map((a) => a.trim()).filter(Boolean);
  const dupes = new Set(filled.map((a) => a.toLowerCase())).size !== filled.length;
  const ok = question.trim() && question.length <= 300 && filled.length >= 1 && !dupes;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal poll-dialog" role="dialog" aria-label="Umfrage erstellen" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings__head">
          <h3>📊 Umfrage erstellen</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        <label className="settings__label" htmlFor="poll-q">
          Frage <span className="muted small">{question.length}/300</span>
        </label>
        <div className="settings__row">
          <input id="poll-q" value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} placeholder="z. B. Wann treffen wir uns?" />
        </div>
        <span className="settings__label">Antworten</span>
        {answers.map((a, i) => (
          <div key={i} className="settings__row">
            <input
              aria-label={`Antwort ${i + 1}`}
              value={a}
              maxLength={55}
              onChange={(e) => setAnswers((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`Antwort ${i + 1}`}
            />
            {answers.length > 1 && (
              <button className="icon-btn" onClick={() => setAnswers((l) => l.filter((_, j) => j !== i))} aria-label={`Antwort ${i + 1} entfernen`}>
                ×
              </button>
            )}
          </div>
        ))}
        {answers.length < 10 && (
          <button className="btn btn--small btn--ghost" onClick={() => setAnswers((l) => [...l, ''])}>
            + Antwort
          </button>
        )}
        {dupes && <p className="warn small">Antworten dürfen nicht doppelt vorkommen.</p>}
        <div className="poll-dialog__opts">
          <label className="settings__label" htmlFor="poll-dur">
            Laufzeit
          </label>
          <select id="poll-dur" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {DURATIONS.map(([h, l]) => (
              <option key={h} value={h}>
                {l}
              </option>
            ))}
          </select>
          <label className="composer__ping">
            <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> Mehrere Antworten erlauben
          </label>
        </div>
        <p className="muted small">Abstimmen können die Mitglieder in Discord. Bots dürfen laut Discord nicht selbst abstimmen.</p>
        <div className="confirm__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn--primary" disabled={!ok} onClick={() => onAdd({ question: question.trim(), answers: filled, durationHours: hours, allowMultiselect: multi })}>
            Zur Nachricht hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}
