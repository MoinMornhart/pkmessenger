'use strict';

// Nur Entwicklung: `--screenshots=<ordner>` nimmt automatisch echte Bilder der laufenden App auf.
const fs = require('node:fs');
const path = require('node:path');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(win, dir, name) {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG());
  console.log(`[screenshots] ${name}.png gespeichert`);
}

const js = (win, code) => win.webContents.executeJavaScript(code, true);

// Tippt Text in ein React-kontrolliertes Textfeld (setzt Wert + feuert input-Event).
const typeInto = (selector, text) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  el.focus(); setter.call(el, ${JSON.stringify(text)});
  el.setSelectionRange(${text.length}, ${text.length});
  el.dispatchEvent(new Event('input', { bubbles: true }));
})()`;

const key = (k, opts = {}) => `window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key: k, bubbles: true, ...opts })}))`;

async function runScreenshots(win, dir, { demo, stats }) {
  fs.mkdirSync(dir, { recursive: true });
  await wait(3500);
  if (!demo) {
    await shoot(win, dir, '01-setup');
    return;
  }
  // Die App merkt sich den letzten Chat – für reproduzierbare Bilder immer bei #allgemein starten.
  await js(win, `[...document.querySelectorAll('.chatrow')].find(b=>b.textContent.includes('allgemein'))?.click()`);
  await wait(1200);
  await shoot(win, dir, '02-chat');
  await js(win, typeInto('.composer textarea', 'Hey @an'));
  await wait(900);
  await shoot(win, dir, '03-mention-autocomplete');
  await js(win, typeInto('.composer textarea', ''));
  await js(win, key('k', { ctrlKey: true }));
  await wait(500);
  await shoot(win, dir, '04-schnellsuche');
  await js(win, key('Escape'));
  await js(win, `document.querySelector('.quick__input')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await wait(300);
  await js(win, typeInto('.composer textarea', '@everyone Server-Wartung um 22 Uhr!'));
  await js(win, `document.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  await wait(500);
  await shoot(win, dir, '05-everyone-bestaetigung');
  await js(win, `[...document.querySelectorAll('.confirm .btn')].find(b=>b.textContent.includes('Abbrechen'))?.click()`);
  await js(win, typeInto('.composer textarea', ''));
  await js(win, key('f', { ctrlKey: true }));
  await wait(300);
  await js(win, `(() => { const el = document.querySelector('.search-panel input'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,'repo'); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await wait(400);
  await shoot(win, dir, '06-suche');
  await js(win, `document.querySelector('.search-panel .icon-btn')?.click()`);
  // Kanal mit 260+ Nachrichten → virtualisierte Liste
  await js(win, `[...document.querySelectorAll('.chatrow')].find(b=>b.textContent.includes('projekt-a'))?.click()`);
  await wait(1500);
  await shoot(win, dir, '07-virtualisiert');
  await js(win, `[...document.querySelectorAll('.chatrow')].find(b=>b.textContent.includes('nur-lesen'))?.click()`);
  await wait(1000);
  await shoot(win, dir, '08-nur-lesen');
  await js(win, `[...document.querySelectorAll('.chatrow')].find(b=>b.textContent.includes('allgemein'))?.click()`);
  await wait(800);
  await js(win, typeInto('.composer textarea', 'Hallo aus PKMessenger 👋'));
  await js(win, `document.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  await wait(800);
  await shoot(win, dir, '09-gesendet');

  // ---- Sprachkanal (F17) inkl. End-to-End-Tontest mit SIMULIERTEM Mikrofon ----
  await js(win, `[...document.querySelectorAll('.chatrow')].find(b=>b.textContent.includes('Lounge'))?.click()`);
  await wait(800);
  await shoot(win, dir, '10-sprachkanal');
  await js(win, `document.querySelector('.call-btn--join')?.click()`);
  await wait(1500);
  await js(win, `[...document.querySelectorAll('.call-btn')].find(b=>b.textContent.includes('Mikro'))?.click()`);
  await wait(3000);
  await shoot(win, dir, '11-im-anruf');
  const r = await js(win, 'JSON.stringify(window.__pkVoiceStats || {})');
  console.log(`[voice-e2e] Renderer: ${r} | Main: ${JSON.stringify(stats || {})}`);
  await js(win, `document.querySelector('.call-btn--hangup')?.click()`);
  await wait(500);
  const after = await js(win, `document.querySelector('.callbar') ? 'Anrufleiste noch da' : 'aufgelegt'`);
  console.log(`[voice-e2e] Nach Auflegen: ${after}`);

  // ---- Issue #1: Aktualisieren, gesperrte Kanäle, Einstellungen ----
  await js(win, `[...document.querySelectorAll('.chatrow')].find(b=>b.textContent.includes('allgemein'))?.click()`);
  await js(win, `document.querySelector('.chatlist__head .icon-btn[aria-label="Aktualisieren"]')?.click()`);
  await wait(1200);
  const toastText = await js(win, `[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' | ')`);
  console.log(`[issue1] Nach Aktualisieren: ${toastText || '(kein Hinweis)'}`);
  await js(win, `document.querySelector('.access-hint')?.click()`);
  await wait(500);
  await shoot(win, dir, '12-kanalzugriff');
  await js(win, `[...document.querySelectorAll('.access .btn')].find(b=>b.textContent.includes('Schließen'))?.click()`);
  await js(win, `document.querySelector('.chatlist__head .icon-btn[aria-label="Einstellungen"]')?.click()`);
  await wait(700);
  await shoot(win, dir, '13-einstellungen');
  await js(win, `document.querySelector('.settings .icon-btn')?.click()`);

  // ---- Server beitreten (Vorschau; "In Discord beitreten" wird im Test NICHT geklickt) ----
  await js(win, `document.querySelector('.rail__add[aria-label="Server beitreten"]')?.click()`);
  await wait(400);
  await js(win, `(() => { const el = document.querySelector('#invite-input'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el,'https://discord.gg/moinclub'); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await js(win, `[...document.querySelectorAll('.join .btn')].find(b=>b.textContent.includes('Vorschau'))?.click()`);
  await wait(800);
  await shoot(win, dir, '14-server-beitreten');
  const card = await js(win, `document.querySelector('.join__card')?.textContent || '(keine Vorschau)'`);
  console.log(`[join] Vorschau: ${card}`);
  await js(win, `document.querySelector('.join .icon-btn')?.click()`);
  await wait(300);

  // ---- F7–F15 ----
  await js(win, `[...document.querySelectorAll('.chatrow')].find(b=>b.textContent.includes('allgemein'))?.click()`);
  await wait(1200);
  // Aktionsleiste sichtbar machen (simuliert Hover) und auf "Antworten" klicken
  await js(win, `(() => { const msgs=[...document.querySelectorAll('.msg--in')]; const m=msgs[msgs.length-1]; m?.classList.add('show-actions'); m?.querySelector('.msg-actions button[aria-label="Antworten"]')?.click(); })()`);
  await wait(400);
  await js(win, `(() => { const el=document.querySelector('.composer textarea'); const s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; s.call(el,'Stimmt 😄'); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await wait(300);
  await shoot(win, dir, '15-antworten-reaktionen');
  const shift = await js(win, 'JSON.stringify({ html: document.documentElement.scrollTop, body: document.body.scrollTop, root: document.getElementById("root").scrollTop })');
  console.log(`[layout] Seite verschoben? ${shift}`);
  const sizes = await js(win, 'JSON.stringify({ fenster: innerHeight, body: document.body.scrollHeight, layout: document.querySelector(".layout")?.offsetHeight, chat: document.querySelector(".chat")?.offsetHeight, liste: document.querySelector(".chatlist")?.offsetHeight, rail: document.querySelector(".rail")?.offsetHeight })');
  console.log(`[layout] Höhen: ${sizes}`);
  const f7 = await js(win, `JSON.stringify({ antwortLeiste: !!document.querySelector('.composer__bar'), reaktionen: document.querySelectorAll('.reaction').length, embeds: document.querySelectorAll('.embed').length, antwortZitate: document.querySelectorAll('.reply-quote').length, threadChips: document.querySelectorAll('.thread-chip').length, pins: [...document.querySelectorAll('.bubble__meta')].filter(x=>x.textContent.includes('📌')).length })`);
  console.log(`[f7-f15] Ansicht: ${f7}`);
  await js(win, "document.querySelectorAll('.show-actions').forEach((m) => m.classList.remove('show-actions'))");
  // Senden der Antwort → Gegenprobe: Antwort-Zitat + Absenden
  await js(win, `document.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  await wait(700);
  // Reaktion umschalten (👍 ist vom Bot gesetzt → entfernen)
  await js(win, `[...document.querySelectorAll('.reaction.is-me')][0]?.click()`);
  await wait(600);
  const afterActions = await js(win, `JSON.stringify({ gesendeteAntwort: [...document.querySelectorAll('.msg--out')].some(m=>m.textContent.includes('Stimmt') && m.querySelector('.reply-quote')), eigeneReaktionen: document.querySelectorAll('.reaction.is-me').length })`);
  console.log(`[f7-f15] Nach Aktionen: ${afterActions}`);
  // Threads-Seitenleiste
  await js(win, `document.querySelector('.chat__tools button[aria-label="Threads"]')?.click()`);
  await wait(700);
  await shoot(win, dir, '16-threads');
  // Thread öffnen
  await js(win, `document.querySelector('.thread-hit')?.click()`);
  await wait(900);
  const th = await js(win, `document.querySelector('.chat__head h1')?.textContent || ''`);
  console.log(`[f7-f15] Thread geöffnet: ${th}`);
  await js(win, `document.querySelector('.chat__head button[aria-label="Zurück"]')?.click()`);
  await wait(600);
  // Embed-Baukasten
  await js(win, `document.querySelector('.tool-btn[aria-label="Embed erstellen"]')?.click()`);
  await wait(300);
  await js(win, `(() => { const set=(sel,v,proto)=>{const el=document.querySelector(sel); Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true}));}; set('#emb-title','Treffen heute',HTMLInputElement); set('#emb-desc','Um **19 Uhr** in der Lounge – bringt Ideen mit!',HTMLTextAreaElement); })()`);
  await wait(300);
  await shoot(win, dir, '17-embed-baukasten');
  await js(win, `[...document.querySelectorAll('.embed-dialog .btn')].find(b=>b.textContent.includes('Abbrechen'))?.click()`);
  // Serversuche
  await js(win, `document.querySelector('.chat__tools button[aria-label="Suchen"]')?.click()`);
  await wait(300);
  await js(win, `[...document.querySelectorAll('.search-panel__tabs button')].find(b=>b.textContent.includes('Ganzer Server'))?.click()`);
  await wait(200);
  await js(win, `(() => { const el=document.querySelector('.search-panel__head input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'projekt'); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()`);
  await wait(800);
  await shoot(win, dir, '18-serversuche');
  const hits = await js(win, `document.querySelectorAll('.search-hit').length`);
  console.log(`[f7-f15] Serversuche-Treffer angezeigt: ${hits}`);
}

module.exports = { runScreenshots };
