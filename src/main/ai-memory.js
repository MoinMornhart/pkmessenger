'use strict';

// KI-Gedächtnis pro Person (Issue #1, Kommentar 14:54): Jede Person hat ihren eigenen Verlauf mit dem Bot,
// VERSCHLÜSSELT auf diesem PC (gleicher Tresor wie der API-Schlüssel: Windows-DPAPI über safeStorage).
// Kontextfenster: Verlauf + Zusammenfassung dürfen ein Token-Budget nicht überschreiten. Wird es zu groß,
// fasst die KI die älteren Teile zusammen (Anweisung auf Englisch, unsichtbar für Nutzer). Nur wenn die
// Zusammenfassung wirklich KÜRZER ist als das, was sie ersetzt, wird sie übernommen und der Rest gelöscht.

const KEEP_TURNS = 6; // die letzten Wortwechsel bleiben immer wörtlich erhalten
const MAX_TURN_CHARS = 2000;
const MAX_PEOPLE = 500;

/** Grobe Token-Schätzung (≈ 4 Zeichen pro Token bei europäischen Sprachen; reicht für ein Budget). */
const estimateTokens = (s) => Math.ceil(String(s || '').length / 4);

function emptyData() {
  return { v: 1, people: {} };
}

/**
 * @param {{ vault: { get(): string|null, set(v: string): void, clear(): void }, now?: () => number }} o
 */
function createMemory({ vault, now = () => Date.now() }) {
  let data = null;
  let saveTimer = null;

  const load = () => {
    if (data) return data;
    try {
      const raw = vault.get();
      const parsed = raw ? JSON.parse(raw) : null;
      data = parsed && parsed.v === 1 && parsed.people && typeof parsed.people === 'object' ? parsed : emptyData();
    } catch {
      data = emptyData();
    }
    return data;
  };
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 500);
    saveTimer.unref?.();
  };
  function flush() {
    clearTimeout(saveTimer);
    try {
      if (data) vault.set(JSON.stringify(data));
    } catch {
      /* Tresor nicht verfügbar → Gedächtnis gilt nur bis zum Neustart */
    }
  }

  const person = (userId, name) => {
    const d = load();
    if (!d.people[userId]) {
      // Platz schaffen: am längsten nicht genutzte Person zuerst vergessen
      const ids = Object.keys(d.people);
      if (ids.length >= MAX_PEOPLE) delete d.people[ids.sort((a, b) => (d.people[a].at || 0) - (d.people[b].at || 0))[0]];
      d.people[userId] = { name: name || '', summary: '', turns: [], at: now() };
    }
    if (name) d.people[userId].name = String(name).slice(0, 100);
    return d.people[userId];
  };

  const tokensOf = (p) => estimateTokens(p.summary) + p.turns.reduce((n, t) => n + estimateTokens(t.text), 0);

  /** Kontext für den Prompt: Zusammenfassung + letzte Wortwechsel (reine Daten, keine Anweisungen). */
  function context(userId) {
    const p = load().people[userId];
    if (!p || (!p.summary && !p.turns.length)) return '';
    const lines = [];
    if (p.summary) lines.push(`Summary of earlier conversations:\n${p.summary}`);
    if (p.turns.length) lines.push(`Recent messages:\n${p.turns.map((t) => `${t.role === 'user' ? p.name || 'User' : 'You (bot)'}: ${t.text}`).join('\n')}`);
    return `<memory about="${(p.name || 'user').replace(/"/g, "'")}">\n${lines.join('\n\n')}\n</memory>`;
  }

  function remember(userId, name, userText, botText) {
    const p = person(userId, name);
    p.turns.push({ role: 'user', text: String(userText || '').slice(0, MAX_TURN_CHARS), at: now() });
    p.turns.push({ role: 'bot', text: String(botText || '').slice(0, MAX_TURN_CHARS), at: now() });
    p.at = now();
    save();
    return tokensOf(p);
  }

  /**
   * Budget überschritten? Ältere Wortwechsel zusammenfassen lassen.
   * summarize(text) → Promise<string> (ruft die KI). Ergebnis nur übernehmen, wenn es kürzer ist.
   */
  async function compact(userId, budget, summarize) {
    const p = load().people[userId];
    if (!p || tokensOf(p) <= budget) return { compacted: false };
    const old = p.turns.slice(0, Math.max(0, p.turns.length - KEEP_TURNS));
    if (!old.length && !p.summary) return { compacted: false };
    const before = estimateTokens(p.summary) + old.reduce((n, t) => n + estimateTokens(t.text), 0);
    const material = [p.summary && `Previous summary:\n${p.summary}`, old.length && `Conversation:\n${old.map((t) => `${t.role === 'user' ? p.name || 'User' : 'Bot'}: ${t.text}`).join('\n')}`].filter(Boolean).join('\n\n');
    let summary = '';
    try {
      summary = String((await summarize(material)) || '').trim().slice(0, 4000);
    } catch {
      summary = '';
    }
    if (summary && estimateTokens(summary) < before) {
      p.summary = summary;
      p.turns = p.turns.slice(old.length);
    } else {
      // Zusammenfassen hat nichts gebracht → älteste Wortwechsel verwerfen, damit das Budget hält
      while (p.turns.length > 2 && tokensOf(p) > budget) p.turns.splice(0, 2);
    }
    save();
    return { compacted: true, tokens: tokensOf(p) };
  }

  /** Übersicht für die Oberfläche – Inhalte nur auf ausdrücklichen Wunsch (view). */
  function list() {
    const d = load();
    return Object.entries(d.people)
      .map(([userId, p]) => ({ userId, name: p.name, tokens: tokensOf(p), turns: p.turns.length / 2, hasSummary: Boolean(p.summary), at: p.at }))
      .sort((a, b) => b.at - a.at);
  }
  function view(userId) {
    const p = load().people[userId];
    return p ? { userId, name: p.name, summary: p.summary, turns: p.turns.slice(-20), tokens: tokensOf(p) } : null;
  }
  function forget(userId) {
    const d = load();
    delete d.people[userId];
    save();
    return list();
  }
  function forgetAll() {
    data = emptyData();
    clearTimeout(saveTimer);
    vault.clear();
    return [];
  }

  return { context, remember, compact, list, view, forget, forgetAll, flush, estimateTokens };
}

module.exports = { createMemory, estimateTokens, KEEP_TURNS };
