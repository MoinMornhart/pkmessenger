// Android-Funktionen über Capacitor – mit sicheren Ersatzlösungen, wenn die Seite (z. B. im Bildtest am PC)
// nicht in der echten App läuft. Der Token liegt NUR im Android-Schlüsselspeicher (Keystore, AES-GCM),
// außerhalb der App nie (auch nicht im localStorage).
import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

export const isNative = () => Capacitor.isNativePlatform();

const memory = new Map(); // nur für den Bildtest am PC: Geheimnisse bleiben im Arbeitsspeicher

export const secure = {
  async get(key) {
    if (!isNative()) return memory.get(key) ?? null;
    try {
      const v = await SecureStorage.get(key, false);
      return typeof v === 'string' ? v : null;
    } catch {
      return null;
    }
  },
  async set(key, value) {
    if (!isNative()) return void memory.set(key, value);
    await SecureStorage.set(key, value, false, false); // nicht in die Cloud-Sicherung
  },
  async remove(key) {
    if (!isNative()) return void memory.delete(key);
    await SecureStorage.remove(key, false).catch(() => {});
  },
};

export async function openExternal(url) {
  if (isNative()) await Browser.open({ url });
  else window.open(url, '_blank', 'noopener');
}

export async function appVersion() {
  if (!isNative()) return globalThis.__PK_VERSION__ || null;
  try {
    return (await App.getInfo()).version;
  } catch {
    return globalThis.__PK_VERSION__ || null;
  }
}

/** Zurück-Taste des Handys → Oberfläche entscheidet (Dialog schließen, zur Chatliste, App verlassen). */
export function onBackButton(fn) {
  if (!isNative()) return () => {};
  const h = App.addListener('backButton', () => fn(() => App.exitApp()));
  return () => h.then((x) => x.remove());
}

/** App kommt zurück in den Vordergrund (Android trennt im Hintergrund oft die Verbindung). */
export function onResume(fn) {
  if (!isNative()) return () => {};
  const h = App.addListener('resume', fn);
  return () => h.then((x) => x.remove());
}
