/** Himnos de ejemplo incluidos en la app (carpeta /himnarios/demo). */
import { parseChordPro } from '../music/chordpro';
import type { Hymn, Hymnal } from './types';

const files = import.meta.glob('/himnarios/demo/*.cho', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
import meta from '../../himnarios/demo/himnario.json';

export const demoHymnals: Hymnal[] = [{ id: meta.id, name: meta.name, description: meta.description }];

export const demoHymns: Hymn[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, chordpro]) => {
    const song = parseChordPro(chordpro);
    const slug = path.split('/').pop()!.replace(/\.cho$/, '');
    return {
      id: `${meta.id}-${slug}`,
      hymnalId: meta.id,
      number: song.number ?? null,
      title: song.title || slug,
      chordpro,
    };
  });
