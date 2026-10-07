'use strict';

// App-Sperre mit Passwort (Issue #1: „in der App Passwort … Sicherheit hinzufügen“).
// Gespeichert wird NUR ein salziger scrypt-Hash (nie das Passwort). Solange gesperrt ist, lehnt ipc.js alle
// Anfragen der Oberfläche ab (außer Entsperren) – die Sperre ist also nicht nur ein Bildschirm-Vorhang.
const crypto = require('node:crypto');

const MIN_LENGTH = 4;
const MAX_FAILS = 5;
const COOLDOWN_MS = 30000;
const IDLE_CHOICES = [0, 5, 15, 60]; // Minuten ohne Eingabe am PC → automatisch sperren (0 = aus)

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
}

function lockError(message, hint = '') {
  return Object.assign(new Error(message), { code: 'VALIDATION', hint });
}

function createAppLock({ store, now = () => Date.now(), emit = () => {} }) {
  const cfg = () => {
    const raw = store.get().appLock;
    return raw && typeof raw === 'object' && typeof raw.hash === 'string' && typeof raw.salt === 'string' ? raw : null;
  };
  let unlocked = !cfg(); // mit gesetztem Passwort startet die App gesperrt
  let fails = 0;
  let blockedUntil = 0;

  const status = () => ({ enabled: Boolean(cfg()), locked: !unlocked, idleMinutes: cfg()?.idleMinutes ?? 0, hello: cfg()?.hello === true, blockedUntil: blockedUntil > now() ? blockedUntil : null });

  function check(password) {
    const c = cfg();
    if (!c) return true;
    if (typeof password !== 'string') return false;
    const a = Buffer.from(hash(password, c.salt), 'hex');
    const b = Buffer.from(c.hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  function verify(password) {
    if (blockedUntil > now()) throw lockError('Zu viele Fehlversuche.', `Bitte ${Math.ceil((blockedUntil - now()) / 1000)} Sekunden warten.`);
    if (!check(password)) {
      fails += 1;
      if (fails >= MAX_FAILS) {
        blockedUntil = now() + COOLDOWN_MS;
        fails = 0;
      }
      throw lockError('Falsches Passwort.');
    }
    fails = 0;
    unlocked = true;
    emit('lock', status());
    return status();
  }

  /** Passwort setzen oder ändern (zum Ändern muss das alte stimmen). */
  function set({ password, current, idleMinutes = 0 }) {
    if (cfg() && !check(current)) throw lockError('Das bisherige Passwort stimmt nicht.');
    if (typeof password !== 'string' || password.length < MIN_LENGTH || password.length > 200) throw lockError(`Das Passwort braucht mindestens ${MIN_LENGTH} Zeichen.`);
    if (!IDLE_CHOICES.includes(idleMinutes)) throw lockError('Ungültige Zeit für die automatische Sperre.');
    const salt = crypto.randomBytes(16).toString('hex');
    store.set('appLock', { salt, hash: hash(password, salt), idleMinutes, hello: cfg()?.hello === true });
    unlocked = true;
    emit('lock', status());
    return status();
  }

  /** Windows Hello (Fingerabdruck/Gesicht/PIN) als schneller Weg zum Entsperren. Das Passwort bleibt immer gültig. */
  function setHello({ on }) {
    const c = cfg();
    if (!c) throw lockError('Erst ein App-Passwort festlegen.', 'Windows Hello ist ein schnellerer Weg zum Entsperren, das Passwort bleibt als Ersatz.');
    store.set('appLock', { ...c, hello: on === true });
    return status();
  }

  async function verifyHello(helloImpl) {
    const c = cfg();
    if (!c) return status();
    if (!c.hello) throw lockError('Windows Hello ist für PKMessenger nicht eingeschaltet.');
    if (blockedUntil > now()) throw lockError('Zu viele Fehlversuche.', `Bitte ${Math.ceil((blockedUntil - now()) / 1000)} Sekunden warten.`);
    if (!(await helloImpl.verify())) throw lockError('Windows Hello hat nicht bestätigt.', 'Nochmal versuchen oder das Passwort eingeben.');
    fails = 0;
    unlocked = true;
    emit('lock', status());
    return status();
  }

  function setIdle({ idleMinutes }) {
    const c = cfg();
    if (!c) throw lockError('Erst ein Passwort festlegen.');
    if (!IDLE_CHOICES.includes(idleMinutes)) throw lockError('Ungültige Zeit für die automatische Sperre.');
    store.set('appLock', { ...c, idleMinutes });
    return status();
  }

  function clear({ current }) {
    if (!cfg()) return status();
    if (!check(current)) throw lockError('Das Passwort stimmt nicht.');
    store.set('appLock', null);
    unlocked = true;
    emit('lock', status());
    return status();
  }

  function lock() {
    if (!cfg()) return status();
    unlocked = false;
    emit('lock', status());
    return status();
  }

  /** Vom Main-Prozess regelmäßig aufgerufen: PC lange unbenutzt → sperren. */
  function idleTick(systemIdleSeconds) {
    const c = cfg();
    if (c && unlocked && c.idleMinutes > 0 && systemIdleSeconds >= c.idleMinutes * 60) lock();
  }

  return { status, verify, verifyHello, set, setHello, setIdle, clear, lock, idleTick, isLocked: () => !unlocked };
}

module.exports = { createAppLock, MIN_LENGTH, MAX_FAILS, COOLDOWN_MS, IDLE_CHOICES };
