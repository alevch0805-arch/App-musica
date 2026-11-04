/**
 * Lector del formato ChordPro, el estándar para canciones con acordes:
 *
 *   {title: Castillo fuerte}
 *   {key: C}
 *   [C]Castillo [G]fuerte es [C]nuestro Dios
 *
 * Directivas soportadas: title/t, subtitle/st, key, number, author/artist,
 * tempo, time, comment/c, start_of_chorus/soc, end_of_chorus/eoc,
 * start_of_verse/sov, end_of_verse/eov.
 */

export interface Segment {
  chord: string | null;
  text: string;
  /** Posición del acorde dentro de toda la canción (para sincronizar con el vídeo). */
  index: number | null;
}

export type SongLine =
  | { kind: 'lyrics'; segments: Segment[] }
  | { kind: 'comment'; text: string };

export interface Section {
  label: string | null;
  chorus: boolean;
  lines: SongLine[];
}

export interface Song {
  title: string;
  subtitle?: string;
  key?: string;
  number?: number;
  author?: string;
  tempo?: number;
  time?: string;
  sections: Section[];
  /** Todos los acordes en orden de aparición. */
  chordSequence: string[];
}

const DIRECTIVE_RE = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i;
const CHORD_RE = /\[([^\]]*)\]/g;

export function parseChordPro(source: string): Song {
  const song: Song = { title: '', sections: [], chordSequence: [] };
  let current: Section | null = null;
  let inChorus = false;

  const section = (): Section => {
    if (!current) {
      current = { label: null, chorus: inChorus, lines: [] };
      song.sections.push(current);
    }
    return current;
  };
  const closeSection = () => {
    current = null;
  };

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();

    if (trimmed.startsWith('#')) continue; // comentario del archivo
    if (!trimmed) {
      closeSection();
      continue;
    }

    const d = DIRECTIVE_RE.exec(trimmed);
    if (d) {
      const name = d[1].toLowerCase();
      const value = (d[2] ?? '').trim();
      switch (name) {
        case 'title': case 't': song.title = value; break;
        case 'subtitle': case 'st': song.subtitle = value; break;
        case 'key': song.key = value; break;
        case 'number': case 'n': { const n = parseInt(value, 10); if (!Number.isNaN(n)) song.number = n; break; }
        case 'author': case 'artist': case 'composer': case 'lyricist': song.author = value; break;
        case 'tempo': { const t = parseInt(value, 10); if (!Number.isNaN(t)) song.tempo = t; break; }
        case 'time': song.time = value; break;
        case 'start_of_chorus': case 'soc':
          closeSection(); inChorus = true; section().label = value || 'Coro'; break;
        case 'end_of_chorus': case 'eoc':
          inChorus = false; closeSection(); break;
        case 'start_of_verse': case 'sov':
          closeSection(); section().label = value || null; break;
        case 'end_of_verse': case 'eov':
          closeSection(); break;
        case 'comment': case 'c': case 'ci': case 'comment_italic': {
          // Un comentario al inicio de una sección actúa como su etiqueta ("Estrofa 1").
          if (!current) section().label = value;
          else section().lines.push({ kind: 'comment', text: value });
          break;
        }
        default: break; // directiva desconocida: se ignora
      }
      continue;
    }

    section().lines.push({ kind: 'lyrics', segments: parseLyricLine(line, song.chordSequence) });
  }

  return song;
}

function parseLyricLine(line: string, sequence: string[]): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  let pendingChord: string | null = null;
  CHORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const push = (text: string) => {
    if (pendingChord === null && !text) return;
    const index = pendingChord === null ? null : sequence.push(pendingChord) - 1;
    segments.push({ chord: pendingChord, text, index });
  };
  while ((m = CHORD_RE.exec(line))) {
    push(line.slice(last, m.index));
    pendingChord = m[1].trim();
    last = m.index + m[0].length;
  }
  push(line.slice(last));
  return segments;
}
