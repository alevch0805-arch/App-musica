/**
 * Listas para el culto: himnos en orden, cada uno con su propio tono.
 * Se guardan en el dispositivo.
 */
import { useEffect, useState } from 'react';
import { load, save } from '../lib/storage';

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
}

const KEY = 'setlists';
const listeners = new Set<(s: Setlist[]) => void>();

export function loadSetlists(): Setlist[] {
  return load<Setlist[]>(KEY, []);
}

function persist(list: Setlist[]) {
  save(KEY, list);
  listeners.forEach((l) => l(list));
}

export function useSetlists(): Setlist[] {
  const [list, setList] = useState(loadSetlists);
  useEffect(() => {
    listeners.add(setList);
    return () => { listeners.delete(setList); };
  }, []);
  return list;
}

export function createSetlist(name: string, date: string | null = null): Setlist {
  const s: Setlist = { id: `l-${Date.now().toString(36)}`, name, date, items: [], updatedAt: Date.now() };
  persist([...loadSetlists(), s]);
  return s;
}

export function updateSetlist(id: string, change: (s: Setlist) => Setlist): void {
  persist(loadSetlists().map((s) => (s.id === id ? { ...change(s), updatedAt: Date.now() } : s)));
}

export function deleteSetlist(id: string): void {
  persist(loadSetlists().filter((s) => s.id !== id));
}

export function addToSetlist(id: string, hymnId: string, transpose = 0): void {
  updateSetlist(id, (s) => ({ ...s, items: [...s.items, { hymnId, transpose }] }));
}

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
