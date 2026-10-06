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

async function runScreenshots(win, dir, { demo }) {
  fs.mkdirSync(dir, { recursive: true });
  await wait(3500);
  if (!demo) {
    await shoot(win, dir, '01-setup');
    return;
  }
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
}

module.exports = { runScreenshots };
