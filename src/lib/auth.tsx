import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { deviceReady, getDeviceId, getDeviceName } from './device';
import { setSyncUser } from '../data/setlists';

export type AuthStatus = 'loading' | 'demo' | 'signedOut' | 'deviceLimit' | 'ready' | 'error';

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
  blocked?: boolean;
  max_devices: number;
}

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  error: string | null;
  /** Vuelve a intentar registrar este dispositivo (p. ej. tras desvincular otro). */
  retryDevice: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function friendlyError(message: string): string {
  if (message.includes('DEVICE_LIMIT')) return 'Tu cuenta ya está activa en el máximo de dispositivos permitidos.';
  if (message.includes('INVITE_INVALID')) return 'El código de invitación no es válido o ya se usó.';
  if (message.includes('UNLINK_TOO_SOON')) return 'Sólo puedes desvincular un dispositivo cada 30 días. Contacta con el administrador.';
  if (message.includes('BLOCKED')) return 'Tu cuenta está desactivada. Contacta con el administrador.';
  if (message.includes('CANNOT_DEMOTE_SELF')) return 'No puedes quitarte a ti mismo el permiso de administrador ni bloquearte.';
  if (message.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (message.includes('Email not confirmed')) return 'Confirma tu correo antes de entrar (revisa tu bandeja de entrada).';
  if (message.includes('Database error saving new user')) return 'El código de invitación no es válido o ya se usó.';
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(supabase ? 'loading' : 'demo');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkDevice = useCallback(async (s: Session | null) => {
    if (!supabase) return;
    setSession(s);
    if (!s) {
      setSyncUser(null);
      setProfile(null);
      setStatus('signedOut');
      return;
    }
    await deviceReady;
    const { error: rpcError } = await supabase.rpc('register_device', {
      p_device_id: getDeviceId(),
      p_name: getDeviceName(),
    });
    if (rpcError) {
      if (rpcError.message.includes('DEVICE_LIMIT')) {
        setStatus('deviceLimit');
      } else {
        setError(friendlyError(rpcError.message));
        setStatus('error');
      }
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
    const p = (data as Profile) ?? null;
    setProfile(p);
    setSyncUser({ id: s.user.id, name: p?.display_name || s.user.email || 'Usuario', isAdmin: !!p?.is_admin });
    setError(null);
    setStatus('ready');
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => checkDevice(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Se difiere para no llamar a Supabase dentro del propio callback.
        setTimeout(() => checkDevice(s), 0);
      } else if (event === 'TOKEN_REFRESHED') {
        setSession(s);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [checkDevice]);

  const value: AuthState = {
    status,
    session,
    profile,
    error,
    retryDevice: () => checkDevice(session),
    signOut: async () => {
      await supabase?.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
