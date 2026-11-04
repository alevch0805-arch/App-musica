/**
 * Identificador del dispositivo. Se genera una vez y se guarda en el equipo.
 * Nota: en la versión web, si el usuario borra los datos del navegador se crea
 * un identificador nuevo (cuenta como otro dispositivo). En la app nativa
 * (Capacitor) conviene sustituirlo por Device.getId(), que es estable.
 */
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

export function getDeviceName(): string {
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
