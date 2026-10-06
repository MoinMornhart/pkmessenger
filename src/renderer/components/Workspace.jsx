import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { bus, messageStore, NavContext } from '../state';
import { compareSnowflakes } from '../../shared/snowflake';
import ServerRail from './ServerRail.jsx';
import ChannelSidebar from './ChannelSidebar.jsx';
import ChatView from './ChatView.jsx';
import QuickSwitcher from './QuickSwitcher.jsx';

const TYPING_MS = 10000;

export default function Workspace({ status, toast, onReconnect }) {
  const [guilds, setGuilds] = useState(null);
  const [guildId, setGuildId] = useState(null);
  const [channelsByGuild, setChannelsByGuild] = useState({});
  const [channelId, setChannelId] = useState(null);
  const [readMarkers, setReadMarkers] = useState({});
  const [lastIds, setLastIds] = useState({});
  const [liveUnread, setLiveUnread] = useState(() => new Set());
  const [typing, setTyping] = useState({});
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const activeRef = useRef(null);
  activeRef.current = channelId;

  // ---------- Laden ----------
  const loadChannels = useCallback(async (gid) => {
    try {
      const groups = await api.listChannels({ guildId: gid });
      setChannelsByGuild((m) => ({ ...m, [gid]: groups }));
      setLastIds((m) => {
        const next = { ...m };
        for (const g of groups) for (const c of g.channels) if (c.lastMessageId && (!next[c.id] || compareSnowflakes(c.lastMessageId, next[c.id]) > 0)) next[c.id] = c.lastMessageId;
        return next;
      });
      return groups;
    } catch (e) {
      toast({ kind: 'error', title: e.message, text: e.hint });
      return [];
    }
  }, [toast]);

  const loadGuilds = useCallback(async () => {
    try {
      const list = await api.listGuilds();
      setGuilds(list);
      await Promise.all(list.map((g) => loadChannels(g.id)));
      return list;
    } catch (e) {
      toast({ kind: 'error', title: e.message, text: e.hint });
      setGuilds([]);
      return [];
    }
  }, [loadChannels, toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [settings, list] = await Promise.all([api.getSettings().catch(() => ({ readMarkers: {} })), loadGuilds()]);
      if (cancelled) return;
      setReadMarkers(settings.readMarkers || {});
      const gid = list.some((g) => g.id === settings.lastGuildId) ? settings.lastGuildId : list[0]?.id || null;
      setGuildId(gid);
      if (settings.lastChannelId) setChannelId(settings.lastChannelId);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadGuilds]);

  const channels = useMemo(() => (guildId ? channelsByGuild[guildId] : null), [guildId, channelsByGuild]);
  const flatChannels = useMemo(() => Object.values(channelsByGuild).flatMap((groups) => groups.flatMap((g) => g.channels)), [channelsByGuild]);
  const channelById = useMemo(() => new Map(flatChannels.map((c) => [c.id, c])), [flatChannels]);
  const channel = channelById.get(channelId) || null;

  // Gespeicherter Kanal gehört nicht (mehr) zum Server → ersten sichtbaren Kanal wählen.
  useEffect(() => {
    if (!guildId || !channels) return;
    const inGuild = channels.some((g) => g.channels.some((c) => c.id === channelId));
    if (!inGuild) setChannelId(channels[0]?.channels[0]?.id || null);
  }, [guildId, channels, channelId]);

  useEffect(() => {
    if (guildId || channelId) api.setLastLocation({ guildId, channelId }).catch(() => {});
  }, [guildId, channelId]);

  // ---------- Live-Events ----------
  useEffect(() => {
    let reloadTimer = null;
    const pendingGuilds = new Set();
    return bus.on((type, p) => {
      if (type === 'message:create') {
        messageStore.upsertConfirmed(p);
        setLastIds((m) => ({ ...m, [p.channelId]: p.id }));
        if (!p.isOwn && (p.channelId !== activeRef.current || document.hidden)) setLiveUnread((s) => (s.has(p.channelId) ? s : new Set(s).add(p.channelId)));
        setTyping((t) => {
          if (!t[p.channelId]?.[p.author.id]) return t;
          const { [p.author.id]: _gone, ...rest } = t[p.channelId];
          return { ...t, [p.channelId]: rest };
        });
      } else if (type === 'message:update') {
        messageStore.upsertConfirmed(p);
      } else if (type === 'message:delete') {
        messageStore.remove(p);
      } else if (type === 'typing') {
        setTyping((t) => ({ ...t, [p.channelId]: { ...(t[p.channelId] || {}), [p.userId]: { name: p.name, until: Date.now() + TYPING_MS } } }));
      } else if (type === 'channels:changed' && p.guildId) {
        pendingGuilds.add(p.guildId);
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          for (const g of pendingGuilds) loadChannels(g);
          pendingGuilds.clear();
        }, 400);
      } else if (type === 'guilds:changed') {
        loadGuilds();
      }
    });
  }, [loadChannels, loadGuilds]);

  // Abgelaufene Tipp-Anzeigen entfernen (Timer läuft nur, wenn jemand tippt).
  const anyTyping = Object.values(typing).some((u) => Object.keys(u).length > 0);
  useEffect(() => {
    if (!anyTyping) return undefined;
    const t = setInterval(() => {
      const now = Date.now();
      setTyping((all) => {
        let changed = false;
        const next = {};
        for (const [ch, users] of Object.entries(all)) {
          next[ch] = Object.fromEntries(Object.entries(users).filter(([, v]) => v.until > now));
          if (Object.keys(next[ch]).length !== Object.keys(users).length) changed = true;
        }
        return changed ? next : all;
      });
    }, 1500);
    return () => clearInterval(t);
  }, [anyTyping]);

  // ---------- Gelesen-Markierung ----------
  const markRead = useCallback((cid, messageId) => {
    setLiveUnread((s) => {
      if (!s.has(cid)) return s;
      const n = new Set(s);
      n.delete(cid);
      return n;
    });
    setReadMarkers((m) => {
      if (m[cid] && compareSnowflakes(m[cid], messageId) >= 0) return m;
      api.setReadMarker({ channelId: cid, messageId }).catch(() => {});
      return { ...m, [cid]: messageId };
    });
  }, []);

  const isUnread = useCallback(
    (c) => {
      if (c.id === channelId && !document.hidden) return false;
      if (liveUnread.has(c.id)) return true;
      const last = lastIds[c.id];
      const marker = readMarkers[c.id];
      return Boolean(last && marker && compareSnowflakes(last, marker) > 0);
    },
    [channelId, liveUnread, lastIds, readMarkers],
  );

  const unreadGuilds = useMemo(() => {
    const s = new Set();
    for (const [gid, groups] of Object.entries(channelsByGuild)) if (groups.some((g) => g.channels.some(isUnread))) s.add(gid);
    return s;
  }, [channelsByGuild, isUnread]);

  // ---------- Navigation ----------
  const openChannel = useCallback(
    (cid) => {
      const c = channelById.get(cid);
      if (!c) return;
      setGuildId(c.guildId);
      setChannelId(cid);
    },
    [channelById],
  );

  const selectGuild = useCallback(
    (gid) => {
      setGuildId(gid);
      const groups = channelsByGuild[gid] || [];
      const all = groups.flatMap((g) => g.channels);
      setChannelId(all.find(isUnread)?.id || all[0]?.id || null);
    },
    [channelsByGuild, isUnread],
  );

  const invite = useCallback(async () => {
    const url = await api.getInviteUrl().catch(() => null);
    if (url) api.openExternal({ url });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if (e.ctrlKey && k === 'k') {
        e.preventDefault();
        setQuickOpen((v) => !v);
      } else if (e.ctrlKey && k === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && channels) {
        e.preventDefault();
        const all = channels.flatMap((g) => g.channels);
        const i = all.findIndex((c) => c.id === channelId);
        const next = all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
        if (next) setChannelId(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [channels, channelId]);

  const nav = useMemo(
    () => ({
      channelName: (id) => channelById.get(id)?.name || null,
      openChannel,
      openExternal: (url) => api.openExternal({ url }).catch((e) => toast({ kind: 'error', title: e.message })),
    }),
    [channelById, openChannel, toast],
  );

  const guild = guilds?.find((g) => g.id === guildId) || null;
  const typingNames = channelId ? Object.values(typing[channelId] || {}).map((v) => v.name) : [];

  return (
    <NavContext.Provider value={nav}>
      <div className="layout">
        {status.demo && (
          <div className="demo-badge" title="Simulierte Daten – keine Verbindung zu Discord">
            DEMO
          </div>
        )}
        {status.state !== 'ready' && (
          <div className="conn-banner" role="status">
            {status.state === 'reconnecting' || status.state === 'connecting' ? 'Verbindung wird wiederhergestellt …' : status.error?.message || 'Verbindung getrennt.'}
            {status.state !== 'reconnecting' && status.state !== 'connecting' && (
              <button className="btn btn--small" onClick={onReconnect}>
                Neu verbinden
              </button>
            )}
          </div>
        )}
        <ServerRail guilds={guilds} activeId={guildId} unreadGuilds={unreadGuilds} onSelect={selectGuild} onInvite={invite} />
        <ChannelSidebar guild={guild} groups={channels} activeId={channelId} isUnread={isUnread} onSelect={setChannelId} status={status} hasGuilds={guilds === null || guilds.length > 0} onInvite={invite} />
        <ChatView
          key={channelId || 'none'}
          guild={guild}
          channel={channel}
          bot={status.bot}
          typingNames={typingNames}
          onRead={markRead}
          toast={toast}
          searchOpen={searchOpen}
          onCloseSearch={() => setSearchOpen(false)}
          onOpenSearch={() => setSearchOpen(true)}
          allChannels={flatChannels}
        />
        {quickOpen && (
          <QuickSwitcher
            channels={flatChannels}
            guilds={guilds || []}
            isUnread={isUnread}
            onSelect={(id) => {
              openChannel(id);
              setQuickOpen(false);
            }}
            onClose={() => setQuickOpen(false)}
          />
        )}
      </div>
    </NavContext.Provider>
  );
}
