/**
 * Importación de himnarios en formato ChordPro: uno o varios archivos, y cada
 * archivo puede traer varios himnos separados por {new_song} (o {ns}).
 */
import { parseChordPro } from '../music/chordpro';
import type { Hymn } from './types';

export interface ImportedHymn {
  hymn: Hymn;
  chords: number;
  warnings: string[];
}

const NEW_SONG = /^\s*\{\s*(?:new_song|ns)\s*\}\s*$/im;

export function splitSongs(source: string): string[] {
  return source
    .replace(/\r\n?/g, '\n')
    .split(NEW_SONG)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/** Nombre del himnario guardado en el archivo ({x_himnario: …}), si lo trae. */
export function hymnalNameIn(text: string): string | null {
  const m = /^\s*\{\s*x_himnario\s*:\s*(.+?)\s*\}\s*$/im.exec(text);
  return m ? m[1] : null;
}

/** «Himnario_Regional_Juvenil.chopro» → «Himnario Regional Juvenil» */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildImport(files: { name: string; text: string }[], hymnalId: string): ImportedHymn[] {
  const out: ImportedHymn[] = [];
  const used = new Set<string>();
  for (const file of files) {
    for (const chordpro of splitSongs(file.text)) {
      const song = parseChordPro(chordpro);
      const title = song.title || nameFromFile(file.name);
      const number = song.number ?? null;
      let id = `${hymnalId}-${number !== null ? String(number).padStart(3, '0') : slugify(title) || 'himno'}`;
      for (let n = 2; used.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
      used.add(id);
      const warnings: string[] = [];
      if (!song.title) warnings.push('sin título');
      if (!song.chordSequence.length) warnings.push('sin acordes');
      out.push({ hymn: { id, hymnalId, number, title, chordpro }, chords: song.chordSequence.length, warnings });
    }
  }
  return out.sort((a, b) => (a.hymn.number ?? 1e9) - (b.hymn.number ?? 1e9) || a.hymn.title.localeCompare(b.hymn.title));
}
