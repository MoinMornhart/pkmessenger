import { useEffect, useState } from 'react';
import { api } from '../api';
import { prefs } from '../prefs';

// „Das ist neu“ nach einem Update (Issue #44, Kommentar 19:05): zeigt einmal kurz die Änderungen aller Versionen
// seit der zuletzt gesehenen. Abschaltbar unter Einstellungen → Updates. Beim allerersten Start nichts zeigen.

const cmp = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

/** Releases zwischen „seit“ (ausschließlich) und „jetzt“ (einschließlich). */
export function releasesSince(releases, since, current) {
  return (releases || []).filter((r) => {
    const v = String(r.tag || '').replace(/^v/, '');
    return cmp(v, since) > 0 && cmp(v, current) <= 0;
  });
}

export default function WhatsNew({ version }) {
  const [data, setData] = useState(null); // { since, releases }

  useEffect(() => {
    if (!version) return undefined;
    const p = prefs.get();
    const since = p.lastSeenVersion;
    if (!since) {
      prefs.set({ lastSeenVersion: version }); // erster Start: nichts anzeigen
      return undefined;
    }
    if (cmp(version, since) <= 0 || !p.showWhatsNew) {
      if (cmp(version, since) > 0) prefs.set({ lastSeenVersion: version });
      return undefined;
    }
    let off = false;
    api
      .updateChanges()
      .then((r) => {
        if (off) return;
        const list = releasesSince(r?.releases, since, version);
        setData({ since, releases: list });
      })
      .catch(() => !off && setData({ since, releases: [] }));
    return () => {
      off = true;
    };
  }, [version]);

  useEffect(() => {
    const onShow = (e) => {
      const since = e.detail?.since || '0.0.0';
      api
        .updateChanges()
        .then((r) => setData({ since, releases: releasesSince(r?.releases, since, version || '999.0.0') }))
        .catch(() => setData({ since, releases: [] }));
    };
    window.addEventListener('pk:whats-new', onShow);
    return () => window.removeEventListener('pk:whats-new', onShow);
  }, [version]);

  if (!data) return null;
  const close = () => {
    prefs.set({ lastSeenVersion: version });
    setData(null);
  };
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal whats-new" role="dialog" aria-label="Das ist neu" onMouseDown={(e) => e.stopPropagation()}>
        <h3>🎉 Update installiert: v{version}</h3>
        <p className="muted small">Das hat sich seit v{data.since} geändert:</p>
        {data.releases.length === 0 ? (
          <p className="small">Die Änderungen konnten gerade nicht geladen werden. Du findest sie unter Einstellungen → Updates → „Was ist neu?“.</p>
        ) : (
          <div className="whats-new__list">
            {data.releases.map((r) => (
              <div key={r.tag}>
                <b>{r.name}</b>
                <ul>
                  {(r.notes.length ? r.notes : ['Kleine Verbesserungen und Fehlerkorrekturen']).map((n) => (
                    <li key={n}>{/^(fix|behoben|repar|fehler)/i.test(n) ? '🔧' : '✨'} {n}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <label className="composer__ping">
          <input type="checkbox" checked={!prefs.get().showWhatsNew} onChange={(e) => prefs.set({ showWhatsNew: !e.target.checked })} /> Nach Updates nicht mehr anzeigen
        </label>
        <div className="confirm__actions">
          <button className="btn btn--primary" autoFocus onClick={close}>
            Super, weiter
          </button>
        </div>
      </div>
    </div>
  );
}
