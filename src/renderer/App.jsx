import { useEffect, useRef, useState, useCallback } from 'react';
import { api, onEvent } from './api';
import { bus } from './state';
import Workspace from './components/Workspace.jsx';
import SetupScreen from './components/SetupScreen.jsx';
import { ConnectingScreen, ErrorScreen } from './components/StatusScreens.jsx';
import Toasts from './components/Toasts.jsx';

export default function App() {
  const [status, setStatus] = useState(null);
  const [toasts, setToasts] = useState([]);
  const everReady = useRef(false);

  const toast = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list.slice(-3), { id, kind: 'info', ...t }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.duration || 5000);
  }, []);

  useEffect(() => {
    const off = onEvent((type, payload) => {
      if (type === 'status') setStatus(payload);
      else if (type === 'ratelimit') toast({ kind: 'warn', title: 'Discord bremst kurz (Rate-Limit)', text: `Automatischer neuer Versuch in ${Math.ceil((payload.retryAfterMs || 1000) / 1000)} s.` });
      else if (type === 'log') console.warn('[PKMessenger]', payload.message);
      else bus.emit(type, payload);
    });
    api.getStatus().then(setStatus).catch(() => setStatus({ state: 'error', error: { message: 'Interner Fehler beim Start.', hint: 'App neu starten.' } }));
    return off;
  }, [toast]);

  const reconnect = useCallback(() => api.connect().catch((e) => toast({ kind: 'error', title: e.message, text: e.hint })), [toast]);

  if (status?.state === 'ready') everReady.current = true;

  let screen;
  if (!status || status.state === 'idle' || (status.state === 'connecting' && !everReady.current)) screen = <ConnectingScreen />;
  else if (status.state === 'setup') screen = <SetupScreen status={status} onReconnect={reconnect} />;
  else if (status.state === 'error' && !everReady.current) screen = <ErrorScreen status={status} onReconnect={reconnect} />;
  else if (status.state === 'disconnected' && !everReady.current) screen = <ErrorScreen status={status} onReconnect={reconnect} />;
  else screen = <Workspace status={status} toast={toast} onReconnect={reconnect} />;

  return (
    <>
      {screen}
      <Toasts toasts={toasts} onClose={(id) => setToasts((l) => l.filter((t) => t.id !== id))} />
    </>
  );
}
