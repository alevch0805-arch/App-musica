/**
 * Identificador del dispositivo.
 * - En la app de Android/iPhone (Capacitor) se usa el identificador del propio
 *   teléfono, que no cambia aunque se borren los datos o se reinstale la app.
 * - En el navegador se genera uno y se guarda; si el usuario borra los datos
 *   del navegador, cuenta como un dispositivo nuevo.
 */
import { Capacitor } from '@capacitor/core';
import { load, save } from './storage';

const KEY = 'device-id';

export function getDeviceId(): string {
  let id = load<string | null>(KEY, null);
  if (!id) {
    id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    save(KEY, id);
  }
  return id;
}

/** Se resuelve cuando el identificador definitivo está listo (en la app nativa es asíncrono). */
export const deviceReady: Promise<void> = (async () => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Device } = await import('@capacitor/device');
    const { identifier } = await Device.getId();
    if (identifier) save(KEY, `${Capacitor.getPlatform()}-${identifier}`);
    const info = await Device.getInfo();
    const model = [info.manufacturer, info.model].filter(Boolean).join(' ');
    save('device-name', `${model || (info.platform === 'ios' ? 'iPhone' : 'Android')} · app`);
  } catch {
    /* si falla, se usa el identificador guardado */
  }
})();

export function getDeviceName(): string {
  if (Capacitor.isNativePlatform()) {
    return load<string | null>('device-name', null) ?? (Capacitor.getPlatform() === 'ios' ? 'iPhone · app' : 'Android · app');
  }
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'Android'
    : /iPhone/i.test(ua) ? 'iPhone'
    : /iPad/i.test(ua) ? 'iPad'
    : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X/i.test(ua) ? 'Mac'
    : /Linux/i.test(ua) ? 'Linux'
    : 'Dispositivo';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : '';
  return browser ? `${os} · ${browser}` : os;
}
