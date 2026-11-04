/**
 * Listas para el culto: himnos en orden, cada uno con su propio tono.
 *
 * Siempre se guardan en el dispositivo (funcionan sin conexión). Si hay
 * servidor (Supabase), además se sincronizan: cada usuario tiene las suyas
 * y las marcadas como «compartidas» las ven todos (sólo lectura).
 */
import { useEffect, useState } from 'react';
import { load, save } from '../lib/storage';
import { supabase } from '../lib/supabase';

export interface SetlistItem {
  hymnId: string;
  /** Semitonos respecto al tono original para esta lista. */
  transpose: number;
  note?: string;
}

export interface Setlist {
  id: string;
  name: string;
  date: string | null; // AAAA-MM-DD
  items: SetlistItem[];
  updatedAt: number;
  /** Dueño en el servidor (null/undefined = sólo local, todavía sin subir). */
  ownerId?: string | null;
  ownerName?: string | null;
  shared?: boolean;
}

export type SyncStatus = 'local' | 'synced' | 'pending' | 'syncing' | 'error';

const KEY = 'setlists';
const DIRTY_KEY = 'setlists-dirty';
const DELETED_KEY = 'setlists-deleted';

interface SyncUser { id: string; name: string; isAdmin: boolean }

let user: SyncUser | null = null;
let lists: Setlist[] = load<Setlist[]>(KEY, []);
let dirty = new Set(load<string[]>(DIRTY_KEY, []));
let deleted = new Set(load<string[]>(DELETED_KEY, []));
let status: SyncStatus = supabase ? 'pending' : 'local';
let pushTimer: number | null = null;
let lastRefresh = 0;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function persist() {
  save(KEY, lists);
  save(DIRTY_KEY, [...dirty]);
  save(DELETED_KEY, [...deleted]);
  notify();
}

function setStatus(s: SyncStatus) {
  status = s;
  notify();
}

export function loadSetlists(): Setlist[] {
  return lists;
}

export function useSetlists(): Setlist[] {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    if (Date.now() - lastRefresh > 30_000) void refreshSetlists();
    return () => { listeners.delete(l); };
  }, []);
  return lists;
}

export function useSyncStatus(): SyncStatus {
  useSetlists();
  return status;
}

// --- Permisos ----------------------------------------------------------------

export function canEdit(s: Setlist): boolean {
  if (!supabase || !s.ownerId || !user) return true;
  return s.ownerId === user.id || (!!s.shared && user.isAdmin);
}

export function isMine(s: Setlist): boolean {
  return !s.ownerId || !user || s.ownerId === user.id;
}

// --- Cambios -----------------------------------------------------------------

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `l-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function touch(id: string) {
  dirty.add(id);
  persist();
  schedulePush();
}

export function createSetlist(name: string, date: string | null = null, items: SetlistItem[] = []): Setlist {
  const s: Setlist = { id: newId(), name, date, items, updatedAt: Date.now(), ownerId: user?.id ?? null, ownerName: user?.name ?? null, shared: false };
  lists = [...lists, s];
  touch(s.id);
  return s;
}

export function updateSetlist(id: string, change: (s: Setlist) => Setlist): void {
  const current = lists.find((s) => s.id === id);
  if (!current || !canEdit(current)) return;
  lists = lists.map((s) => (s.id === id ? { ...change(s), updatedAt: Date.now() } : s));
  touch(id);
}

export function deleteSetlist(id: string): void {
  const s = lists.find((x) => x.id === id);
  lists = lists.filter((x) => x.id !== id);
  dirty.delete(id);
  if (s?.ownerId) deleted.add(id);
  persist();
  schedulePush();
}

export function addToSetlist(id: string, hymnId: string, transpose = 0): void {
  updateSetlist(id, (s) => ({ ...s, items: [...s.items, { hymnId, transpose }] }));
}

/** Copia una lista (p. ej. una compartida de otra persona) a las mías. */
export function duplicateSetlist(s: Setlist): Setlist {
  return createSetlist(`${s.name} (copia)`, s.date, s.items.map((i) => ({ ...i })));
}

// --- Sincronización ------------------------------------------------------------

/** Lo llama la autenticación al entrar / salir. */
export function setSyncUser(u: SyncUser | null): void {
  const changed = user?.id !== u?.id;
  user = u;
  if (!u) return;
  // Cambios pendientes de otra cuenta que usó este dispositivo: se descartan.
  for (const s of lists) {
    if (s.ownerId && s.ownerId !== u.id && !(s.shared && u.isAdmin)) dirty.delete(s.id);
  }
  // Listas creadas antes de entrar: pasan a ser del usuario y se suben.
  lists = lists.map((s) => {
    if (s.ownerId) return s;
    dirty.add(s.id);
    return { ...s, ownerId: u.id, ownerName: u.name };
  });
  persist();
  if (changed) void refreshSetlists(true);
}

interface Row {
  id: string;
  owner_id: string;
  owner_name: string | null;
  name: string;
  date: string | null;
  items: SetlistItem[];
  shared: boolean;
  updated_at: string;
}

export function fromRow(r: Row): Setlist {
  return {
    id: r.id,
    name: r.name,
    date: r.date,
    items: Array.isArray(r.items) ? r.items : [],
    updatedAt: Date.parse(r.updated_at),
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    shared: r.shared,
  };
}

/**
 * Une lo que hay en el servidor con lo local: manda el servidor, salvo las
 * listas con cambios locales todavía sin subir y las borradas pendientes.
 */
export function mergeSetlists(server: Setlist[], local: Setlist[], dirtyIds: Set<string>, deletedIds: Set<string>): Setlist[] {
  const result = server.filter((s) => !deletedIds.has(s.id) && !dirtyIds.has(s.id));
  for (const s of local) if (dirtyIds.has(s.id)) result.push(s);
  return result;
}

function schedulePush() {
  if (!supabase || !user) return;
  setStatus('pending');
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => { pushTimer = null; void push(); }, 800);
}

async function push(): Promise<boolean> {
  if (!supabase || !user) return false;
  setStatus('syncing');
  let ok = true;
  for (const id of [...deleted]) {
    const { error } = await supabase.from('setlists').delete().eq('id', id);
    if (error) ok = false;
    else deleted.delete(id);
  }
  for (const id of [...dirty]) {
    const s = lists.find((x) => x.id === id);
    if (!s) { dirty.delete(id); continue; }
    const row = { id: s.id, name: s.name, date: s.date, items: s.items, shared: !!s.shared };
    const { error } = s.ownerId === user.id
      ? await supabase.from('setlists').upsert({ ...row, owner_name: s.ownerName ?? user.name })
      : await supabase.from('setlists').update(row).eq('id', s.id);
    if (error) ok = false;
    else dirty.delete(id);
  }
  persist();
  setStatus(ok ? 'synced' : 'error');
  return ok;
}

export async function refreshSetlists(force = false): Promise<void> {
  if (!supabase || !user) return;
  if (!force && status === 'syncing') return;
  lastRefresh = Date.now();
  await push();
  const { data, error } = await supabase.from('setlists').select('*');
  if (error) { setStatus('error'); return; }
  lists = mergeSetlists(((data ?? []) as Row[]).map(fromRow), lists, dirty, deleted);
  persist();
  setStatus(dirty.size || deleted.size ? 'error' : 'synced');
}

if (typeof window !== 'undefined') {
  // Al volver a la app (o recuperar la conexión) se traen los cambios de los demás.
  window.addEventListener('focus', () => { if (Date.now() - lastRefresh > 10_000) void refreshSetlists(); });
  window.addEventListener('online', () => void refreshSetlists(true));
}

// --- Utilidades ------------------------------------------------------------------

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const copy = [...items];
  const [it] = copy.splice(from, 1);
  copy.splice(to, 0, it);
  return copy;
}

/** Ordena: primero las próximas fechas, luego las pasadas (más recientes primero), luego sin fecha. */
export function sortSetlists(list: Setlist[], today = new Date().toISOString().slice(0, 10)): Setlist[] {
  const rank = (s: Setlist) => (!s.date ? 2 : s.date >= today ? 0 : 1);
  return [...list].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    if (rank(a) === 0) return a.date!.localeCompare(b.date!);
    if (rank(a) === 1) return b.date!.localeCompare(a.date!);
    return b.updatedAt - a.updatedAt;
  });
}

/** Texto para compartir la lista por WhatsApp o correo. */
export function setlistAsText(s: Setlist, lines: string[]): string {
  const header = s.date ? `${s.name} — ${new Date(s.date + 'T12:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}` : s.name;
  return [header, '', ...lines.map((l, i) => `${i + 1}. ${l}`)].join('\n');
}
