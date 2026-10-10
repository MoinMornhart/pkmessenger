'use strict';

// Bot-Module (Beta, Wunsch JONIMONI09 in #131 – Vorbild: Modul-System von Moin_Julia): kleine Zusatzfunktionen,
// pro Server einzeln an/aus und einstellbar. Laufen nur, solange PKMessenger offen ist. Ab Werk ist alles AUS.
// Sicherheit: Der Bot pingt in Modul-Antworten nie jemanden (keine Massen-Pings), antwortet nie auf Bots,
// und hat ein eigenes Antwort-Limit pro Server, damit ein Modul den Kanal nicht zuspammen kann.

const NO_MENTIONS = Object.freeze({ users: [], roles: [], everyone: false });
const SNOWFLAKE = /^\d{17,20}$/;
const MAX_REPLIES_PER_MIN = 20;
const XP_COOLDOWN_MS = 60 * 1000;
const XP_PER_MSG = 20;
const AUTOREPLY_COOLDOWN_MS = 10 * 1000;

const CATALOG = [
  {
    id: 'autoreply',
    icon: '💬',
    title: 'Auto-Antworten',
    desc: 'Der Bot antwortet auf Stichwörter mit festem Text – z. B. „!regeln“ → eure Server-Regeln.',
    defaults: { rules: [] },
  },
  {
    id: 'counting',
    icon: '🔢',
    title: 'Zählen',
    desc: 'Ein Kanal, in dem alle gemeinsam hochzählen. Niemand darf zweimal hintereinander. Falsche Zahl → von vorn.',
    defaults: { channelId: '' },
  },
  {
    id: 'levels',
    icon: '⭐',
    title: 'Level',
    desc: 'Punkte fürs Schreiben (höchstens 1× pro Minute). „!rang“ zeigt den eigenen Stand, „!top“ die Bestenliste.',
    defaults: { announce: true },
  },
];
const IDS = new Set(CATALOG.map((m) => m.id));

const { ValidationError } = require('./validate');
const fail = (msg) => {
  throw new ValidationError(msg);
};

/** Einstellungen eines Moduls prüfen (IPC-Validierung). */
function checkConfig(moduleId, raw) {
  const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (moduleId === 'autoreply') {
    const rules = Array.isArray(c.rules) ? c.rules : [];
    if (rules.length > 50) fail('Höchstens 50 Auto-Antworten.');
    return {
      rules: rules.map((r) => {
        const trigger = typeof r?.trigger === 'string' ? r.trigger.trim() : '';
        const reply = typeof r?.reply === 'string' ? r.reply.trim() : '';
        if (!trigger || trigger.length > 100) fail('Stichwort: 1 bis 100 Zeichen.');
        if (!reply || reply.length > 2000) fail('Antwort: 1 bis 2000 Zeichen.');
        return { trigger, reply, match: r?.match === 'enthaelt' ? 'enthaelt' : 'genau' };
      }),
    };
  }
  if (moduleId === 'counting') {
    const channelId = typeof c.channelId === 'string' ? c.channelId : '';
    if (channelId && !SNOWFLAKE.test(channelId)) fail('Ungültiger Kanal.');
    return { channelId };
  }
  if (moduleId === 'levels') return { announce: c.announce !== false };
  return fail('Unbekanntes Modul.');
}

function checkSet(p) {
  const o = p && typeof p === 'object' ? p : fail('Ungültige Anfrage.');
  if (!SNOWFLAKE.test(String(o.guildId || ''))) fail('Ungültiger Server.');
  if (!IDS.has(o.moduleId)) fail('Unbekanntes Modul.');
  if (typeof o.enabled !== 'boolean') fail('Schalter muss an oder aus sein.');
  return { guildId: o.guildId, moduleId: o.moduleId, enabled: o.enabled, config: checkConfig(o.moduleId, o.config) };
}

/** Level aus Punkten: 100, 300, 600, 1000 … (immer etwas mehr pro Stufe) */
const levelOf = (xp) => Math.floor((Math.sqrt(1 + (8 * xp) / 100) - 1) / 2);

function createBotModules({ store, service, now = () => Date.now(), logger = null }) {
  const replies = new Map(); // guildId → [Zeitpunkte]
  const ruleCooldown = new Map(); // guild|channel|trigger → bis
  const xpCooldown = new Map(); // guild|user → bis
  let saveTimer = null;

  const allCfg = () => {
    const raw = store.get().botModules;
    return raw && typeof raw === 'object' ? raw : {};
  };
  // Laufende Daten (Zählerstand, Punkte) getrennt von den Einstellungen
  const data = (() => {
    const raw = store.get().botModuleData;
    return raw && typeof raw === 'object' ? raw : {};
  })();
  const saveData = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set('botModuleData', data), 2000);
    saveTimer.unref?.();
  };
  const dataOf = (guildId, moduleId) => {
    data[guildId] ||= {};
    data[guildId][moduleId] ||= {};
    return data[guildId][moduleId];
  };

  const stateOf = (guildId, moduleId) => {
    const s = allCfg()[guildId]?.[moduleId];
    const def = CATALOG.find((m) => m.id === moduleId);
    let config = def.defaults;
    try {
      config = s?.config ? checkConfig(moduleId, s.config) : def.defaults;
    } catch {
      config = def.defaults;
    }
    return { enabled: s?.enabled === true, config };
  };

  function list({ guildId }) {
    if (!SNOWFLAKE.test(String(guildId || ''))) fail('Ungültiger Server.');
    return CATALOG.map((m) => {
      const st = stateOf(guildId, m.id);
      const d = data[guildId]?.[m.id] || {};
      const info = m.id === 'counting' ? { current: d.current || 0, best: d.best || 0 } : m.id === 'levels' ? { people: Object.keys(d.xp || {}).length } : {};
      return { id: m.id, icon: m.icon, title: m.title, desc: m.desc, ...st, info };
    });
  }

  function set(p) {
    const { guildId, moduleId, enabled, config } = checkSet(p);
    const all = { ...allCfg() };
    all[guildId] = { ...(all[guildId] || {}), [moduleId]: { enabled, config } };
    store.set('botModules', all);
    return list({ guildId });
  }

  /** Daten eines Moduls zurücksetzen (Zählerstand, Punkte). */
  function reset({ guildId, moduleId }) {
    if (!SNOWFLAKE.test(String(guildId || '')) || !IDS.has(moduleId)) fail('Ungültige Anfrage.');
    if (data[guildId]) delete data[guildId][moduleId];
    saveData();
    return list({ guildId });
  }

  // Eigenes Limit pro Server: nie mehr als MAX_REPLIES_PER_MIN Modul-Antworten pro Minute
  function mayReply(guildId) {
    const t = now();
    const list = (replies.get(guildId) || []).filter((x) => t - x < 60000);
    if (list.length >= MAX_REPLIES_PER_MIN) {
      replies.set(guildId, list);
      return false;
    }
    list.push(t);
    replies.set(guildId, list);
    return true;
  }
  async function say(m, content) {
    if (!mayReply(m.guildId)) return false;
    await service.sendMessage({ channelId: m.channelId, content: String(content).slice(0, 2000), mentions: NO_MENTIONS, replyTo: m.id, pingReply: false, files: [], embeds: [], poll: null });
    return true;
  }
  const react = (m, emoji) => Promise.resolve(service.react?.({ channelId: m.channelId, messageId: m.id, emoji, add: true })).catch(() => {});
  const nameOf = (m) => String(m.author?.name || 'Jemand').replace(/[@`*_~|<>]/g, '').slice(0, 40);

  async function autoreply(m, cfg) {
    const text = String(m.content || '').trim().toLowerCase();
    const rule = cfg.rules.find((r) => (r.match === 'genau' ? text === r.trigger.toLowerCase() : text.includes(r.trigger.toLowerCase())));
    if (!rule) return;
    const key = `${m.guildId}|${m.channelId}|${rule.trigger}`;
    if ((ruleCooldown.get(key) || 0) > now()) return;
    ruleCooldown.set(key, now() + AUTOREPLY_COOLDOWN_MS);
    await say(m, rule.reply);
  }

  async function counting(m, cfg) {
    if (!cfg.channelId || m.channelId !== cfg.channelId) return;
    const t = String(m.content || '').trim();
    if (!/^\d{1,9}$/.test(t)) return; // Reden zwischendurch ist erlaubt
    const d = dataOf(m.guildId, 'counting');
    const n = Number(t);
    const current = d.current || 0;
    if (n === current + 1 && d.lastUserId !== m.author.id) {
      d.current = n;
      d.lastUserId = m.author.id;
      d.best = Math.max(d.best || 0, n);
      saveData();
      await react(m, '✅');
      return;
    }
    const why = d.lastUserId === m.author.id && n === current + 1 ? 'hat zweimal hintereinander gezählt' : `hat sich verzählt (richtig wäre ${current + 1})`;
    d.current = 0;
    d.lastUserId = null;
    saveData();
    await react(m, '❌');
    await say(m, `💥 ${nameOf(m)} ${why}. Wieder von vorn – die nächste Zahl ist **1**. (Rekord: ${d.best || 0})`);
  }

  async function levels(m, cfg) {
    const d = dataOf(m.guildId, 'levels');
    d.xp ||= {};
    const text = String(m.content || '').trim().toLowerCase();
    if (text === '!rang') {
      const xp = d.xp[m.author.id]?.xp || 0;
      const rank = Object.values(d.xp).filter((x) => x.xp > xp).length + 1;
      await say(m, `⭐ ${nameOf(m)}: Level **${levelOf(xp)}** · ${xp} Punkte · Platz ${rank}`);
      return;
    }
    if (text === '!top') {
      const top = Object.values(d.xp)
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 10)
        .map((x, i) => `${i + 1}. ${String(x.name || '?').replace(/[@`*_~|<>]/g, '')} – Level ${levelOf(x.xp)} (${x.xp})`);
      await say(m, top.length ? `🏆 **Bestenliste**\n${top.join('\n')}` : '🏆 Noch niemand hat Punkte.');
      return;
    }
    const key = `${m.guildId}|${m.author.id}`;
    if ((xpCooldown.get(key) || 0) > now()) return;
    xpCooldown.set(key, now() + XP_COOLDOWN_MS);
    const entry = d.xp[m.author.id] || { xp: 0, name: '' };
    const before = levelOf(entry.xp);
    entry.xp += XP_PER_MSG;
    entry.name = nameOf(m);
    d.xp[m.author.id] = entry;
    saveData();
    const after = levelOf(entry.xp);
    if (after > before && cfg.announce) await say(m, `🎉 ${nameOf(m)} ist jetzt **Level ${after}**!`);
  }

  const HANDLERS = { autoreply, counting, levels };

  /** Jede neue Nachricht (vom Hauptprozess durchgereicht). */
  async function onMessage(m) {
    if (!m?.guildId || !m.author?.id || m.author.bot || m.isOwn || m.system || !SNOWFLAKE.test(String(m.guildId))) return;
    const cfgs = allCfg()[m.guildId];
    if (!cfgs) return;
    for (const id of IDS) {
      if (cfgs[id]?.enabled !== true) continue;
      try {
        await HANDLERS[id](m, stateOf(m.guildId, id).config);
      } catch (err) {
        logger?.warn?.('module', `${id}: ${err?.message || err}`);
      }
    }
  }

  function flush() {
    clearTimeout(saveTimer);
    store.set('botModuleData', data);
  }

  return { list, set, reset, onMessage, flush, _data: () => data };
}

module.exports = { createBotModules, CATALOG, checkSet, levelOf };
