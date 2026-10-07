import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Rechtsklick-Menü (Issue #1). items: [{ label, icon, onClick, danger, disabled, hint } | { separator: true }]
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [sel, setSel] = useState(-1);

  // Im Fenster halten (nicht über den Rand hinaus)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) });
    el.focus();
  }, [x, y]);

  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && onClose();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    document.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const usable = items.map((it, i) => (!it.separator && !it.disabled ? i : -1)).filter((i) => i >= 0);
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const cur = usable.indexOf(sel);
      const next = e.key === 'ArrowDown' ? usable[(cur + 1) % usable.length] : usable[(cur - 1 + usable.length) % usable.length];
      setSel(next ?? -1);
    } else if (e.key === 'Enter' && sel >= 0) {
      e.preventDefault();
      items[sel].onClick?.();
      onClose();
    }
  };

  return (
    <div ref={ref} className="ctx-menu" role="menu" tabIndex={-1} style={pos} onKeyDown={onKeyDown} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it.separator ? (
          <div key={`s${i}`} className="ctx-menu__sep" role="separator" />
        ) : (
          <button
            key={it.label}
            role="menuitem"
            className={`ctx-menu__item ${it.danger ? 'is-danger' : ''} ${i === sel ? 'is-sel' : ''}`}
            disabled={it.disabled}
            title={it.hint || ''}
            onMouseEnter={() => setSel(i)}
            onClick={() => {
              it.onClick?.();
              onClose();
            }}
          >
            <span className="ctx-menu__icon" aria-hidden="true">
              {it.icon}
            </span>
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
