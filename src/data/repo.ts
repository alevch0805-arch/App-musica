/**
 * Fuente de datos: himnarios del servidor (Supabase) o, en modo demo, los
 * incluidos en la app. Siempre se añaden los guardados en el dispositivo:
 * himnarios importados en este equipo y los cantos propios («Mis cantos»).
 */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { load, save } from '../lib/storage';
import { demoHymnals, demoHymns } from './demo';
import type { Hymn, Hymnal, Library } from './types';

export const CUSTOM_HYMNAL: Hymnal = { id: 'custom', name: 'Mis cantos', description: 'Cantos que has añadido tú (sólo en este dispositivo).' };
const CACHE_KEY = 'library-cache';
const CUSTOM_KEY = 'custom-hymns';
const LOCAL_KEY = 'local-hymnals';
const PAGE = 1000; // Supabase devuelve como mucho 1000 filas por consulta

let base: Library | null = null; // servidor / caché / demo
let cached: Library | null = null; // base + lo guardado en el dispositivo
const listeners = new Set<(l: Library) => void>();

async function fetchServer(): Promise<Library> {
  if (!supabase) return { hymnals: demoHymnals, hymns: demoHymns, source: 'demo' };
  try {
    const hymnals = await supabase.from('hymnals').select('id, name, description').order('sort').order('name');
    if (hymnals.error) throw hymnals.error;
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const page = await supabase
        .from('hymns')
        .select('id, hymnal_id, number, title, chordpro, video_id, sync_times')
        .order('hymnal_id')
        .order('number')
        .order('id')
        .range(from, from + PAGE - 1);
      if (page.error) throw page.error;
      rows.push(...page.data);
      if (page.data.length < PAGE) break;
    }
    const lib: Library = {
      hymnals: hymnals.data as Hymnal[],
      hymns: rows.map((h) => ({
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

interface LocalLibrary {
  hymnals: Hymnal[];
  hymns: Hymn[];
}

function loadLocal(): LocalLibrary {
  return load<LocalLibrary>(LOCAL_KEY, { hymnals: [], hymns: [] });
}

function withLocal(lib: Library): Library {
  const local = loadLocal();
  const custom = loadCustomHymns();
  const serverIds = new Set(lib.hymnals.map((h) => h.id));
  const localHymnals = local.hymnals.filter((h) => !serverIds.has(h.id));
  const localIds = new Set(localHymnals.map((h) => h.id));
  return {
    ...lib,
    hymnals: [...lib.hymnals, ...localHymnals, ...(custom.length ? [CUSTOM_HYMNAL] : [])],
    hymns: [...lib.hymns, ...local.hymns.filter((h) => localIds.has(h.hymnalId)), ...custom],
  };
}

function rebuild() {
  if (!base) return;
  cached = withLocal(base);
  listeners.forEach((l) => l(cached!));
}

export function refreshLibrary(): Promise<Library> {
  return fetchServer().then((lib) => {
    base = lib;
    rebuild();
    return cached!;
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
  rebuild();
}

export function deleteCustomHymn(id: string): void {
  save(CUSTOM_KEY, loadCustomHymns().filter((h) => h.id !== id));
  rebuild();
}

// --- Himnarios importados -------------------------------------------------

/** Himnarios guardados sólo en este dispositivo. */
export function localHymnals(): (Hymnal & { count: number })[] {
  const local = loadLocal();
  return local.hymnals.map((h) => ({ ...h, count: local.hymns.filter((x) => x.hymnalId === h.id).length }));
}

/** Guarda (o reemplaza) un himnario en este dispositivo. */
export function saveLocalHymnal(hymnal: Hymnal, hymns: Hymn[]): void {
  const local = loadLocal();
  save(LOCAL_KEY, {
    hymnals: [...local.hymnals.filter((h) => h.id !== hymnal.id), hymnal],
    hymns: [...local.hymns.filter((h) => h.hymnalId !== hymnal.id), ...hymns],
  });
  rebuild();
}

export function deleteLocalHymnal(id: string): void {
  const local = loadLocal();
  save(LOCAL_KEY, { hymnals: local.hymnals.filter((h) => h.id !== id), hymns: local.hymns.filter((h) => h.hymnalId !== id) });
  rebuild();
}

/** Sube (o actualiza) un himnario al servidor para todos los usuarios. Sólo administradores. */
export async function uploadHymnal(hymnal: Hymnal, hymns: Hymn[], onProgress?: (done: number) => void): Promise<void> {
  if (!supabase) throw new Error('Sin servidor (modo demo)');
  const { error } = await supabase.from('hymnals').upsert({ id: hymnal.id, name: hymnal.name, description: hymnal.description ?? null });
  if (error) throw error;
  for (let i = 0; i < hymns.length; i += 100) {
    const chunk = hymns.slice(i, i + 100).map((h) => ({
      id: h.id,
      hymnal_id: hymnal.id,
      number: h.number,
      title: h.title,
      chordpro: h.chordpro,
      updated_at: new Date().toISOString(),
    }));
    const res = await supabase.from('hymns').upsert(chunk);
    if (res.error) throw res.error;
    onProgress?.(Math.min(i + 100, hymns.length));
  }
  await refreshLibrary();
}

// --- Preferencias por himno (tono, cejilla, vídeo y sincronización) --------

export interface HymnPrefs {
  transpose: number;
  capo: number;
  videoId: string | null;
  syncTimes: number[] | null;
  offset: number;
  /** Tempo elegido por el usuario para el metrónomo (null = el del himno). */
  bpm: number | null;
}

export function loadHymnPrefs(hymn: Hymn): HymnPrefs {
  return {
    transpose: 0,
    capo: 0,
    videoId: hymn.videoId ?? null,
    syncTimes: hymn.syncTimes ?? null,
    offset: 0,
    bpm: null,
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
