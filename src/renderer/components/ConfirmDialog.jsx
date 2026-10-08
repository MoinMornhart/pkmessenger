import { useEffect, useRef } from 'react';

export default function ConfirmDialog({ title, children, actions, onClose }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    ref.current?.querySelector('button[data-autofocus]')?.focus();
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal confirm" ref={ref} role="alertdialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="confirm__body">{children}</div>
        <div className="confirm__actions">
          {actions.map((a) => (
            <button key={a.label} className={`btn ${a.kind ? `btn--${a.kind}` : ''}`} data-autofocus={a.autoFocus ? '' : undefined} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
