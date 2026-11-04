/**
 * Fuente de datos: himnarios del servidor (Supabase) o, en modo demo, los
 * incluidos en la app. Siempre se añaden los cantos propios del usuario
 * ("Mis cantos"), guardados en el dispositivo.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { load, save } from '../lib/storage';
import { demoHymnals, demoHymns } from './demo';
import type { Hymn, Hymnal, Library } from './types';

export const CUSTOM_HYMNAL: Hymnal = { id: 'custom', name: 'Mis cantos', description: 'Cantos que has añadido tú (sólo en este dispositivo).' };
const CACHE_KEY = 'library-cache';
const CUSTOM_KEY = 'custom-hymns';

let cached: Library | null = null;
const listeners = new Set<(l: Library) => void>();

async function fetchServer(): Promise<Library> {
  if (!supabase) return { hymnals: demoHymnals, hymns: demoHymns, source: 'demo' };
  try {
    const [hymnals, hymns] = await Promise.all([
      supabase.from('hymnals').select('id, name, description').order('sort').order('name'),
      supabase.from('hymns').select('id, hymnal_id, number, title, chordpro, video_id, sync_times').order('number'),
    ]);
    if (hymnals.error) throw hymnals.error;
    if (hymns.error) throw hymns.error;
    const lib: Library = {
      hymnals: hymnals.data as Hymnal[],
      hymns: hymns.data.map((h) => ({
        id: h.id,
        hymnalId: h.hymnal_id,
        number: h.number,
        title: h.title,
        chordpro: h.chordpro,
        videoId: h.video_id,
        syncTimes: h.sync_times,
      })),
      source: 'server',
    };
    save(CACHE_KEY, lib); // para poder usar la app sin conexión
    return lib;
  } catch (e) {
    const offline = load<Library | null>(CACHE_KEY, null);
    if (offline) return { ...offline, source: 'cache' };
    throw e;
  }
}

function withCustom(lib: Library): Library {
  const custom = loadCustomHymns();
  return {
    ...lib,
    hymnals: custom.length ? [...lib.hymnals, CUSTOM_HYMNAL] : lib.hymnals,
    hymns: [...lib.hymns, ...custom],
  };
}

export function refreshLibrary(): Promise<Library> {
  return fetchServer().then((lib) => {
    cached = withCustom(lib);
    listeners.forEach((l) => l(cached!));
    return cached;
  });
}

export function useLibrary(): { library: Library | null; error: string | null } {
  const [library, setLibrary] = useState<Library | null>(cached);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listeners.add(setLibrary);
    if (!cached) refreshLibrary().catch((e: Error) => setError(e.message));
    return () => {
      listeners.delete(setLibrary);
    };
  }, []);
  return { library, error };
}

// --- Cantos propios -------------------------------------------------------

export function loadCustomHymns(): Hymn[] {
  return load<Hymn[]>(CUSTOM_KEY, []);
}

export function saveCustomHymn(hymn: Hymn): void {
  const list = loadCustomHymns().filter((h) => h.id !== hymn.id);
  save(CUSTOM_KEY, [...list, hymn]);
  if (cached) {
    cached = withCustom({ ...cached, hymnals: cached.hymnals.filter((h) => h.id !== 'custom'), hymns: cached.hymns.filter((h) => h.hymnalId !== 'custom') });
    listeners.forEach((l) => l(cached!));
  }
}

export function deleteCustomHymn(id: string): void {
  save(CUSTOM_KEY, loadCustomHymns().filter((h) => h.id !== id));
  if (cached) {
    cached = withCustom({ ...cached, hymnals: cached.hymnals.filter((h) => h.id !== 'custom'), hymns: cached.hymns.filter((h) => h.hymnalId !== 'custom') });
    listeners.forEach((l) => l(cached!));
  }
}

// --- Preferencias por himno (tono, cejilla, vídeo y sincronización) --------

export interface HymnPrefs {
  transpose: number;
  capo: number;
  videoId: string | null;
  syncTimes: number[] | null;
  offset: number;
}

export function loadHymnPrefs(hymn: Hymn): HymnPrefs {
  return {
    transpose: 0,
    capo: 0,
    videoId: hymn.videoId ?? null,
    syncTimes: hymn.syncTimes ?? null,
    offset: 0,
    ...load<Partial<HymnPrefs>>(`hymn:${hymn.id}`, {}),
  };
}

export function saveHymnPrefs(id: string, prefs: HymnPrefs): void {
  save(`hymn:${id}`, prefs);
}

/** El administrador puede publicar el vídeo y la sincronización para todos. */
export async function publishSync(hymnId: string, videoId: string | null, syncTimes: number[] | null): Promise<void> {
  if (!supabase) throw new Error('Sin servidor (modo demo)');
  const { error } = await supabase.from('hymns').update({ video_id: videoId, sync_times: syncTimes }).eq('id', hymnId);
  if (error) throw error;
}
