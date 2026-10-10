// Support (Issue #120): „Mir soll jemand helfen" so einfach wie möglich.
//  - Oben: kurz erklärt, EIN Knopf „▶ Hilfe starten" → Link + Einmal-Code werden erzeugt und als fertige Nachricht kopiert.
//  - „⚙️ Erweitert" (eingeklappt): eigenen Relay-Server eintragen, Verbindung testen, kurze Anleitung.
//  - „📱 Fernzugang fürs Handy" (eingeklappt): das Handy bedient den Bot (WLAN / unterwegs über den Relay).
// Sicherheit wie bei der Fernhilfe: der Helfer sieht nur Einrichtung/Einstellungen, nie Chats; jede Kopplung wird am PC
// bestätigt; Beenden jederzeit (auch Strg+C).
import { useEffect, useState } from 'react';
import { api } from '../api';
import RemoteSection from './RemoteSection.jsx';

/** Relay-Adresse eintragen + testen (selbst gehostet, siehe relay/README.md). */
export function HelpRelayField({ onChange }) {
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState('');
  const [msg, setMsg] = useState(null);
  const [test, setTest] = useState(null); // { running } | Ergebnis
  useEffect(() => {
    api
      .helpStatus()
      .then((s) => {
        setSaved(s?.relay || '');
        setUrl(s?.relay ? `${s.relay.replace(/^https:/, 'wss:')}/ws` : '');
      })
      .catch(() => {});
  }, []);
  const save = async (value) => {
    try {
      const s = await api.helpSetRelay({ url: value });
      setSaved(s?.relay || '');
      setTest(null);
      setMsg(value ? { ok: true, text: 'Gespeichert. Tipp: einmal „Verbindung testen“.' } : { ok: true, text: 'Relay entfernt – Hilfe geht wieder nur im WLAN.' });
      onChange?.(s?.relay || '');
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  };
  const runTest = async () => {
    setTest({ running: true });
    try {
      setTest(await api.helpTestRelay({ url: url.trim() }));
    } catch (e) {
      setTest({ ok: false, steps: [{ name: 'Test', ok: false, detail: e.message }] });
    }
  };
  return (
    <div className="settings__field" data-setting="help-relay">
      <span className="settings__label">🌍 Eigener Relay-Server</span>
      <div className="settings__row">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="wss://relay.deine-domain.de/ws" aria-label="Relay-Adresse" spellCheck={false} />
        <button className="btn btn--small" onClick={() => save(url.trim())} disabled={!url.trim()}>
          Speichern
        </button>
        <button className="btn btn--ghost btn--small" onClick={runTest} disabled={!url.trim() || test?.running}>
          {test?.running ? 'Teste …' : '🔌 Verbindung testen'}
        </button>
        {saved && (
          <button className="btn btn--ghost btn--small" onClick={() => (setUrl(''), save(''))}>
            Entfernen
          </button>
        )}
      </div>
      <p className="small">{saved ? `🟢 Eingetragen: ${saved.replace(/^https:\/\//, '')}` : '⚪ Kein Relay – Hilfe geht nur im selben WLAN.'}</p>
      {msg && <p className={`small ${msg.ok ? 'ok' : 'warn'}`}>{msg.text}</p>}
      {test && !test.running && (
        <ul className="support__test" aria-label="Ergebnis des Verbindungstests">
          {test.steps.map((s) => (
            <li key={s.name} className={s.ok ? 'ok' : 'warn'}>
              {s.ok ? '✅' : '❌'} <b>{s.name}:</b> {s.detail}
            </li>
          ))}
          {test.ok && <li className="ok">🎉 Alles bereit – Hilfelinks gehen jetzt überall ({test.ms} ms).</li>}
        </ul>
      )}
      <details className="support__guide">
        <summary>📖 Kurze Anleitung: eigenen Relay in 3 Schritten</summary>
        <ol className="small">
          <li>
            Server mit Docker + eigener Domain (z. B. <code>relay.deine-domain.de</code>), DNS-Eintrag zeigt auf den Server, Ports 80/443 offen.
          </li>
          <li>
            Im Projektordner <code>relay/</code>: <code>cp .env.example .env</code> (Domain eintragen), dann <code>docker compose up -d</code>. Das HTTPS-Zertifikat holt Caddy automatisch.
          </li>
          <li>
            Hier <code>wss://relay.deine-domain.de/ws</code> eintragen → Speichern → Verbindung testen.
          </li>
        </ol>
        <p className="muted small">Der Relay leitet nur verschlüsselte Pakete weiter, speichert nichts und sieht nie deinen Token oder deine Chats. Ausführlich: relay/README.md.</p>
      </details>
    </div>
  );
}

/** #120: Hilfe mit einem Klick starten – Link + Code werden erzeugt und kopiert. */
function HelpLinkCard({ toast }) {
  const [info, setInfo] = useState(null); // { code, url, relayUrl, expires }
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);
  const [relay, setRelay] = useState(null);
  const link = info ? info.relayUrl || info.url : null;
  const message = info && link ? `Hi! Du kannst mir bei PKMessenger helfen: Öffne ${link} und gib den Code ${info.code} ein. Ich bestätige dich dann am PC.` : '';

  useEffect(() => {
    api
      .helpStatus()
      .then((s) => setRelay(s?.relay || ''))
      .catch(() => setRelay(''));
  }, []);
  useEffect(() => {
    if (!info?.expires) return undefined;
    const tick = () => setLeft(Math.max(0, Math.round((info.expires - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [info]);

  const copy = (text, title) =>
    api
      .copyText({ text })
      .then(() => toast?.({ kind: 'info', title, duration: 2500 }))
      .catch(() => {});

  const start = async () => {
    setBusy(true);
    try {
      const r = await api.helpRequest();
      setInfo(r);
      const l = r?.relayUrl || r?.url;
      if (l) await copy(`Hi! Du kannst mir bei PKMessenger helfen: Öffne ${l} und gib den Code ${r.code} ein. Ich bestätige dich dann am PC.`, 'Kopiert – schick die Nachricht einfach deinem Helfer');
    } catch (e) {
      toast?.({ kind: 'error', title: e.message, text: e.hint });
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    await api.helpStop().catch(() => {});
    setInfo(null);
  };

  return (
    <div className="settings__field support__link" data-setting="help-link">
      <span className="settings__label">🙋 Jemand soll mir helfen</span>
      <p className="small">
        Ein Freund oder Support-Admin kann dir beim Einrichten über die Schulter schauen und Knöpfe drücken – <b>deine Chats sieht er nie</b>. Du bestätigst ihn am PC und kannst jederzeit beenden.
      </p>
      {!info ? (
        <>
          <div className="settings__row">
            <button className="btn btn--primary support__start" onClick={start} disabled={busy}>
              {busy ? 'Starte …' : '▶ Hilfe starten'}
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => window.dispatchEvent(new CustomEvent('pk:help-open'))}>
              Mit QR-Code …
            </button>
          </div>
          <p className="muted small">{relay === null ? '' : relay ? '🌍 Der Link geht überall (über deinen Relay).' : '🏠 Der Link geht im Moment nur im selben WLAN. Für Hilfe von außerhalb: unten bei „Erweitert" einen Relay verbinden.'}</p>
        </>
      ) : (
        <>
          <p className="small">
            ✅ Läuft! Nachricht ist kopiert – schick sie deinem Helfer. Code <b className="login-code">{info.code}</b> · gültig noch{' '}
            <b>
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            </b>{' '}
            · {info.relayUrl ? '🌍 geht überall' : '🏠 nur im selben WLAN'}
          </p>
          <div className="settings__row">
            <button className="btn btn--small" onClick={() => copy(message, 'Nachricht kopiert')}>
              📋 Nochmal kopieren
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => copy(link, 'Link kopiert')}>
              Nur Link
            </button>
            <button className="btn btn--danger btn--small" onClick={stop}>
              ■ Hilfe beenden
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function SupportSection({ toast }) {
  return (
    <>
      <HelpLinkCard toast={toast} />
      <details className="support__more" data-setting="support-advanced">
        <summary>⚙️ Erweitert: eigener Relay-Server (Hilfe von außerhalb)</summary>
        <HelpRelayField />
      </details>
      <details className="support__more" data-setting="support-remote">
        <summary>📱 Fernzugang fürs Handy</summary>
        <RemoteSection toast={toast} />
      </details>
    </>
  );
}
