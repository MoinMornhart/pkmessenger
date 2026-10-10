import { useState } from 'react';

// Einklappbarer Bereich (#131): standardmäßig ZU; ob er offen ist, merkt sich die App pro Bereich (nur auf diesem Gerät).
const KEY = 'pk.folds';
function readOpen() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function saveOpen(id, open) {
  try {
    const all = readOpen();
    if (open) all[id] = true;
    else delete all[id];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ohne Speicher: einfach wieder zu */
  }
}

export default function Fold({ id, title, hint = '', badge = null, className = 'ai-card', defaultOpen = false, children }) {
  const [open, setOpen] = useState(() => (id ? readOpen()[id] ?? defaultOpen : defaultOpen));
  return (
    <details
      className={className}
      open={open}
      data-fold={id || undefined}
      onToggle={(e) => {
        const now = e.currentTarget.open;
        if (now === open) return;
        setOpen(now);
        if (id) saveOpen(id, now);
      }}
    >
      <summary title={hint || undefined}>
        {title}
        {badge != null && <span className="fold__badge">{badge}</span>}
      </summary>
      {/* immer gerendert: eingeklappt gehen keine ungespeicherten Eingaben verloren */}
      <div className="fold__body">{children}</div>
    </details>
  );
}
