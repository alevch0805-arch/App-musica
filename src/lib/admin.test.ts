import { describe, expect, it } from 'vitest';
import { generateInviteCode, inviteMessage, inviteStatus, relativeDay, type InviteCode } from './admin';

const code = (p: Partial<InviteCode>): InviteCode => ({ code: 'X', note: null, max_uses: 1, uses: 0, expires_at: null, created_at: '2026-01-01', ...p });

describe('panel de administrador', () => {
  it('genera códigos legibles', () => {
    const c = generateInviteCode();
    expect(c).toMatch(/^HIM-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(c.slice(4)).not.toMatch(/[01OIL]/);
    expect(generateInviteCode()).not.toBe(c);
  });
  it('calcula el estado de la invitación', () => {
    const now = new Date('2026-11-04T12:00:00Z');
    expect(inviteStatus(code({}), now)).toBe('active');
    expect(inviteStatus(code({ uses: 1 }), now)).toBe('used');
    expect(inviteStatus(code({ expires_at: '2026-11-01T00:00:00Z' }), now)).toBe('expired');
    expect(inviteStatus(code({ max_uses: 5, uses: 2, expires_at: '2026-12-01T00:00:00Z' }), now)).toBe('active');
  });
  it('arma el mensaje de invitación', () => {
    const m = inviteMessage('HIM-AAAA-BBBB', 'https://himnos.example/', 'Para Luis');
    expect(m).toContain('Hola, Luis:');
    expect(m).toContain('HIM-AAAA-BBBB');
    expect(m).toContain('https://himnos.example/');
  });
  it('fechas relativas', () => {
    const now = new Date('2026-11-04T12:00:00Z');
    expect(relativeDay('2026-11-04T08:00:00Z', now)).toBe('hoy');
    expect(relativeDay('2026-11-03T08:00:00Z', now)).toBe('ayer');
    expect(relativeDay('2026-10-30T08:00:00Z', now)).toBe('hace 5 días');
  });
});
