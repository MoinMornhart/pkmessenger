import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { List, useDynamicRowHeight } from 'react-window';
import { buildRows } from '../../shared/grouping';
import { VIRTUALIZE_THRESHOLD } from '../../shared/limits';
import MessageItem, { DayDivider } from './MessageItem.jsx';

const NEAR_BOTTOM_PX = 80;
const NEAR_TOP_PX = 400;

function useRowRenderer({ highlightId, onRetry, onDiscard }) {
  return useCallback(
    (row) =>
      row.kind === 'day' ? (
        <DayDivider timestamp={row.timestamp} />
      ) : (
        <MessageItem message={row.message} grouped={row.grouped} highlighted={row.message.id === highlightId} onRetry={onRetry} onDiscard={onDiscard} />
      ),
    [highlightId, onRetry, onDiscard],
  );
}

function ListHeader({ state, channelName }) {
  if (state.loadingOlder) return <div className="list-note">Ältere Nachrichten werden geladen …</div>;
  if (!state.hasMore)
    return (
      <div className="channel-start">
        <div className="channel-start__icon">#</div>
        <h3>Willkommen in #{channelName}</h3>
        <p className="muted">Das ist der Anfang des Kanals.</p>
      </div>
    );
  return <div className="list-note" />;
}

// ---------- bis ~200 Zeilen: normales DOM ----------
const PlainRows = forwardRef(function PlainRows({ rows, state, channelName, renderRow, ctrl, onNearTop, onBottomChange }, ref) {
  const el = useRef(null);

  useImperativeHandle(ref, () => ({
    captureAnchor() {
      const box = el.current;
      const first = box?.querySelector('[data-mid]');
      if (first) ctrl.anchor = { id: first.dataset.mid, offset: first.offsetTop - box.scrollTop };
    },
    scrollToBottom() {
      if (el.current) el.current.scrollTop = el.current.scrollHeight;
    },
    jumpTo(id) {
      const target = el.current?.querySelector(`[data-mid="${CSS.escape(id)}"]`);
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return Boolean(target);
    },
  }));

  useLayoutEffect(() => {
    const box = el.current;
    if (!box) return;
    if (ctrl.anchor) {
      const a = box.querySelector(`[data-mid="${CSS.escape(ctrl.anchor.id)}"]`);
      if (a) box.scrollTop = a.offsetTop - ctrl.anchor.offset;
      ctrl.anchor = null;
    } else if (ctrl.stick) {
      box.scrollTop = box.scrollHeight;
    }
  }, [rows, ctrl]);

  const onScroll = (e) => {
    const b = e.currentTarget;
    const atBottom = b.scrollHeight - b.scrollTop - b.clientHeight < NEAR_BOTTOM_PX;
    ctrl.stick = atBottom;
    onBottomChange(atBottom);
    if (b.scrollTop < NEAR_TOP_PX) onNearTop();
  };

  return (
    <div className="msglist" ref={el} onScroll={onScroll}>
      <ListHeader state={state} channelName={channelName} />
      {rows.map((row) => (
        <div key={row.key} className="row">
          {renderRow(row)}
        </div>
      ))}
      <div className="list-bottom-spacer" />
    </div>
  );
});

// ---------- ab ~200 Zeilen: virtualisiert mit react-window ----------
function VirtualRow({ index, style, rows, renderRow, state, channelName }) {
  if (index === 0)
    return (
      <div style={style}>
        <ListHeader state={state} channelName={channelName} />
      </div>
    );
  const row = rows[index - 1];
  return (
    <div style={style} className="row">
      {renderRow(row)}
    </div>
  );
}

const VirtualRows = forwardRef(function VirtualRows({ rows, state, channelName, renderRow, ctrl, onNearTop, onBottomChange, channelId }, ref) {
  const listRef = useRef(null);
  const visible = useRef({ startIndex: 0, stopIndex: 0 });
  // Höhen-Cache neu, wenn vorne Nachrichten eingefügt wurden (react-window cached pro Index).
  const firstKey = rows[0]?.key || 'x';
  const rowHeight = useDynamicRowHeight({ defaultRowHeight: 64, key: `${channelId}-${firstKey}` });
  const count = rows.length + 1;

  const scrollToIndex = useCallback((index, align) => {
    const go = () => listRef.current?.scrollToRow({ index, align, behavior: 'instant' });
    go();
    // Dynamische Höhen werden erst nach dem Rendern gemessen → einmal nachjustieren.
    requestAnimationFrame(() => requestAnimationFrame(go));
  }, []);

  useImperativeHandle(ref, () => ({
    captureAnchor() {
      const row = rows[Math.max(0, visible.current.startIndex - 1)];
      if (row) ctrl.anchor = { key: row.key };
    },
    scrollToBottom() {
      scrollToIndex(count - 1, 'end');
    },
    jumpTo(id) {
      const i = rows.findIndex((r) => r.kind === 'message' && r.message.id === id);
      if (i < 0) return false;
      scrollToIndex(i + 1, 'center');
      return true;
    },
  }));

  useLayoutEffect(() => {
    if (ctrl.anchor?.key) {
      const i = rows.findIndex((r) => r.key === ctrl.anchor.key);
      ctrl.anchor = null;
      if (i >= 0) scrollToIndex(i + 1, 'start');
    } else if (ctrl.stick) {
      scrollToIndex(count - 1, 'end');
    }
  }, [rows, ctrl, count, scrollToIndex]);

  const rowProps = useMemo(() => ({ rows, renderRow, state, channelName }), [rows, renderRow, state, channelName]);

  return (
    <List
      listRef={listRef}
      className="msglist"
      rowComponent={VirtualRow}
      rowCount={count}
      rowHeight={rowHeight}
      rowProps={rowProps}
      overscanCount={6}
      onRowsRendered={(v) => {
        visible.current = v;
        if (v.startIndex <= 3) onNearTop();
      }}
      onScroll={(e) => {
        const b = e.currentTarget;
        const atBottom = b.scrollHeight - b.scrollTop - b.clientHeight < NEAR_BOTTOM_PX;
        ctrl.stick = atBottom;
        onBottomChange(atBottom);
      }}
    />
  );
});

/**
 * Nachrichtenliste: lädt beim Hochscrollen ältere Seiten nach, bleibt unten "kleben", wenn man unten ist,
 * und hält die Position, wenn oben ältere Nachrichten eingefügt werden.
 */
const MessageList = forwardRef(function MessageList({ channel, state, onLoadOlder, onRetry, onDiscard }, ref) {
  const rows = useMemo(() => buildRows(state.messages), [state.messages]);
  const virtual = rows.length > VIRTUALIZE_THRESHOLD;
  const inner = useRef(null);
  const ctrl = useRef({ stick: true, anchor: null }).current;
  const [atBottom, setAtBottom] = useState(true);
  const [highlightId, setHighlightId] = useState(null);
  const renderRow = useRowRenderer({ highlightId, onRetry, onDiscard });

  const onNearTop = useCallback(() => {
    if (state.loadingOlder || !state.hasMore || state.status !== 'ready') return;
    inner.current?.captureAnchor();
    ctrl.stick = false;
    onLoadOlder();
  }, [state.loadingOlder, state.hasMore, state.status, onLoadOlder, ctrl]);

  useImperativeHandle(ref, () => ({
    scrollToBottom() {
      ctrl.stick = true;
      inner.current?.scrollToBottom();
    },
    jumpTo(id) {
      ctrl.stick = false;
      const ok = inner.current?.jumpTo(id);
      if (ok) {
        setHighlightId(id);
        setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 2200);
      }
      return ok;
    },
  }));

  // Kurzer Inhalt füllt das Fenster nicht → sofort weitere ältere Nachrichten holen.
  useEffect(() => {
    if (state.status === 'ready' && state.hasMore && !state.loadingOlder && rows.length < 25) onNearTop();
  }, [state.status, state.hasMore, state.loadingOlder, rows.length, onNearTop]);

  const Comp = virtual ? VirtualRows : PlainRows;
  return (
    <div className="msglist-wrap">
      <Comp
        ref={inner}
        rows={rows}
        state={state}
        channelName={channel.name}
        channelId={channel.id}
        renderRow={renderRow}
        ctrl={ctrl}
        onNearTop={onNearTop}
        onBottomChange={setAtBottom}
      />
      {!atBottom && (
        <button
          className="jump-bottom"
          onClick={() => {
            ctrl.stick = true;
            inner.current?.scrollToBottom();
          }}
        >
          ↓ Zu den neuesten Nachrichten
        </button>
      )}
    </div>
  );
});

export default MessageList;
