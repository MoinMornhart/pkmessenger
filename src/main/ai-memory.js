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

  // Datenschutz (vibeworks #218): Jeder Wortwechsel merkt sich, wo er stattfand (g = Server-ID, null = Privatchat).
  // Auf einem Server sieht die KI nur wörtliche Wortwechsel von DIESEM Server – nie aus Privatchats oder anderen Servern.
  // Andere Personen (nicht der Fragende): nur Wortwechsel von diesem Server, nie ihre Zusammenfassung (die mischt alle Orte).
  const visible = (t, guildId, own) => (guildId ? t.g === String(guildId) || (own && t.g === undefined) : own);

  /**
   * Kontext für den Prompt: Zusammenfassung + letzte Wortwechsel (reine Daten, keine Anweisungen).
   * guildId: Server, auf dem gerade gefragt wird (null = Privatchat). own=false: Gedächtnis einer anderen Person.
   */
  function context(userId, { guildId = null, own = true } = {}) {
    const p = load().people[userId];
    if (!p) return '';
    const turns = p.turns.filter((t) => visible(t, guildId, own));
    const summary = own ? p.summary : '';
    if (!summary && !turns.length) return '';
    const lines = [];
    if (summary) lines.push(`Summary of earlier conversations:\n${summary}`);
    if (turns.length) lines.push(`Recent messages:\n${turns.map((t) => `${t.role === 'user' ? p.name || 'User' : 'You (bot)'}: ${t.text}`).join('\n')}`);
    return `<memory about="${(p.name || 'user').replace(/"/g, "'")}">\n${lines.join('\n\n')}\n</memory>`;
  }

  function remember(userId, name, userText, botText, { guildId = null } = {}) {
    const p = person(userId, name);
    const g = guildId ? String(guildId) : null;
    p.turns.push({ role: 'user', text: String(userText || '').slice(0, MAX_TURN_CHARS), at: now(), g });
    p.turns.push({ role: 'bot', text: String(botText || '').slice(0, MAX_TURN_CHARS), at: now(), g });
    p.at = now();
    save();
    return tokensOf(p);
  }

  /**
   * Budget überschritten? Ältere Wortwechsel zusammenfassen lassen.
   * summarize(text) → Promise<string> (ruft die KI). Ergebnis nur übernehmen, wenn es kürzer ist.
   */
  /** force: auch unter dem Budget zusammenfassen („Jetzt zusammenfassen“ in der Oberfläche). */
  async function compact(userId, budget, summarize, { force = false } = {}) {
    const p = load().people[userId];
    if (!p || (!force && tokensOf(p) <= budget)) return { compacted: false };
    // Von Hand ausgelöst: alles zusammenfassen; automatisch: die letzten Wortwechsel bleiben wörtlich
    const old = p.turns.slice(0, Math.max(0, p.turns.length - (force ? 0 : KEEP_TURNS)));
    if (!old.length) return { compacted: false, ok: false, error: force ? 'Noch nichts zum Zusammenfassen.' : null };
    const before = estimateTokens(p.summary) + old.reduce((n, t) => n + estimateTokens(t.text), 0);
    const material = [p.summary && `Previous summary:\n${p.summary}`, old.length && `Conversation:\n${old.map((t) => `${t.role === 'user' ? p.name || 'User' : 'Bot'}: ${t.text}`).join('\n')}`].filter(Boolean).join('\n\n');
    const tokensBefore = tokensOf(p);
    let summary = '';
    let error = null;
    try {
      summary = String((await summarize(material)) || '').trim().slice(0, 4000);
      if (!summary) error = 'Die KI hat keine Zusammenfassung geliefert.';
    } catch (err) {
      error = String(err?.message || err || 'Fehler').slice(0, 200);
    }
    let ok = false;
    if (summary && estimateTokens(summary) < before) {
      p.summary = summary;
      p.turns = p.turns.slice(old.length);
      ok = true;
    } else {
      if (!error) error = 'Die Zusammenfassung war nicht kürzer als das Original – nicht übernommen.';
      // Zusammenfassen hat nichts gebracht → älteste Wortwechsel verwerfen, damit das Budget hält
      while (p.turns.length > 2 && tokensOf(p) > budget) p.turns.splice(0, 2);
    }
    // Ergebnis merken (für die Oberfläche: „zuletzt zusammengefasst“ bzw. Fehler)
    p.lastCompact = { at: now(), ok, error: ok ? null : error, before: tokensBefore, after: tokensOf(p) };
    save();
    return { compacted: true, ok, error: ok ? null : error, tokens: tokensOf(p) };
  }

  /**
   * „@Leon hat mal gesagt …“ (vibeworks #218): Personen per Name suchen und nur deren Wortwechsel von DIESEM Server liefern.
   * Ohne Server (Privatchat) gibt es nichts – Erinnerungen anderer verlassen nie ihren Server.
   */
  function recall(name, { guildId = null, excludeUserId = null, limit = 10 } = {}) {
    const q = String(name || '').replace(/^@/, '').trim().toLowerCase();
    if (!guildId || !q) return [];
    return Object.entries(load().people)
      .filter(([id, p]) => id !== excludeUserId && String(p.name || '').toLowerCase().includes(q))
      .map(([userId, p]) => ({ userId, name: p.name, turns: p.turns.filter((t) => t.g === String(guildId)).slice(-limit) }))
      .filter((x) => x.turns.length)
      .slice(0, 3);
  }

  /** Übersicht für die Oberfläche – Inhalte nur auf ausdrücklichen Wunsch (view). */
  function list() {
    const d = load();
    return Object.entries(d.people)
      .map(([userId, p]) => ({ userId, name: p.name, tokens: tokensOf(p), turns: p.turns.length / 2, hasSummary: Boolean(p.summary), at: p.at, lastCompact: p.lastCompact || null }))
      .sort((a, b) => b.at - a.at);
  }
  function view(userId) {
    const p = load().people[userId];
    return p ? { userId, name: p.name, summary: p.summary, turns: p.turns.slice(-20), tokens: tokensOf(p), lastCompact: p.lastCompact || null } : null;
  }
  /** Zusammenfassung von Hand bearbeiten (Verwaltung durch den Besitzer). */
  function setSummary(userId, summary) {
    const p = load().people[userId];
    if (!p) return null;
    p.summary = String(summary || '').slice(0, 4000);
    p.lastCompact = { ...(p.lastCompact || {}), edited: now() };
    save();
    return view(userId);
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

  return { context, remember, recall, compact, list, view, setSummary, forget, forgetAll, flush, estimateTokens };
}

module.exports = { createMemory, estimateTokens, KEEP_TURNS };
