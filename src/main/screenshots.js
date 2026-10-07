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

async function runScreenshots(win, dir, { demo, stats, simulate }) {
  fs.mkdirSync(dir, { recursive: true });
  await wait(3500);
  if (!demo) {
    await shoot(win, dir, '01-setup');
    return;
  }
  // Gleicher Ausgangszustand wie beim ersten Start (Aussehen, Sortierung): Auswahl früherer Läufe verwerfen
  const hadPrefs = await js(win, `(() => { const had = localStorage.getItem('pk.prefs.v1') !== null; localStorage.removeItem('pk.prefs.v1'); return had; })()`);
  if (hadPrefs) {
    win.webContents.reload();
    await wait(3500);
  }
  // Die App merkt sich den letzten Chat – für reproduzierbare Bilder immer bei #allgemein starten.
  await js(win, `[...document.querySelectorAll('.chatrow')].find(b=>b.textContent.includes('allgemein'))?.click()`);
  await wait(1200);
  await shoot(win, dir, '02-chat');
  // Bug aus Issue #1: Nachricht bearbeiten → abbrechen → Nachricht darf NICHT verschwinden (× und Esc)
  const editCheck = async (how) => {
    const info = await js(win, `(() => { const m=[...document.querySelectorAll('.msg--out')].filter(x=>x.querySelector('.msg-actions button[aria-label="Bearbeiten"]') && !x.querySelector('.poll')).at(-1); if(!m) return null; const id=m.dataset.mid; m.classList.add('show-actions'); m.querySelector('.msg-actions button[aria-label="Bearbeiten"]').click(); m.classList.remove('show-actions'); return { id, text: m.querySelector('.bubble')?.innerText.slice(0,40) }; })()`);
    if (!info) return 'keine eigene Nachricht';
    await wait(300);
    if (how === 'x') await js(win, `document.querySelector('.composer__bar--edit .icon-btn')?.click()`);
    else if (how === 'speichern') await js(win, `(() => { const el=document.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el, el.value + ' (bearbeitet)'); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()`);
    else await js(win, `document.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await wait(500);
    return js(win, `JSON.stringify({ wie: '${how}', sichtbar: Boolean(document.querySelector('[data-mid="${info.id}"] .bubble')), text: document.querySelector('[data-mid="${info.id}"] .bubble')?.innerText.slice(0,30) || null, feld: document.querySelector('.composer textarea')?.value.slice(0,20) })`);
  };
  // Entwurf im Feld darf beim Bearbeiten + Abbrechen nicht verloren gehen
  await js(win, `(() => { const el=document.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Mein Entwurf'); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await wait(200);
  console.log(`[edit] ${await editCheck('x')} | ${await editCheck('esc')} | ${await editCheck('speichern')}`);
  // Text markieren → Formatierungs-Leiste (Issue #1)
  await js(win, `(() => { const el=document.querySelector('.composer textarea'); el.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Das ist wichtig heute'); el.dispatchEvent(new Event('input',{bubbles:true})); const s=el.value.indexOf('wichtig'); el.setSelectionRange(s, s+7); el.dispatchEvent(new Event('select',{bubbles:true})); })()`);
  await wait(300);
  await shoot(win, dir, '33-formatieren');
  const bar = await js(win, `document.querySelectorAll('.format-bar button').length`);
  await js(win, `document.querySelector('.format-bar__btn--bold')?.click()`);
  await wait(200);
  const afterBold = await js(win, `document.querySelector('.composer textarea').value`);
  await js(win, `(() => { const el=document.querySelector('.composer textarea'); const s=el.value.indexOf('heute'); el.setSelectionRange(s, s+5); el.dispatchEvent(new KeyboardEvent('keydown',{key:'i',ctrlKey:true,bubbles:true})); })()`);
  await wait(200);
  const afterItalic = await js(win, `document.querySelector('.composer textarea').value`);
  console.log(`[format] Knöpfe: ${bar} · nach F: ${JSON.stringify(afterBold)} · nach Strg+I: ${JSON.stringify(afterItalic)}`);
  await js(win, `(() => { const el=document.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,''); el.dispatchEvent(new Event('input',{bubbles:true})); el.blur(); })()`);
  // Schnellbefehle (Issue #1: „es funktionieren keine Befehle“)
  const typeCmd = (t) => js(win, `(() => { const el=document.querySelector('.composer textarea'); el.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(t)}); el.setSelectionRange(${t.length},${t.length}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const enter = () => js(win, `document.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  await wait(400); // verzögertes Schließen vom vorigen Schritt abwarten
  await typeCmd('/');
  await wait(300);
  await shoot(win, dir, '34-befehle');
  const list = await js(win, `JSON.stringify({ titel: document.querySelector('.suggest__title')?.textContent, anzahl: document.querySelectorAll('.suggest__item').length })`);
  await js(win, `document.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await typeCmd('/shrug na gut');
  await enter();
  await wait(700);
  await typeCmd('/spoiler Das Ende');
  await enter();
  await wait(700);
  await typeCmd('/zitat Gute Idee!');
  await enter();
  await wait(900);
  const shown = await js(win, `JSON.stringify({ shrug: [...document.querySelectorAll('.msg--out .msg__content')].some(e=>e.innerText.includes('na gut ¯\\\\_(ツ)_/¯')), spoiler: Boolean(document.querySelector('.msg--out .spoiler')), zitat: Boolean(document.querySelector('.msg--out .mdquote')) })`);
  console.log(`[befehle] Liste: ${list} · angezeigt: ${shown}`);
  const sys = await js(win, `JSON.stringify([...document.querySelectorAll('.sysmsg')].map(e=>e.textContent.slice(0,60)))`);
  console.log(`[system] Systemnachrichten: ${sys}`);
  await js(win, `document.querySelector('.sysmsg')?.scrollIntoView({block:'center'})`);
  await wait(400);
  await shoot(win, dir, '02b-systemnachricht');
  const sysStyle = await js(win, `(() => { const e=document.querySelector('.msg--system'); return e ? getComputedStyle(e).justifyContent : null; })()`);
  console.log(`[system] Ausrichtung: ${sysStyle}`);
  await js(win, `document.querySelector('.msglist .msg:last-child')?.scrollIntoView()`);
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
  // Umfrage: Karte prüfen, Dialog zeigen
  const pollInfo = await js(win, `JSON.stringify({ karten: document.querySelectorAll('.poll').length, antworten: document.querySelectorAll('.poll__a').length, gewinner: document.querySelector('.poll__a.is-win') ? 1 : 0 })`);
  console.log(`[poll] Anzeige: ${pollInfo}`);
  await js(win, `document.querySelector('.tool-btn[aria-label="Umfrage erstellen"]')?.click()`);
  await wait(300);
  await js(win, `(() => { const set=(el,v)=>{ Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); }; set(document.querySelector('#poll-q'),'Wohin geht der nächste Ausflug?'); const a=document.querySelectorAll('.poll-dialog input[aria-label^="Antwort"]'); set(a[0],'Berge'); set(a[1],'See'); })()`);
  await wait(300);
  await shoot(win, dir, '19-umfrage');
  await js(win, `[...document.querySelectorAll('.poll-dialog .btn')].find(b=>b.textContent.includes('hinzufügen'))?.click()`);
  await wait(200);
  await js(win, `document.querySelector('.composer textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  await wait(800);
  const pollSent = await js(win, `[...document.querySelectorAll('.msg--out .poll__q')].some(q=>q.textContent.includes('Ausflug'))`);
  console.log(`[poll] Gesendete Umfrage sichtbar: ${pollSent}`);
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
  await js(win, `document.querySelector('.search-panel .icon-btn')?.click()`);
  // Bot-Profil in den Einstellungen: Beschreibung ändern, speichern, Ergebnis prüfen
  await js(win, `document.querySelector('.chatlist__head .icon-btn[aria-label="Einstellungen"]')?.click()`);
  await wait(800);
  await js(win, `(() => { const el=document.querySelector('#profile-desc'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Ich helfe beim Organisieren von Treffen 🎉'); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await wait(200);
  await shoot(win, dir, '20-bot-profil');
  await js(win, `[...document.querySelectorAll('.settings .btn')].find(b=>b.textContent.includes('Profil speichern'))?.click()`);
  await wait(600);
  const prof = await js(win, `JSON.stringify({ felder: document.querySelectorAll('#profile-name,#profile-desc,#profile-nick').length, toast: [...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' | ').slice(0,80), gespeichertAktiv: !document.querySelector('.settings .btn--primary')?.disabled })`);
  console.log(`[profil] ${prof}`);
  await js(win, `document.querySelector('.settings .icon-btn')?.click()`);
  await wait(300);
  // Aktionsleiste darf den Namen über der Nachricht nicht verdecken (Issue #1, Screenshot JoniMoni)
  const overlap = await js(win, `(() => { const m=[...document.querySelectorAll('.msg--in')].find(x=>x.querySelector('.bubble__author')); if(!m) return 'keine Nachricht'; m.classList.add('show-actions'); const a=m.querySelector('.msg-actions').getBoundingClientRect(), n=m.querySelector('.bubble__author').getBoundingClientRect(); const hit = a.left < n.right && a.right > n.left && a.top < n.bottom && a.bottom > n.top; m.classList.remove('show-actions'); return hit ? 'VERDECKT' : 'frei'; })()`);
  console.log(`[ui] Name neben Aktionsleiste: ${overlap}`);
  // Chatliste nach Kategorien, eine Kategorie einklappen
  await js(win, `document.querySelector('.chatlist__head .icon-btn[aria-label="Sortierung wechseln"]')?.click()`);
  await wait(300);
  const cats = await js(win, `document.querySelectorAll('.chatlist__category').length`);
  const rowsBefore = await js(win, `document.querySelectorAll('.chatlist__items .chatrow').length`);
  await js(win, `[...document.querySelectorAll('.chatlist__category')].find(b=>b.textContent.includes('Projekte'))?.click()`);
  await wait(300);
  const rowsAfter = await js(win, `document.querySelectorAll('.chatlist__items .chatrow').length`);
  await shoot(win, dir, '21-kategorien');
  console.log(`[ui] Kategorien: ${cats}, Zeilen vorher ${rowsBefore}, eingeklappt ${rowsAfter}`);
  await js(win, `[...document.querySelectorAll('.chatlist__category')].find(b=>b.textContent.includes('Projekte'))?.click()`);
  await js(win, `document.querySelector('.chatlist__head .icon-btn[aria-label="Sortierung wechseln"]')?.click()`);
  // Privatnachrichten: Bereich öffnen, Chat mit Chiara, antworten, neuen Privatchat mit Anna starten
  await js(win, `document.querySelector('.rail__dm')?.click()`);
  await wait(600);
  const dmRows = await js(win, `[...document.querySelectorAll('.chatlist__items .chatrow')].map(r=>r.querySelector('.chatrow__name')?.textContent).join(',')`);
  await js(win, `document.querySelector('.chatlist__items .chatrow')?.click()`);
  await wait(700);
  await js(win, `(() => { const el=document.querySelector('.composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Erinnerung steht ✅'); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()`);
  await wait(800);
  await shoot(win, dir, '22-privatchat');
  const dmInfo = await js(win, `JSON.stringify({ blasen: document.querySelectorAll('.msg').length, gesendet: [...document.querySelectorAll('.msg--out')].some(m=>m.textContent.includes('Erinnerung steht')), kopf: document.querySelector('.chat__head')?.textContent.slice(0,80) })`);
  console.log(`[dm] Liste: ${dmRows} · Chat: ${dmInfo}`);
  await js(win, `document.querySelector('.newdm-btn')?.click()`);
  await wait(300);
  await js(win, `(() => { const el=document.querySelector('#newdm-query'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'An'); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await wait(600);
  await shoot(win, dir, '23-neuer-privatchat');
  await js(win, `document.querySelector('.newdm__item')?.click()`);
  await wait(800);
  const dmRows2 = await js(win, `[...document.querySelectorAll('.chatlist__items .chatrow')].map(r=>r.querySelector('.chatrow__name')?.textContent).join(',')`);
  console.log(`[dm] Nach "Neuer Privatchat": ${dmRows2} · offen: ${await js(win, `document.querySelector('.chat__head')?.textContent.slice(0,40)`)}`);
  // KI-Agenten (Beta): einschalten, Anbieter + Modell + Schlüssel, Verbindung testen, Auftrag anlegen und sofort ausführen
  const SET = `const setVal=(el,v)=>{ const proto=el instanceof HTMLSelectElement?HTMLSelectElement:el instanceof HTMLTextAreaElement?HTMLTextAreaElement:HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(el,v); el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true})); };`;
  const clickText = (sel, text) => js(win, `[...document.querySelectorAll('${sel}')].find(b=>b.textContent.includes('${text}'))?.click()`);
  await js(win, `document.querySelector('.rail__item:not(.rail__dm):not(.rail__add)')?.click()`);
  await wait(400);
  await js(win, `document.querySelector('.chatlist__head .icon-btn[aria-label="Einstellungen"]')?.click()`);
  await wait(600);
  await js(win, `[...document.querySelectorAll('.settings label.composer__ping')].find(l=>l.textContent.includes('Beta'))?.querySelector('input')?.click()`);
  await wait(500);
  await js(win, `(() => { ${SET} setVal(document.querySelector('#ai-model'),'demo-modell'); })()`);
  await wait(200);
  await clickText('.ai-box .btn', 'Übernehmen');
  await wait(300);
  await js(win, `(() => { ${SET} setVal(document.querySelector('#ai-key'),'sk-demo-1234567890'); })()`);
  await wait(100);
  await clickText('.ai-box .btn', 'Speichern');
  await wait(300);
  await clickText('.ai-box .btn', 'Verbindung testen');
  await wait(500);
  const aiTest = await js(win, `[...document.querySelectorAll('.toast')].map(t=>t.textContent).find(t=>t.includes('KI antwortet'))||'(kein Test-Hinweis)'`);
  await clickText('.ai-box .btn', 'Neuer Auftrag');
  await wait(300);
  await js(win, `(() => { ${SET} setVal(document.querySelector('#ai-job-name'),'Morgengruß'); setVal(document.querySelector('#ai-job-prompt'),'Schreib einen kurzen, fröhlichen Guten-Morgen-Gruß mit dem Plan für heute.'); const t=document.querySelector('#ai-job-target'); const o=[...t.options].find(o=>o.textContent.includes('#allgemein')); if(o) setVal(t,o.value); })()`);
  await wait(300);
  // Issue #12: Vorschau vor dem Speichern – KI schreibt, aber NICHTS wird gepostet
  const sentBefore = await js(win, `document.querySelectorAll('.msg--out').length`);
  await clickText('.ai-job-form .btn', 'Vorschau');
  await wait(800);
  const prev = await js(win, `JSON.stringify({ vorschau: document.querySelector('.ai-preview__text')?.textContent.slice(0,50) || null, status: document.querySelector('.ai-status')?.textContent.replace(/\\s+/g,' ').slice(0,140) || null })`);
  const sentAfter = await js(win, `document.querySelectorAll('.msg--out').length`);
  console.log(`[ki-vorschau] ${prev} · gepostet: ${sentAfter - sentBefore}`);
  await win.webContents.executeJavaScript(`document.querySelector('.ai-preview')?.scrollIntoView({block:'center'})`);
  await wait(300);
  await shoot(win, dir, '24-ki-auftrag');
  await clickText('.ai-job-form .btn', 'Auftrag speichern');
  await wait(500);
  await clickText('.ai-job .btn', 'Jetzt');
  await wait(1000);
  await win.webContents.executeJavaScript(`document.querySelector('.ai-box')?.scrollIntoView({block:'end'})`);
  await wait(300);
  await shoot(win, dir, '25-ki-agenten');
  const aiJob = await js(win, `JSON.stringify({ auftraege: document.querySelectorAll('.ai-job').length, status: document.querySelector('.ai-job .small.ok, .ai-job .small.warn')?.textContent.slice(0,90) || null, schluesselSichtbar: document.body.innerHTML.includes('sk-demo-1234567890') })`);
  console.log(`[ki] Test: ${aiTest.slice(0,60)} · Auftrag: ${aiJob}`);
  await js(win, `document.querySelector('.settings .icon-btn')?.click()`);
  await wait(400);
  await js(win, `[...document.querySelectorAll('.chatlist__items .chatrow')].find(r=>r.textContent.includes('allgemein'))?.click()`);
  await wait(800);
  const posted = await js(win, `[...document.querySelectorAll('.msg--out')].some(m=>m.textContent.includes('Guten Morgen, Team'))`);
  console.log(`[ki] Nachricht im Kanal sichtbar: ${posted}`);
  // Antwort-Agent: für #allgemein einschalten, dann erwähnt Anna den Bot → KI antwortet als Reply
  await js(win, `document.querySelector('.chatlist__head .icon-btn[aria-label="Einstellungen"]')?.click()`);
  await wait(500);
  await js(win, `[...document.querySelectorAll('.ai-responder label.composer__ping')].find(l=>l.textContent.includes('erwähnt'))?.querySelector('input')?.click()`);
  await wait(300);
  await js(win, `[...document.querySelectorAll('.ai-channel')].find(l=>l.textContent.includes('#allgemein'))?.querySelector('input')?.click()`);
  await js(win, `(() => { const el=document.querySelector('#ai-instr'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Du bist PKBot, locker und hilfsbereit.'); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await wait(200);
  await win.webContents.executeJavaScript(`document.querySelector('.ai-responder')?.scrollIntoView({block:'center'})`);
  await wait(300);
  await shoot(win, dir, '29-ki-antworten');
  await clickText('.ai-responder .btn', 'Speichern');
  await wait(400);
  await js(win, `document.querySelector('.settings .icon-btn')?.click()`);
  await wait(400);
  simulate?.mention('Wann ist das Treffen heute?');
  await wait(1500);
  await shoot(win, dir, '30-ki-antwort-im-chat');
  const reply = await js(win, `JSON.stringify({ hinweis: [...document.querySelectorAll('.toast')].map(t=>t.textContent).find(t=>t.includes('geantwortet'))?.slice(0,60) || null, antwortAlsReply: [...document.querySelectorAll('.msg--out')].some(m=>m.querySelector('.reply-quote') && m.textContent.includes('19 Uhr** in der Lounge') || m.textContent.includes('in der Lounge 🎉')) })`);
  console.log(`[ki-antwort] ${reply}`);
  // Aussehen: Einstellungen zeigen, dann Designs „Hell“ und „Lila + Pink“ im Chat
  await js(win, `document.querySelector('.chatlist__head .icon-btn[aria-label="Einstellungen"]')?.click()`);
  await wait(600);
  await shoot(win, dir, '26-aussehen');
  const look = await js(win, `JSON.stringify({ designs: document.querySelectorAll('.look-theme').length, farben: document.querySelectorAll('.look-accent').length })`);
  await clickText('.look-theme', 'Hell');
  await wait(200);
  await js(win, `document.querySelector('.settings .icon-btn')?.click()`);
  await wait(500);
  await shoot(win, dir, '27-design-hell');
  const hell = await js(win, `JSON.stringify({ theme: document.documentElement.dataset.theme, hintergrund: getComputedStyle(document.body).backgroundColor })`);
  await js(win, `document.querySelector('.chatlist__head .icon-btn[aria-label="Einstellungen"]')?.click()`);
  await wait(400);
  await clickText('.look-theme', 'Lila');
  await js(win, `document.querySelector('.look-accent[aria-label="Farbe #f472b6"]')?.click()`);
  await clickText('.look-seg button', 'Kompakt');
  await wait(200);
  await js(win, `document.querySelector('.settings .icon-btn')?.click()`);
  await wait(500);
  await shoot(win, dir, '28-design-lila');
  const lila = await js(win, `JSON.stringify({ theme: document.documentElement.dataset.theme, akzent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), dichte: document.documentElement.dataset.density })`);
  console.log(`[look] ${look} · Hell: ${hell} · Lila: ${lila}`);
  await js(win, `localStorage.removeItem('pk.prefs.v1')`);
  // Updates: Knopf „Jetzt nach Updates suchen“ muss eine Rückmeldung geben (Issue #1)
  await js(win, `document.querySelector('.chatlist__head .icon-btn[aria-label="Einstellungen"]')?.click()`);
  await wait(500);
  await clickText('.settings .btn', 'nach Updates suchen');
  await wait(300);
  const during = await js(win, `[...document.querySelectorAll('.settings .btn')].map(b=>b.textContent).find(t=>t.includes('Suche'))||null`);
  await wait(1800);
  await js(win, `[...document.querySelectorAll('.settings h4')].find(h=>h.textContent.includes('Updates'))?.scrollIntoView({block:'center'})`);
  await wait(300);
  await shoot(win, dir, '31-updates');
  const updAfter = await js(win, `JSON.stringify({ status: [...document.querySelectorAll('.settings p')].map(p=>p.textContent).find(t=>t.includes('PKMessenger v'))?.slice(0,90), hinweis: [...document.querySelectorAll('.toast')].map(t=>t.textContent).find(t=>t.includes('Update'))?.slice(0,70) || null })`);
  const upd = JSON.stringify({ waehrend: during, ...JSON.parse(updAfter) });
  console.log(`[update] ${upd}`);
  await js(win, `document.querySelector('.settings .icon-btn')?.click()`);
  // Töne (Issue #12): Testton in den Einstellungen, dann löst eine Erwähnung den Erwähnungston aus
  await js(win, `document.querySelector('.chatlist__head .icon-btn[aria-label="Einstellungen"]')?.click()`);
  await wait(500);
  await js(win, `[...document.querySelectorAll('.settings h4')].find(h=>h.textContent.includes('Benachrichtigungen'))?.scrollIntoView({block:'start'})`);
  await js(win, `document.querySelector('.sound-event button[aria-label^="Testton: Jemand erwähnt"]')?.click()`);
  await wait(400);
  await shoot(win, dir, '32-toene');
  const overflow = await js(win, `(() => { const m=document.querySelector('.settings'); return m ? m.scrollWidth - m.clientWidth : -1; })()`);
  console.log(`[toene] Einstellungen waagerecht übergelaufen um ${overflow}px`);
  const test1 = await js(win, `JSON.stringify({ zeilen: document.querySelectorAll('.sound-event').length, log: (window.__pkSoundLog||[]).map(e=>e.event+':'+e.preset) })`);
  await js(win, `document.querySelector('.settings .icon-btn')?.click()`);
  await wait(1700); // Drosselung abwarten
  simulate?.mention('Hörst du mich?');
  await wait(800);
  const test2 = await js(win, `JSON.stringify((window.__pkSoundLog||[]).slice(0,3).map(e=>e.event+':'+e.preset))`);
  console.log(`[toene] Einstellungen: ${test1} · nach Erwähnung: ${test2}`);
}

module.exports = { runScreenshots };
