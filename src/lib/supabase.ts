import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getDeviceId } from './device';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Cliente de Supabase, o null si la app está en modo demo (sin servidor).
 * Cada petición lleva la cabecera x-device-id: la base de datos sólo entrega
 * los himnos a dispositivos registrados (ver supabase/migrations).
 */
export const supabase: SupabaseClient | null = url && anonKey
  ? createClient(url, anonKey, {
      global: { headers: { 'x-device-id': getDeviceId() } },
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

export const isDemo = supabase === null;
