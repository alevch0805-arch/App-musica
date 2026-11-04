/** Utilidades del panel de administrador. */

export interface InviteCode {
  code: string;
  note: string | null;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  created_at: string;
}

export interface AdminProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
  blocked: boolean;
  max_devices: number;
  invite_code: string | null;
  created_at: string;
}

export interface AdminDevice {
  id: string;
  user_id: string;
  device_id: string;
  name: string | null;
  created_at: string;
  last_seen: string;
}

// Sin letras ni números que se confundan al dictarlos (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(8);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `HIM-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export type InviteStatus = 'active' | 'used' | 'expired';

export function inviteStatus(c: InviteCode, now = new Date()): InviteStatus {
  if (c.uses >= c.max_uses) return 'used';
  if (c.expires_at && new Date(c.expires_at) <= now) return 'expired';
  return 'active';
}

export const STATUS_LABEL: Record<InviteStatus, string> = { active: 'Activa', used: 'Usada', expired: 'Caducada' };

/** Mensaje listo para enviar por WhatsApp o correo. */
export function inviteMessage(code: string, appUrl: string, note?: string | null): string {
  const hello = note ? `Hola, ${note.replace(/^para\s+/i, '')}:` : 'Hola:';
  return [
    hello,
    '',
    'Te invito a la app de himnos y acordes.',
    `1. Ábrela aquí: ${appUrl}`,
    '2. Pulsa «Registrarme» y usa este código de invitación:',
    `   ${code}`,
    '',
    'Tu cuenta se puede usar en 2 dispositivos.',
  ].join('\n');
}

export function appUrl(): string {
  return location.origin + location.pathname;
}

/** Fecha relativa sencilla: "hoy", "ayer", "hace 5 días", o la fecha. */
export function relativeDay(iso: string, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}
