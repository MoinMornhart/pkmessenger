export default function Toasts({ toasts, onClose }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <div className="toast__body">
            <strong>{t.title}</strong>
            {t.text && <span>{t.text}</span>}
          </div>
          <button className="icon-btn" aria-label="Schließen" onClick={() => onClose(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
