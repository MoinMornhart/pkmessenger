// Support (Issue #120): alles rund um „mir hilft jemand" an einer Stelle –
//  1) Hilfelink: mit EINEM Klick Fernhilfe anfordern, Link + Code erzeugen und kopieren (geht über den eigenen Relay
//     auch von außerhalb; ohne Relay nur im selben WLAN),
//  2) Relay-Adresse (selbst gehostet) mit Status,
//  3) Fernzugang fürs Handy (umgezogen aus „Sicherheit & Start").
// Sicherheit bleibt wie bei der Fernhilfe: der Helfer sieht nur die Einrichtung/Einstellungen, nie Chats; jede Kopplung
// muss am PC bestätigt werden; Beenden jederzeit (auch Strg+C).
import { useEffect, useState } from 'react';
import { api } from '../api';
import RemoteSection from './RemoteSection.jsx';

// Relay-Adresse für Fernhilfe/Fernzugang außerhalb des WLANs (selbst gehostet, siehe relay/README.md)
export function HelpRelayField({ onChange }) {
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState('');
  const [msg, setMsg] = useState(null);
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
      setMsg(value ? { ok: true, text: 'Relay gespeichert – Hilfe und Fernzugang gehen jetzt auch von außerhalb.' } : { ok: true, text: 'Relay entfernt – wieder nur im WLAN.' });
      onChange?.(s?.relay || '');
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  };
  return (
    <div className="settings__field" data-setting="help-relay">
      <span className="settings__label">🌍 Relay-Server (für Hilfe von außerhalb)</span>
      <div className="settings__row">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="wss://relay.deine-domain.de/ws" aria-label="Relay-Adresse" spellCheck={false} />
        <button className="btn btn--small" onClick={() => save(url.trim())} disabled={!url.trim()}>
          Speichern
        </button>
        {saved && (
          <button className="btn btn--ghost btn--small" onClick={() => (setUrl(''), save(''))}>
            Entfernen
          </button>
        )}
      </div>
      <p className="small">{saved ? `🟢 Eingetragen: ${saved.replace(/^https:\/\//, '')}` : '⚪ Kein Relay – Hilfe geht nur im selben WLAN.'}</p>
      {msg && <p className={`small ${msg.ok ? 'ok' : 'warn'}`}>{msg.text}</p>}
      <p className="muted small">Den Relay hostest du selbst (kostenlos, z. B. per Docker: <code>cd relay &amp;&amp; docker compose up -d</code>, Anleitung in relay/README.md). Er leitet nur verschlüsselt weiter und sieht nie deinen Token.</p>
    </div>
  );
}

/** #120: Hilfelink mit einem Klick erzeugen und kopieren. */
function HelpLinkCard({ toast }) {
  const [info, setInfo] = useState(null); // { code, url, relayUrl, expires }
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);
  const link = info ? info.relayUrl || info.url : null;
  const message = info && link ? `Hi! Du kannst mir bei PKMessenger helfen: Öffne ${link} und gib den Code ${info.code} ein. Ich bestätige dich dann am PC.` : '';

  useEffect(() => {
    if (!info?.expires) return undefined;
    const t = setInterval(() => setLeft(Math.max(0, Math.round((info.expires - Date.now()) / 1000))), 1000);
    setLeft(Math.max(0, Math.round((info.expires - Date.now()) / 1000)));
    return () => clearInterval(t);
  }, [info]);

  const copy = (text, title) =>
    api
      .copyText({ text })
      .then(() => toast?.({ kind: 'info', title, duration: 2000 }))
      .catch(() => {});

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.helpRequest();
      setInfo(r);
      const l = r?.relayUrl || r?.url;
      if (l) await copy(`Hi! Du kannst mir bei PKMessenger helfen: Öffne ${l} und gib den Code ${r.code} ein. Ich bestätige dich dann am PC.`, 'Hilfelink + Code kopiert – einfach dem Helfer schicken');
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
      <span className="settings__label">🔗 Hilfelink für einen Helfer</span>
      {!info ? (
        <>
          <div className="settings__row">
            <button className="btn btn--primary btn--small" onClick={create} disabled={busy}>
              {busy ? 'Erstelle …' : '🔗 Hilfelink erstellen & kopieren'}
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => window.dispatchEvent(new CustomEvent('pk:help-open'))}>
              Mit QR-Code …
            </button>
          </div>
          <p className="muted small">Ein Klick erzeugt einen Link und einen Einmal-Code und kopiert beides als fertige Nachricht. Der Helfer sieht nur Einrichtung und Einstellungen – nie deine Chats. Du bestätigst ihn am PC.</p>
        </>
      ) : (
        <>
          <p className="small">
            Code: <b className="login-code">{info.code}</b> · gültig noch <b>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</b> · {info.relayUrl ? '🌍 geht überall' : '🏠 nur im selben WLAN'}
          </p>
          <div className="settings__row">
            <button className="btn btn--small" onClick={() => copy(message, 'Nachricht kopiert')}>
              📋 Nachricht kopieren
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => copy(link, 'Link kopiert')}>
              Nur Link
            </button>
            <button className="btn btn--danger btn--small" onClick={stop}>
              ■ Hilfe beenden
            </button>
          </div>
          {!info.relayUrl && <p className="muted small">Für Hilfe von außerhalb unten einen Relay-Server eintragen.</p>}
        </>
      )}
    </div>
  );
}

export default function SupportSection({ toast }) {
  return (
    <>
      <HelpLinkCard toast={toast} />
      <HelpRelayField />
      <RemoteSection toast={toast} />
    </>
  );
}
