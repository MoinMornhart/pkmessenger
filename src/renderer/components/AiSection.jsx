import { useCallback, useEffect, useState } from 'react';
import { api, onEvent } from '../api';
import { describeSchedule, DAY_NAMES } from '../../shared/schedule';
import { formatListTime } from '../../shared/format';

// KI-Agenten (Beta): beliebiger Anbieter, zeitgesteuerte Aufträge, Ergebnis postet der Bot.
const PRESETS = [
  { id: 'openai', label: 'OpenAI (ChatGPT)', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: '' },
  { id: 'anthropic', label: 'Anthropic (Claude)', provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5' },
  { id: 'openrouter', label: 'OpenRouter (viele Modelle)', provider: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: '' },
  { id: 'gemini', label: 'Google Gemini', provider: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: '' },
  { id: 'groq', label: 'Groq', provider: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: '' },
  { id: 'mistral', label: 'Mistral', provider: 'openai', baseUrl: 'https://api.mistral.ai/v1', model: '' },
  { id: 'ollama', label: 'Ollama (lokal, ohne Schlüssel)', provider: 'openai', baseUrl: 'http://localhost:11434/v1', model: '' },
];
const presetOf = (cfg) => PRESETS.find((p) => p.provider === cfg.provider && p.baseUrl === cfg.baseUrl)?.id || 'custom';

const INTERVALS = [15, 30, 60, 120, 240, 720, 1440];
const intervalLabel = (m) => describeSchedule({ kind: 'interval', minutes: m });
const WEEK = [1, 2, 3, 4, 5, 6, 0];

const JOB_DEFAULTS = { maxLength: 1800, language: 'auto', persona: '', contextSize: 0, postAs: 'message', notify: true };
// Nur die Felder, die der Validator kennt (keine lastRun/nextRun usw. zurückschicken)
const jobPayload = (j) => ({
  ...(j.id ? { id: j.id } : {}),
  name: j.name,
  channelId: j.channelId,
  channelName: j.channelName,
  prompt: j.prompt,
  schedule: j.schedule,
  context: j.contextSize > 0,
  enabled: j.enabled,
  maxLength: j.maxLength,
  language: j.language,
  persona: j.persona,
  contextSize: j.contextSize,
  postAs: j.postAs,
  notify: j.notify,
});

function JobForm({ targets, initial, onSave, onCancel, toast }) {
  const [job, setJob] = useState({
    ...JOB_DEFAULTS,
    ...(initial || { name: '', channelId: targets[0]?.id || '', prompt: '', schedule: { kind: 'daily', time: '08:00', days: [1, 2, 3, 4, 5] }, enabled: true }),
  });
  const [preview, setPreview] = useState(null); // { text, durationMs, model } | 'busy'
  const runPreview = async () => {
    setPreview('busy');
    try {
      setPreview(await api.aiPreviewJob(jobPayload({ ...job, channelName: targets.find((t) => t.id === job.channelId)?.label || '' })));
    } catch (e) {
      setPreview(null);
      toast?.({ kind: 'error', title: e.message, text: e.hint });
    }
  };
  const set = (patch) => setJob((j) => ({ ...j, ...patch }));
  const setSchedule = (patch) => setJob((j) => ({ ...j, schedule: { ...j.schedule, ...patch } }));
  const daily = job.schedule.kind === 'daily';
  const ok = job.name.trim() && job.prompt.trim().length >= 3 && job.channelId && (!daily || job.schedule.days.length > 0);

  return (
    <div className="ai-job-form">
      <label className="settings__label" htmlFor="ai-job-name">
        Name
      </label>
      <div className="settings__row">
        <input id="ai-job-name" value={job.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder="z. B. Morgengruß" />
      </div>
      <label className="settings__label" htmlFor="ai-job-prompt">
        Auftrag an die KI <span className="muted small">{job.prompt.length}/2000</span>
      </label>
      <textarea
        id="ai-job-prompt"
        className="profile__desc"
        rows={3}
        maxLength={2000}
        value={job.prompt}
        onChange={(e) => set({ prompt: e.target.value })}
        placeholder="z. B. Schreib einen kurzen, lustigen Guten-Morgen-Gruß für den Server mit einem Tipp des Tages."
      />
      <label className="settings__label" htmlFor="ai-job-target">
        Wohin posten?
      </label>
      <select id="ai-job-target" value={job.channelId} onChange={(e) => set({ channelId: e.target.value })}>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <label className="settings__label">Wann?</label>
      <div className="settings__row">
        <select value={daily ? 'daily' : 'interval'} onChange={(e) => setSchedule(e.target.value === 'daily' ? { kind: 'daily', time: '08:00', days: [1, 2, 3, 4, 5], minutes: undefined } : { kind: 'interval', minutes: 60, time: undefined, days: undefined })}>
          <option value="daily">Zu einer Uhrzeit</option>
          <option value="interval">Regelmäßig alle …</option>
        </select>
        {daily ? (
          <input type="time" value={job.schedule.time} onChange={(e) => setSchedule({ time: e.target.value })} aria-label="Uhrzeit" className="ai-time" />
        ) : (
          <select value={job.schedule.minutes} onChange={(e) => setSchedule({ minutes: Number(e.target.value) })} aria-label="Abstand">
            {INTERVALS.map((m) => (
              <option key={m} value={m}>
                {intervalLabel(m)}
              </option>
            ))}
          </select>
        )}
      </div>
      {daily && (
        <div className="ai-days" role="group" aria-label="Wochentage">
          {WEEK.map((d) => (
            <button
              key={d}
              className={job.schedule.days.includes(d) ? 'is-on' : ''}
              aria-pressed={job.schedule.days.includes(d)}
              onClick={() => setSchedule({ days: job.schedule.days.includes(d) ? job.schedule.days.filter((x) => x !== d) : [...job.schedule.days, d] })}
            >
              {DAY_NAMES[d]}
            </button>
          ))}
        </div>
      )}
      <div className="ai-opts">
        <label>
          Länge
          <select value={job.maxLength} onChange={(e) => set({ maxLength: Number(e.target.value) })}>
            {[300, 800, 1500, 1800, 2000].map((n) => (
              <option key={n} value={n}>
                max. {n} Zeichen
              </option>
            ))}
          </select>
        </label>
        <label>
          Sprache
          <select value={job.language} onChange={(e) => set({ language: e.target.value })}>
            <option value="auto">wie der Auftrag</option>
            <option value="de">Deutsch</option>
            <option value="en">Englisch</option>
          </select>
        </label>
        <label>
          Kontext
          <select value={job.contextSize} onChange={(e) => set({ contextSize: Number(e.target.value) })}>
            <option value={0}>keiner</option>
            <option value={10}>letzte 10 Nachrichten</option>
            <option value={20}>letzte 20 Nachrichten</option>
            <option value={50}>letzte 50 Nachrichten</option>
          </select>
        </label>
        <label>
          Posten als
          <select value={job.postAs} onChange={(e) => set({ postAs: e.target.value })}>
            <option value="message">Nachricht</option>
            <option value="thread">neuer Thread</option>
          </select>
        </label>
      </div>
      {job.contextSize > 0 && <p className="muted small">⚠ Diese Nachrichten gehen an deinen KI-Anbieter. Für die KI sind sie nur Daten, keine Anweisungen.</p>}
      <label className="settings__label" htmlFor="ai-job-persona">
        Tonfall / Persona <span className="muted small">(optional)</span>
      </label>
      <div className="settings__row">
        <input id="ai-job-persona" value={job.persona} maxLength={300} onChange={(e) => set({ persona: e.target.value })} placeholder="z. B. locker, mit Emojis, wie ein Sportmoderator" />
      </div>
      <label className="composer__ping">
        <input type="checkbox" checked={job.notify} onChange={(e) => set({ notify: e.target.checked })} /> Hinweis in der App bei Erfolg oder Fehler
      </label>
      {preview && preview !== 'busy' && (
        <div className="ai-preview" role="status">
          <div className="muted small">
            👁 Vorschau – wird NICHT gepostet · {preview.model} · {(preview.durationMs / 1000).toFixed(1)} s
          </div>
          <div className="ai-preview__text">{preview.text}</div>
        </div>
      )}
      <div className="confirm__actions">
        <button className="btn btn--ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button className="btn" disabled={!ok || preview === 'busy'} onClick={runPreview} title="Die KI schreibt eine Probe – es wird nichts gepostet">
          {preview === 'busy' ? 'KI schreibt …' : '👁 Vorschau'}
        </button>
        <button className="btn btn--primary" disabled={!ok} onClick={() => onSave(jobPayload({ ...job, channelName: targets.find((t) => t.id === job.channelId)?.label || '' }))}>
          Auftrag speichern
        </button>
      </div>
    </div>
  );
}

// Personen aus der Mitgliederliste der Server suchen und hinzufügen
function PeoplePicker({ label, people, onChange, guilds }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!query.trim() || !guilds.length) {
      setItems([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const found = new Map();
      for (const g of guilds.slice(0, 5)) {
        const res = await api.searchMentionables({ guildId: g.id, query: query.trim().slice(0, 32) }).catch(() => []);
        for (const u of res) if (u.kind === 'user' && !found.has(u.id)) found.set(u.id, { id: u.id, name: u.display });
      }
      if (!cancelled) setItems([...found.values()].filter((u) => !people.some((p) => p.id === u.id)).slice(0, 6));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, guilds, people]);
  return (
    <div className="ai-people">
      <span className="settings__label">{label}</span>
      <div className="ai-chips">
        {people.map((p) => (
          <span key={p.id} className="ai-chip">
            {p.name}
            <button aria-label={`${p.name} entfernen`} onClick={() => onChange(people.filter((x) => x.id !== p.id))}>
              ×
            </button>
          </span>
        ))}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name suchen …" aria-label={`${label}: Name suchen`} />
      </div>
      {items.length > 0 && (
        <div className="ai-suggest">
          {items.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                onChange([...people, u]);
                setQuery('');
              }}
            >
              ＋ {u.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Antwort-Agent: antwortet als Bot, wenn er in zugewiesenen Kanälen erwähnt (oder privat angeschrieben) wird
function ResponderSection({ cfg, targets, guilds, toast }) {
  const [r, setR] = useState(cfg.responder);
  const [busy, setBusy] = useState(false);
  const channels = targets.filter((t) => !t.dm);
  const dirty = JSON.stringify(r) !== JSON.stringify(cfg.responder);
  const set = (patch) => setR((x) => ({ ...x, ...patch }));
  const save = async () => {
    setBusy(true);
    try {
      await api.aiSetResponder(r);
      toast({ kind: 'info', title: 'Gespeichert ✓', text: r.enabled ? 'Der Bot antwortet jetzt, wenn er erwähnt wird.' : 'Automatische Antworten sind aus.', duration: 2500 });
    } catch (e) {
      toast({ kind: 'error', title: e.message, text: e.hint });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ai-responder">
      <h4 className="ai-jobs__title">💬 Auf Erwähnungen antworten</h4>
      <label className="composer__ping">
        <input type="checkbox" checked={r.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Bot antwortet mit KI, wenn ihn jemand erwähnt
      </label>
      {r.enabled && (
        <>
          <span className="settings__label">In diesen Kanälen</span>
          <div className="ai-channels">
            {channels.length === 0 && <span className="muted small">Kein Kanal, in den der Bot schreiben darf.</span>}
            {channels.map((c) => (
              <label key={c.id} className="ai-channel" title={c.label}>
                <input
                  type="checkbox"
                  checked={r.channelIds.includes(c.id)}
                  onChange={(e) => set({ channelIds: e.target.checked ? [...r.channelIds, c.id] : r.channelIds.filter((x) => x !== c.id) })}
                />{' '}
                {c.label}
              </label>
            ))}
          </div>
          <label className="composer__ping">
            <input type="checkbox" checked={r.dms} onChange={(e) => set({ dms: e.target.checked })} /> Auch in Privatchats antworten (dort ohne Erwähnung)
          </label>
          <PeoplePicker label="Nur diesen Personen antworten (leer = allen)" people={r.allowUsers} onChange={(allowUsers) => set({ allowUsers })} guilds={guilds} />
          <PeoplePicker label="Diese Personen ausschließen" people={r.blockUsers} onChange={(blockUsers) => set({ blockUsers })} guilds={guilds} />
          <label className="settings__label" htmlFor="ai-instr">
            So soll der Bot sein <span className="muted small">{r.instructions.length}/1500</span>
          </label>
          <textarea
            id="ai-instr"
            className="profile__desc"
            rows={3}
            maxLength={1500}
            value={r.instructions}
            onChange={(e) => set({ instructions: e.target.value })}
            placeholder="z. B. Du bist Claw, locker und hilfsbereit. Du kennst die Server-Regeln: …"
          />
          <label className="composer__ping">
            <input type="checkbox" checked={r.context} onChange={(e) => set({ context: e.target.checked })} /> Letzte 20 Nachrichten als Kontext mitschicken
          </label>
          {r.context && <p className="muted small">⚠ Diese Nachrichten gehen dann an deinen KI-Anbieter.</p>}
          <label className="composer__ping">
            <input type="checkbox" checked={r.notify} onChange={(e) => set({ notify: e.target.checked })} /> Hinweis in der App, wenn der Bot geantwortet hat
          </label>
          <p className="muted small">🛑 Schutz: antwortet nie anderen Bots, höchstens alle 15 Sek. pro Kanal und 30× pro Stunde, pingt niemanden.</p>
        </>
      )}
      {dirty && (
        <div className="settings__row">
          <button className="btn btn--primary btn--small" disabled={busy} onClick={save}>
            Speichern
          </button>
          <button className="btn btn--ghost btn--small" onClick={() => setR(cfg.responder)}>
            Verwerfen
          </button>
        </div>
      )}
      {cfg.recent?.length > 0 && (
        <div className="ai-recent">
          <span className="settings__label">Letzte Antworten</span>
          {cfg.recent.map((e, i) => (
            <div key={i} className={`small ${e.ok ? '' : 'warn'}`}>
              {e.ok ? '✓' : '⚠'} {formatListTime(e.at, Date.now())} · {e.userName}: {e.answer}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Harte Limits (gelten für alle KI-Anfragen zusammen)
function LimitsRow({ cfg, onSave }) {
  const [l, setL] = useState(cfg.limits);
  const dirty = l.perHour !== cfg.limits.perHour || l.perDay !== cfg.limits.perDay;
  return (
    <div className="settings__row ai-limits">
      <label>
        Max. pro Stunde
        <input type="number" min="1" max="500" value={l.perHour} onChange={(e) => setL({ ...l, perHour: Math.round(Number(e.target.value)) || 1 })} />
      </label>
      <label>
        Max. pro Tag
        <input type="number" min="1" max="5000" value={l.perDay} onChange={(e) => setL({ ...l, perDay: Math.round(Number(e.target.value)) || 1 })} />
      </label>
      {dirty && (
        <button className="btn btn--primary btn--small" onClick={() => onSave(l)}>
          Limits speichern
        </button>
      )}
    </div>
  );
}

// Anbieterprofile: Anbieter + Adresse + Modell merken (der Schlüssel bleibt im Tresor)
function ProfilesRow({ cfg, setDraft, wrap, setCfg }) {
  const [name, setName] = useState('');
  return (
    <div className="settings__row ai-profiles">
      {cfg.profiles.length > 0 && (
        <select
          aria-label="Gespeichertes Anbieterprofil"
          value=""
          onChange={(e) =>
            e.target.value &&
            wrap('profile', async () => {
              const c = await api.aiUseProfile({ id: e.target.value });
              setCfg(c);
              setDraft({ provider: c.provider, baseUrl: c.baseUrl, model: c.model });
            })()
          }
        >
          <option value="">Profil laden …</option>
          {cfg.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} – {p.model}
            </option>
          ))}
        </select>
      )}
      <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Profilname, z. B. Ollama lokal" aria-label="Profilname" />
      <button className="btn btn--small" disabled={!name.trim()} onClick={wrap('profile', async () => (setCfg(await api.aiSaveProfile({ name })), setName('')))}>
        Aktuelle Einstellung als Profil speichern
      </button>
    </div>
  );
}

export default function AiSection({ toast, targets = [], guilds = [] }) {
  const [cfg, setCfg] = useState(null);
  const [draft, setDraft] = useState(null); // Anbieter-Einstellungen in Bearbeitung
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | job
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      api
        .aiGet()
        .then((c) => {
          setCfg(c);
          setDraft((d) => d || { provider: c.provider, baseUrl: c.baseUrl, model: c.model });
        })
        .catch((e) => setError(e.message)),
    [],
  );
  useEffect(() => {
    load();
    return onEvent((type) => type === 'ai:changed' && load());
  }, [load]);

  if (error) return <p className="muted small">KI-Agenten nicht verfügbar: {error}</p>;
  if (!cfg || !draft) return <p className="muted small">Lade …</p>;

  const wrap = (name, fn) => async () => {
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      toast({ kind: 'error', title: e.message, text: e.hint });
    } finally {
      setBusy('');
    }
  };

  const saveConfig = (enabled) => api.aiSetConfig({ enabled, ...draft }).then(setCfg);
  const toggleBeta = wrap('beta', () => saveConfig(!cfg.enabled));
  const dirty = draft.provider !== cfg.provider || draft.baseUrl !== cfg.baseUrl || draft.model !== cfg.model;

  return (
    <>
      <label className="composer__ping">
        <input type="checkbox" checked={cfg.enabled} disabled={busy === 'beta'} onChange={toggleBeta} /> 🧪 Beta freischalten: KI-Agenten
      </label>
      <p className="muted small">Eine KI erledigt Aufträge zu festen Zeiten (z. B. „jeden Morgen einen Gruß posten“). Gepostet wird als dein Bot. Läuft nur, solange PKMessenger offen ist.</p>
      {cfg.enabled && (
        <div className="ai-box">
          <div className="ai-status" role="status">
            <span>
              🧠 <b>KI an</b> · {cfg.model || 'kein Modell'} ({PRESETS.find((p) => p.baseUrl === cfg.baseUrl)?.label || cfg.baseUrl})
            </span>
            <span>
              🤖 Aufträge aktiv: {cfg.jobs.filter((j) => j.enabled).length}/{cfg.jobs.length} · 💬 Antworten auf Erwähnungen: {cfg.responder.enabled ? 'an' : 'aus'}
            </span>
            <span className={cfg.usage.hour >= cfg.limits.perHour || cfg.usage.day >= cfg.limits.perDay ? 'warn' : ''}>
              📊 Verbrauch: {cfg.usage.hour}/{cfg.limits.perHour} pro Stunde · {cfg.usage.day}/{cfg.limits.perDay} pro Tag
            </span>
            {cfg.running.length > 0 && (
              <button className="btn btn--danger btn--small" onClick={wrap('abort', () => api.aiAbort())}>
                ⏹ Laufende KI-Anfragen stoppen
              </button>
            )}
          </div>
          <LimitsRow cfg={cfg} onSave={(l) => wrap('limits', async () => setCfg(await api.aiSetLimits(l)))()} />
          <ProfilesRow cfg={cfg} draft={draft} setDraft={setDraft} wrap={wrap} setCfg={setCfg} />
          <label className="settings__label" htmlFor="ai-preset">
            KI-Anbieter
          </label>
          <select
            id="ai-preset"
            value={presetOf(draft)}
            onChange={(e) => {
              const p = PRESETS.find((x) => x.id === e.target.value);
              if (p) setDraft({ provider: p.provider, baseUrl: p.baseUrl, model: p.model || draft.model });
              else setDraft({ ...draft, baseUrl: '' });
            }}
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="custom">Eigene Adresse (OpenAI-kompatibel)</option>
          </select>
          {presetOf(draft) === 'custom' && (
            <div className="settings__row">
              <input value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, provider: 'openai', baseUrl: e.target.value })} placeholder="https://…/v1" aria-label="Adresse des Anbieters" />
            </div>
          )}
          <label className="settings__label" htmlFor="ai-model">
            Modell
          </label>
          <div className="settings__row">
            <input id="ai-model" value={draft.model} maxLength={100} onChange={(e) => setDraft({ ...draft, model: e.target.value })} placeholder="Name des Modells beim Anbieter" />
            {dirty && (
              <button className="btn btn--primary btn--small" disabled={busy === 'cfg'} onClick={wrap('cfg', () => saveConfig(true))}>
                Übernehmen
              </button>
            )}
          </div>
          <label className="settings__label" htmlFor="ai-key">
            API-Schlüssel {cfg.hasKey ? <span className="ok small">🔐 gespeichert (verschlüsselt)</span> : <span className="muted small">(bei lokalen Modellen leer lassen)</span>}
          </label>
          <div className="settings__row">
            <input id="ai-key" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder={cfg.hasKey ? 'Neuen Schlüssel eintragen …' : 'Schlüssel vom Anbieter einfügen'} />
            <button
              className="btn btn--small"
              disabled={!key || busy === 'key'}
              onClick={wrap('key', async () => {
                setCfg(await api.aiSetKey({ key }));
                setKey(''); // Schlüssel sofort aus der Oberfläche entfernen
              })}
            >
              Speichern
            </button>
            {cfg.hasKey && (
              <button className="btn btn--ghost btn--small" onClick={wrap('key', async () => setCfg(await api.aiClearKey()))}>
                Entfernen
              </button>
            )}
          </div>
          <div className="settings__row">
            <button
              className="btn btn--small"
              disabled={busy === 'test' || dirty}
              title={dirty ? 'Erst „Übernehmen“ klicken' : ''}
              onClick={wrap('test', async () => {
                const r = await api.aiTest();
                toast({ kind: 'info', title: 'KI antwortet ✓', text: r.reply });
              })}
            >
              {busy === 'test' ? 'Teste …' : '🔌 Verbindung testen'}
            </button>
          </div>

          <ResponderSection key={JSON.stringify(cfg.responder)} cfg={cfg} targets={targets} guilds={guilds} toast={toast} />

          <h4 className="ai-jobs__title">🤖 Aufträge</h4>
          {cfg.jobs.length === 0 && !editing && <p className="muted small">Noch keine Aufträge.</p>}
          {cfg.jobs.map((j) =>
            editing?.id === j.id ? (
              <JobForm
                key={j.id}
                targets={targets}
                initial={j}
                toast={toast}
                onCancel={() => setEditing(null)}
                onSave={(job) =>
                  wrap('save', async () => {
                    await api.aiSaveJob({ ...job, id: j.id });
                    setEditing(null);
                  })()
                }
              />
            ) : (
              <div key={j.id} className={`ai-job ${j.enabled ? '' : 'is-off'}`}>
                <div className="ai-job__main">
                  <b>{j.name}</b>
                  <span className="muted small">
                    {describeSchedule(j.schedule)} → {j.channelName || 'Kanal'}
                    {j.postAs === 'thread' ? ' · als Thread' : ''}
                    {j.contextSize > 0 ? ` · Kontext ${j.contextSize}` : ''}
                  </span>
                  {j.enabled && j.nextRun && (
                    <span className="muted small">⏭ nächster Lauf: {new Date(j.nextRun).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                  {j.lastRun && (
                    <span className={`small ${j.lastRun.ok ? 'ok' : 'warn'}`}>
                      {j.lastRun.ok ? '✓' : '⚠'} {formatListTime(j.lastRun.at, Date.now())}
                      {j.lastRun.durationMs ? ` · ${(j.lastRun.durationMs / 1000).toFixed(1)} s` : ''}
                      {j.lastRun.model ? ` · ${j.lastRun.model}` : ''}: {j.lastRun.message}
                    </span>
                  )}
                </div>
                <div className="ai-job__actions">
                  <label className="ai-switch" title={j.enabled ? 'Aktiv' : 'Pausiert'}>
                    <input
                      type="checkbox"
                      checked={j.enabled}
                      onChange={wrap('save', () =>
                        api.aiSaveJob(jobPayload({ ...JOB_DEFAULTS, ...j, enabled: !j.enabled })),
                      )}
                    />
                    {j.enabled ? 'aktiv' : 'pausiert'}
                  </label>
                  <button
                    className="btn btn--small"
                    disabled={cfg.running.includes(j.id)}
                    onClick={wrap('run', async () => {
                      await api.aiRunJob({ id: j.id });
                      toast({ kind: 'info', title: 'Auftrag ausgeführt ✓', text: 'Die Nachricht wurde gepostet.' });
                    })}
                  >
                    {cfg.running.includes(j.id) ? 'Läuft …' : '▶ Jetzt'}
                  </button>
                  <button className="icon-btn" title="Bearbeiten" aria-label="Bearbeiten" onClick={() => setEditing(j)}>
                    ✏️
                  </button>
                  <button className="icon-btn" title="Löschen" aria-label="Löschen" onClick={wrap('del', () => api.aiDeleteJob({ id: j.id }))}>
                    🗑
                  </button>
                </div>
              </div>
            ),
          )}
          {editing === 'new' ? (
            targets.length ? (
              <JobForm
                targets={targets}
                toast={toast}
                onCancel={() => setEditing(null)}
                onSave={(job) =>
                  wrap('save', async () => {
                    await api.aiSaveJob(job);
                    setEditing(null);
                  })()
                }
              />
            ) : (
              <p className="muted small">Kein Kanal gefunden, in den der Bot schreiben darf.</p>
            )
          ) : (
            !editing && (
              <button className="btn btn--small" onClick={() => setEditing('new')}>
                ＋ Neuer Auftrag
              </button>
            )
          )}
        </div>
      )}
    </>
  );
}
