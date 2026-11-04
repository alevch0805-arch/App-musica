/**
 * Calcula digitaciones (posiciones) para instrumentos de cuerda a partir de las
 * notas del acorde. Funciona con cualquier acorde, no sólo con una tabla fija.
 */
import { Chord, chordTones, mod12 } from './theory';

export type Instrument = 'guitar' | 'ukulele' | 'piano' | 'none';

export interface Fretted {
  /** Un valor por cuerda, de la más grave a la más aguda. -1 = no se toca. */
  frets: number[];
}

/** Afinaciones en MIDI (de grave a agudo). */
const TUNINGS: Record<'guitar' | 'ukulele', number[]> = {
  guitar: [40, 45, 50, 55, 59, 64], // Mi La Re Sol Si Mi
  ukulele: [67, 60, 64, 69], // Sol Do Mi La (afinación reentrante)
};

/** Posiciones abiertas clásicas en guitarra, para que se vean "como en el libro". */
const GUITAR_OPEN: Record<string, number[]> = {
  C: [-1, 3, 2, 0, 1, 0], C7: [-1, 3, 2, 3, 1, 0], Cmaj7: [-1, 3, 2, 0, 0, 0],
  D: [-1, -1, 0, 2, 3, 2], Dm: [-1, -1, 0, 2, 3, 1], D7: [-1, -1, 0, 2, 1, 2],
  Dm7: [-1, -1, 0, 2, 1, 1], Dmaj7: [-1, -1, 0, 2, 2, 2], Dsus4: [-1, -1, 0, 2, 3, 3], Dsus2: [-1, -1, 0, 2, 3, 0],
  E: [0, 2, 2, 1, 0, 0], Em: [0, 2, 2, 0, 0, 0], E7: [0, 2, 0, 1, 0, 0], Em7: [0, 2, 0, 0, 0, 0],
  F: [1, 3, 3, 2, 1, 1], Fmaj7: [-1, -1, 3, 2, 1, 0],
  G: [3, 2, 0, 0, 0, 3], G7: [3, 2, 0, 0, 0, 1],
  A: [-1, 0, 2, 2, 2, 0], Am: [-1, 0, 2, 2, 1, 0], A7: [-1, 0, 2, 0, 2, 0], Am7: [-1, 0, 2, 0, 1, 0],
  Amaj7: [-1, 0, 2, 1, 2, 0], Asus4: [-1, 0, 2, 2, 3, 0], Asus2: [-1, 0, 2, 2, 0, 0],
  B7: [-1, 2, 1, 2, 0, 2], Bm: [-1, 2, 4, 4, 3, 2],
};
/** Formas móviles con cejilla: raíz en la 6.ª cuerda (forma de Mi) o en la 5.ª (forma de La). */
const E_SHAPES: Record<string, number[]> = {
  '': [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], sus4: [0, 2, 2, 2, 0, 0],
};
const A_SHAPES: Record<string, number[]> = {
  '': [-1, 0, 2, 2, 2, 0], m: [-1, 0, 2, 2, 1, 0], '7': [-1, 0, 2, 0, 2, 0], m7: [-1, 0, 2, 0, 1, 0],
  maj7: [-1, 0, 2, 1, 2, 0], sus4: [-1, 0, 2, 2, 3, 0], sus2: [-1, 0, 2, 2, 0, 0],
};

function barreShape(chord: Chord): number[] | null {
  const options: number[][] = [];
  for (const [shapes, open] of [[E_SHAPES, 4], [A_SHAPES, 9]] as const) {
    const shape = shapes[chord.quality];
    const fret = mod12(chord.root - open);
    if (shape && fret >= 1) options.push(shape.map((f) => (f < 0 ? f : f + fret)));
  }
  options.sort((a, b) => Math.max(...a) - Math.max(...b));
  return options[0] ?? null;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const cache = new Map<string, Fretted | null>();

export function frettedVoicing(chord: Chord, instrument: 'guitar' | 'ukulele'): Fretted | null {
  const key = `${instrument}:${chord.root}:${chord.quality}:${chord.bass}`;
  if (cache.has(key)) return cache.get(key)!;
  let result: Fretted | null = null;
  if (instrument === 'guitar' && chord.bass === null) {
    const open = GUITAR_OPEN[NAMES[chord.root] + chord.quality];
    const shape = open ?? barreShape(chord);
    if (shape) result = { frets: shape };
  }
  if (!result) result = search(chord, TUNINGS[instrument], instrument === 'guitar');
  cache.set(key, result);
  return result;
}

function search(chord: Chord, tuning: number[], bassMatters: boolean): Fretted | null {
  const tones = chordTones(chord);
  const bass = chord.bass ?? chord.root;
  // Si hay más notas que cuerdas, se puede omitir la quinta.
  const fifth = mod12(chord.root + 7);
  const required = tones.length > tuning.length - 1 && tones.includes(fifth) && tones.length > 3
    ? tones.filter((t) => t !== fifth)
    : tones;

  let best: { frets: number[]; score: number } | null = null;

  for (let start = 0; start <= 9; start++) {
    const window = start === 0 ? [0, 1, 2, 3] : [0, start, start + 1, start + 2, start + 3];
    const options = tuning.map((open, s) => {
      const opts = window.filter((f) => tones.includes(mod12(open + f)));
      // En guitarra sólo se apagan las dos cuerdas más graves.
      if (bassMatters && s < 2) opts.push(-1);
      return opts;
    });

    const frets: number[] = new Array(tuning.length).fill(-1);
    const walk = (s: number) => {
      if (s === tuning.length) {
        const score = evaluate(frets, tuning, required, bass, bassMatters);
        if (score !== null && (!best || score < best.score)) best = { frets: [...frets], score };
        return;
      }
      for (const f of options[s]) {
        // Una cuerda apagada sólo puede ir antes de las tocadas (no en medio).
        if (f === -1 && s > 0 && frets[s - 1] !== -1) continue;
        frets[s] = f;
        walk(s + 1);
      }
    };
    walk(0);
  }
  return best ? { frets: (best as { frets: number[] }).frets } : null;
}

function evaluate(frets: number[], tuning: number[], required: number[], bass: number, bassMatters: boolean): number | null {
  const played = frets.map((f, s) => (f < 0 ? null : tuning[s] + f)).filter((n): n is number => n !== null);
  if (played.length < Math.min(3, tuning.length)) return null;
  const pcs = new Set(played.map(mod12));
  if (!required.every((t) => pcs.has(t))) return null;
  if (bassMatters && mod12(Math.min(...played)) !== bass) return null;

  const fretted = frets.filter((f) => f > 0);
  const min = fretted.length ? Math.min(...fretted) : 0;
  const max = fretted.length ? Math.max(...fretted) : 0;
  if (max - min > 3) return null;

  // Dedos necesarios: si hay más de 4 notas pisadas, hace falta cejilla en el traste mínimo.
  let fingers = fretted.length;
  let barre = false;
  if (fingers > 4) {
    const firstAtMin = frets.findIndex((f) => f === min);
    const barreOk = frets.every((f, s) => s < firstAtMin || f === -1 ? true : f >= min && f !== 0);
    if (!barreOk) return null;
    fingers = fretted.filter((f) => f > min).length + 1;
    barre = true;
    if (fingers > 4) return null;
  }

  const muted = frets.filter((f) => f < 0).length;
  const open = frets.filter((f) => f === 0).length;
  // Cuerdas al aire combinadas con posiciones altas resultan incómodas.
  const awkward = open > 0 && min >= 4 ? 3 : 0;
  return awkward + (max - min) * 2 + min * 1.2 + muted * 1.5 + fingers * 0.6 + (barre ? 1.5 : 0) - open * 0.3;
}

/** Teclas (0 = Do central del dibujo) que se pintan en el piano. */
export function pianoKeys(chord: Chord): { keys: number[]; bass: number } {
  const tones = chordTones(chord).filter((t) => t !== chord.bass || chord.bass === chord.root);
  const intervals = tones.map((t) => mod12(t - chord.root)).sort((a, b) => a - b);
  const keys = intervals.map((i) => {
    const k = chord.root + i;
    return k >= 24 ? k - 12 : k;
  });
  return { keys, bass: chord.bass ?? chord.root };
}
