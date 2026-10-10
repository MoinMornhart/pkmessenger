import { useEffect, useState } from 'react';
import { api } from '../api';
import Fold from './Fold';

// Bot-Module (Beta, #131 – Vorbild Moin_Julia): kleine Zusatzfunktionen pro Server, einzeln an/aus und einstellbar.
export default function ModulesSection({ guilds = [], targets = [], toast }) {
  const [guildId, setGuildId] = useState(guilds[0]?.id || '');
  const [mods, setMods] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!guildId && guilds[0]) setGuildId(guilds[0].id);
  }, [guilds, guildId]);
  useEffect(() => {
    if (!guildId) return;
    setMods(null);
    api
      .modulesList({ guildId })
      .then(setMods)
      .catch((e) => setError(e.message));
  }, [guildId]);

  const save = async (m, patch) => {
    setError('');
    try {
      setMods(await api.modulesSet({ guildId, moduleId: m.id, enabled: patch.enabled ?? m.enabled, config: patch.config ?? m.config }));
      return true;
    } catch (e) {
      setError(e.message);
      toast?.({ kind: 'warn', title: 'Nicht gespeichert', text: e.message });
      return false;
    }
  };
  const reset = async (m) => setMods(await api.modulesReset({ guildId, moduleId: m.id }).catch(() => mods));
  const channels = targets.filter((t) => !t.dm && t.guildId === guildId);
  const active = mods?.filter((m) => m.enabled).length || 0;

  return (
    <Fold id="modules" className="ai-card ai-all" title="🧩 Bot-Module" badge={mods ? `${active} an` : null} hint="Zusatzfunktionen für deinen Bot – pro Server einzeln an/aus">
      <p className="muted small">Kleine Zusatzfunktionen für deinen Bot, pro Server einzeln an- und ausschaltbar. Sie laufen, solange PKMessenger offen ist. Der Bot pingt dabei nie jemanden.</p>
      {guilds.length === 0 ? (
        <p className="muted small">Der Bot ist auf keinem Server.</p>
      ) : (
        <div className="settings__row ai-target">
          <select aria-label="Server für Module" value={guildId} onChange={(e) => setGuildId(e.target.value)}>
            {guilds.map((g) => (
              <option key={g.id} value={g.id}>
                🖥 {g.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && (
        <p className="warn small" role="alert">
          {error}
        </p>
      )}
      {mods?.map((m) => (
        <Fold key={m.id} id={`module-${m.id}`} className="ai-mode module-card" title={`${m.icon} ${m.title}`} badge={m.enabled ? 'an' : 'aus'} hint={m.desc}>
          <p className="muted small">{m.desc}</p>
          <label className="composer__ping" data-setting={`module-${m.id}`}>
            <input type="checkbox" checked={m.enabled} onChange={(e) => save(m, { enabled: e.target.checked })} /> Auf diesem Server einschalten
          </label>
          {m.id === 'autoreply' && <AutoReplyEditor m={m} onSave={(config) => save(m, { config })} />}
          {m.id === 'counting' && (
            <>
              <div className="settings__row ai-target">
                <select aria-label="Zähl-Kanal" value={m.config.channelId} onChange={(e) => save(m, { config: { channelId: e.target.value } })}>
                  <option value="">– Kanal wählen –</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="small">
                Stand: <b>{m.info.current}</b> · Rekord: <b>{m.info.best}</b>{' '}
                <button className="link-btn" onClick={() => reset(m)}>
                  zurücksetzen
                </button>
              </p>
            </>
          )}
          {m.id === 'levels' && (
            <>
              <label className="composer__ping">
                <input type="checkbox" checked={m.config.announce} onChange={(e) => save(m, { config: { announce: e.target.checked } })} /> Neues Level im Chat ankündigen
              </label>
              <p className="small">
                {m.info.people} Personen mit Punkten ·{' '}
                <button className="link-btn" onClick={() => reset(m)}>
                  alle Punkte löschen
                </button>
              </p>
            </>
          )}
        </Fold>
      ))}
    </Fold>
  );
}

function AutoReplyEditor({ m, onSave }) {
  const [rules, setRules] = useState(m.config.rules);
  const dirty = JSON.stringify(rules) !== JSON.stringify(m.config.rules);
  const update = (i, patch) => setRules(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="module-rules">
      {rules.map((r, i) => (
        <div key={i} className="module-rule">
          <div className="settings__row">
            <input aria-label="Stichwort" value={r.trigger} maxLength={100} placeholder="Stichwort, z. B. !regeln" onChange={(e) => update(i, { trigger: e.target.value })} />
            <select aria-label="Wann antworten" value={r.match} onChange={(e) => update(i, { match: e.target.value })}>
              <option value="genau">genau dieses Wort</option>
              <option value="enthaelt">wenn es vorkommt</option>
            </select>
            <button className="btn btn--ghost btn--small" aria-label="Auto-Antwort löschen" onClick={() => setRules(rules.filter((_, j) => j !== i))}>
              🗑
            </button>
          </div>
          <textarea className="profile__desc" rows={2} maxLength={2000} value={r.reply} placeholder="Antwort des Bots" onChange={(e) => update(i, { reply: e.target.value })} />
        </div>
      ))}
      <div className="settings__row">
        {rules.length < 50 && (
          <button className="btn btn--ghost btn--small" onClick={() => setRules([...rules, { trigger: '', reply: '', match: 'genau' }])}>
            ＋ Auto-Antwort
          </button>
        )}
        {dirty && (
          // ganz leere Zeilen fallen beim Speichern einfach weg
          <button className="btn btn--primary btn--small" onClick={async () => { const clean = rules.filter((r) => r.trigger.trim() || r.reply.trim()); if (await onSave({ rules: clean })) setRules(clean); }}>
            Speichern
          </button>
        )}
      </div>
    </div>
  );
}
