import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { bus, messageStore, NavContext } from '../state';
import { compareSnowflakes, timestampOf } from '../../shared/snowflake';
import { toPlainText } from '../../shared/mentions';
import ServerRail from './ServerRail.jsx';
import ChatList from './ChatList.jsx';
import ChatView from './ChatView.jsx';
import QuickSwitcher from './QuickSwitcher.jsx';
import CallView from './CallView.jsx';
import AccessDialog from './AccessDialog.jsx';
import SettingsDialog from './SettingsDialog.jsx';
import JoinServerDialog from './JoinServerDialog.jsx';
import { ThreadsPanel } from './SidePanels.jsx';
import { useVoice } from '../voice/useVoice';

const TYPING_MS = 10000;

export default function Workspace({ status, toast, onReconnect, appInfo }) {
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
  const [previews, setPreviews] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const [accessByGuild, setAccessByGuild] = useState({});
  const [accessOpen, setAccessOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [activeThread, setActiveThread] = useState(null); // F12: geöffneter Thread (als Chat)
  const [forum, setForum] = useState(null); // F12: geöffnetes Forum (Beitragsliste)
  const [refreshing, setRefreshing] = useState(false);
  const lastRefresh = useRef(0);
  const activeRef = useRef(null);
  activeRef.current = channelId;

  // Uhrzeiten in der Chat-Liste ("14:03" → "Gestern") minütlich aktualisieren
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // ---------- Laden ----------
  const loadChannels = useCallback(async (gid) => {
    try {
      const groups = await api.listChannels({ guildId: gid });
      setChannelsByGuild((m) => ({ ...m, [gid]: Array.isArray(groups) ? groups : [] }));
      api
        .channelAccess({ guildId: gid })
        .then((a) => setAccessByGuild((m) => ({ ...m, [gid]: a })))
        .catch(() => {});
      api
        .getPreviews({ guildId: gid })
        .then((p) => setPreviews((old) => {
          const next = { ...old };
          for (const [cid, pv] of Object.entries(p)) if (!next[cid] || next[cid].timestamp <= pv.timestamp) next[cid] = pv;
          return next;
        }))
        .catch(() => {});
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
  const allChannels = useMemo(() => Object.values(channelsByGuild).flatMap((groups) => groups.flatMap((g) => g.channels)), [channelsByGuild]);
  // Nur bedienbare Kanäle für Schnellsuche, #-Erwähnungen und Navigation (Forum/Stage sind erkannt, aber noch nicht bedienbar)
  const flatChannels = useMemo(() => allChannels.filter((c) => !c.unsupported), [allChannels]);
  const channelById = useMemo(() => new Map(flatChannels.map((c) => [c.id, c])), [flatChannels]);
  const channel = channelById.get(channelId) || null;

  // Gespeicherter Kanal gehört nicht (mehr) zum Server → ersten sichtbaren Kanal wählen.
  useEffect(() => {
    if (!guildId || !channels) return;
    const inGuild = channels.some((g) => g.channels.some((c) => c.id === channelId && !c.unsupported));
    if (!inGuild) setChannelId(channels.flatMap((g) => g.channels).find((c) => c.type !== 'voice' && !c.unsupported)?.id || null);
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
        setPreviews((m) => ({
          ...m,
          [p.channelId]: {
            channelId: p.channelId,
            messageId: p.id,
            authorName: p.author.name,
            isOwn: p.isOwn,
            text: toPlainText(p.content, p.mentions).slice(0, 120) || (p.attachments.length ? '📎 Anhang' : p.embedsCount ? '[Embed]' : ''),
            timestamp: p.createdTimestamp,
          },
        }));
        if (!p.isOwn && (p.channelId !== activeRef.current || document.hidden)) {
          setLiveUnread((s) => (s.has(p.channelId) ? s : new Set(s).add(p.channelId)));
          setUnreadCounts((c) => ({ ...c, [p.channelId]: (c[p.channelId] || 0) + 1 }));
        }
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
    setUnreadCounts((c) => (c[cid] ? { ...c, [cid]: 0 } : c));
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

  // Sprachkanäle (Teilnehmer, Beitreten, Mikro, Ton, Auflegen)
  const guildIds = useMemo(() => (guilds || []).map((g) => g.id), [guilds]);
  const voiceCtl = useVoice({ toast, guildIds });
  const voiceChannels = useMemo(() => (channels || []).flatMap((g) => g.channels).filter((c) => c.type === 'voice'), [channels]);
  const otherChannels = useMemo(() => (channels || []).flatMap((g) => g.channels).filter((c) => c.unsupported), [channels]);

  // Chats des Servers nach letzter Aktivität sortiert (neueste oben, wie in Messengern).
  const chats = useMemo(() => {
    const list = (channels || []).flatMap((g) => g.channels).filter((c) => c.type !== 'voice' && !c.unsupported);
    const activity = (c) => previews[c.id]?.timestamp || (lastIds[c.id] ? timestampOf(lastIds[c.id]) : 0);
    return list.sort((a, b) => activity(b) - activity(a) || a.position - b.position);
  }, [channels, previews, lastIds]);

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
      setActiveThread(null);
      setForum(null);
      setChannelId(cid);
    },
    [channelById],
  );

  // F12: Thread öffnen (aus Nachricht, Thread-Liste oder Forum)
  const openThread = useCallback(
    async (threadId) => {
      try {
        const t = await api.getThread({ threadId });
        setActiveThread({ ...t, type: 'thread', canMentionEveryone: false, canPin: true, canCreateThreads: false });
      } catch (e) {
        toast({ kind: 'error', title: e.message, text: e.hint });
      }
    },
    [toast],
  );

  const selectChat = useCallback((id) => {
    setActiveThread(null);
    setForum(null);
    setChannelId(id);
  }, []);

  const selectGuild = useCallback(
    (gid) => {
      setGuildId(gid);
      const groups = channelsByGuild[gid] || [];
      const all = groups.flatMap((g) => g.channels).filter((c) => c.type !== 'voice' && !c.unsupported);
      setChannelId(all.find(isUnread)?.id || all[0]?.id || null);
    },
    [channelsByGuild, isUnread],
  );

  // ---------- Aktualisieren (Issue #1) ----------
  const refresh = useCallback(
    async ({ silent = false } = {}) => {
      if (refreshing) return;
      lastRefresh.current = Date.now();
      setRefreshing(true);
      try {
        const res = await api.refresh(guildId ? { guildId } : {});
        await loadGuilds();
        if (!silent) {
          if (res?.failed?.length) toast({ kind: 'warn', title: 'Teilweise aktualisiert', text: `Nicht erreichbar: ${res.failed.join(', ')}` });
          else toast({ kind: 'info', title: 'Aktualisiert ✓', text: 'Kanäle und Rechte sind auf dem neuesten Stand.', duration: 2500 });
        }
      } catch (e) {
        if (!silent) toast({ kind: 'error', title: e.message, text: e.hint });
      } finally {
        setRefreshing(false);
      }
    },
    [refreshing, guildId, loadGuilds, toast],
  );

  // Zurück ins Fenster → still aktualisieren (höchstens 1× pro Minute)
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastRefresh.current > 60000) refresh({ silent: true });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

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
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && chats.length) {
        e.preventDefault();
        const i = chats.findIndex((c) => c.id === channelId);
        const next = chats[(i + (e.key === 'ArrowDown' ? 1 : -1) + chats.length) % chats.length];
        if (next) setChannelId(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chats, channelId]);

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
        <ServerRail guilds={guilds} activeId={guildId} unreadGuilds={unreadGuilds} onSelect={selectGuild} onInvite={invite} onJoin={() => setJoinOpen(true)} />
        <ChatList
          guild={guild}
          chats={chats}
          previews={previews}
          activeId={channelId}
          isUnread={isUnread}
          unreadCounts={unreadCounts}
          onSelect={selectChat}
          onOpenForum={(c) => {
            setActiveThread(null);
            setForum(c);
          }}
          status={status}
          hasGuilds={guilds === null || guilds.length > 0}
          loading={guilds === null || (guildId && !channels)}
          onInvite={invite}
          now={now}
          appInfo={appInfo}
          voiceChannels={voiceChannels}
          otherChannels={otherChannels}
          voiceMembers={voiceCtl.members[guildId] || {}}
          speaking={voiceCtl.speaking}
          voice={voiceCtl.voice}
          onToggleMic={voiceCtl.toggleMic}
          onLeaveVoice={voiceCtl.leave}
          onRefresh={() => refresh()}
          refreshing={refreshing}
          access={accessByGuild[guildId]}
          onShowAccess={() => setAccessOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {accessOpen && (
          <AccessDialog
            access={accessByGuild[guildId]}
            guildName={guild?.name || ''}
            onClose={() => setAccessOpen(false)}
            onRefresh={() => {
              setAccessOpen(false);
              refresh();
            }}
          />
        )}
        {joinOpen && <JoinServerDialog onClose={() => setJoinOpen(false)} onRefresh={() => refresh()} toast={toast} />}
        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} toast={toast} appInfo={appInfo} />}
        {activeThread ? (
          <ChatView
            key={activeThread.id}
            guild={guild}
            channel={activeThread}
            bot={status.bot}
            typingNames={[]}
            onRead={() => {}}
            toast={toast}
            searchOpen={searchOpen}
            onCloseSearch={() => setSearchOpen(false)}
            onOpenSearch={() => setSearchOpen(true)}
            allChannels={flatChannels}
            onOpenThread={openThread}
            onBack={() => setActiveThread(null)}
            parentName={(channelById.get(activeThread.parentId) || forum)?.name}
          />
        ) : forum ? (
          <ThreadsPanel key={forum.id} channel={forum} full onOpen={openThread} onClose={() => setForum(null)} toast={toast} />
        ) : channel?.type === 'voice' ? (
          <CallView
            channel={channel}
            members={(voiceCtl.members[channel.guildId] || {})[channel.id] || []}
            speaking={voiceCtl.speaking}
            voice={voiceCtl.voice}
            bot={status.bot}
            micLevel={voiceCtl.micLevel}
            onJoin={voiceCtl.join}
            onLeave={voiceCtl.leave}
            onToggleMic={voiceCtl.toggleMic}
            onToggleListen={voiceCtl.toggleListen}
          />
        ) : (
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
            onOpenThread={openThread}
          />
        )}
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
