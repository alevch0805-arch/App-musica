/**
 * Teoría musical básica: lectura de acordes (notación americana y latina),
 * transposición, formato y notas que componen cada acorde.
 */

export type Notation = 'american' | 'latin';
export type Accidentals = 'auto' | 'sharp' | 'flat';

export interface Chord {
  /** Clase de altura de la fundamental (0 = Do/C ... 11 = Si/B). */
  root: number;
  /** Todo lo que va después de la fundamental: "m", "7", "maj7", "sus4"... */
  quality: string;
  /** Bajo de un acorde con barra (G/B), o null. */
  bass: number | null;
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const AMERICAN_BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LATIN_BASE: Record<string, number> = { Do: 0, Re: 2, Mi: 4, Fa: 5, Sol: 7, La: 9, Si: 11 };
const LATIN_OF: Record<string, string> = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

const ACC = '(#|b|♯|♭)?';
const AMERICAN_RE = new RegExp(`^([A-G])${ACC}(.*?)(?:/([A-G])${ACC})?$`);
const LATIN_NOTE = '(Do|Re|Mi|Fa|Sol|La|Si)';
const LATIN_RE = new RegExp(`^${LATIN_NOTE}${ACC}(.*?)(?:/${LATIN_NOTE}${ACC})?$`);
/** Calidades válidas; sirve para distinguir "Fa" (latino) de "F" + basura. */
const QUALITY_RE = /^(?:maj|min|dim|aug|sus|add|alt|no|m|M|[0-9]|[#b+\-°ø()])*$/;

export const mod12 = (n: number) => ((n % 12) + 12) % 12;

function accidental(a: string | undefined): number {
  if (a === '#' || a === '♯') return 1;
  if (a === 'b' || a === '♭') return -1;
  return 0;
}

export function parseChord(input: string): Chord | null {
  const s = input.trim();
  if (!s) return null;
  const am = AMERICAN_RE.exec(s);
  if (am && QUALITY_RE.test(am[3])) {
    return {
      root: mod12(AMERICAN_BASE[am[1]] + accidental(am[2])),
      quality: am[3],
      bass: am[4] ? mod12(AMERICAN_BASE[am[4]] + accidental(am[5])) : null,
    };
  }
  const la = LATIN_RE.exec(s);
  if (la && QUALITY_RE.test(la[3])) {
    return {
      root: mod12(LATIN_BASE[la[1]] + accidental(la[2])),
      quality: la[3],
      bass: la[4] ? mod12(LATIN_BASE[la[4]] + accidental(la[5])) : null,
    };
  }
  return null;
}

export function transposeChord(c: Chord, semitones: number): Chord {
  return {
    root: mod12(c.root + semitones),
    quality: c.quality,
    bass: c.bass === null ? null : mod12(c.bass + semitones),
  };
}

export function noteName(pc: number, notation: Notation, flats: boolean): string {
  const name = (flats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];
  return notation === 'latin' ? LATIN_OF[name[0]] + name.slice(1) : name;
}

export function formatChord(c: Chord, notation: Notation, flats: boolean): string {
  const bass = c.bass === null ? '' : '/' + noteName(c.bass, notation, flats);
  return noteName(c.root, notation, flats) + c.quality + bass;
}

export function isMinor(quality: string): boolean {
  return /^(m(?!aj)|min|-)/.test(quality);
}

/** Tonalidades mayores que se escriben con bemoles: F, Bb, Eb, Ab, Db, Gb. */
const FLAT_MAJOR_KEYS = new Set([5, 10, 3, 8, 1, 6]);

/** Decide si conviene escribir con bemoles según la tonalidad (o la preferencia). */
export function prefersFlats(key: Chord | null, pref: Accidentals): boolean {
  if (pref === 'flat') return true;
  if (pref === 'sharp' || !key) return false;
  const majorRoot = isMinor(key.quality) ? mod12(key.root + 3) : key.root;
  return FLAT_MAJOR_KEYS.has(majorRoot);
}

/** Intervalos (en semitonos desde la fundamental) que forman el acorde. */
export function chordIntervals(quality: string): number[] {
  const q = quality.replace(/[()]/g, '');
  const set = new Set<number>([0]);
  let third: number | null = 4;
  let fifth: number | null = 7;

  if (/^(m(?!aj)|min|-)/.test(q)) third = 3;
  if (/sus2/.test(q)) third = 2;
  else if (/sus4?/.test(q)) third = 5;
  if (/dim|°/.test(q)) { third = 3; fifth = 6; }
  if (/ø|m7b5/.test(q)) { third = 3; fifth = 6; set.add(10); }
  if (/aug|\+|#5/.test(q)) fifth = 8;
  if (/b5/.test(q) && !/m7b5/.test(q)) fifth = 6;
  if (/^5$/.test(q)) third = null;
  if (/^2$/.test(q)) third = 2;

  const major7 = /maj7|M7|maj9|M9|Δ/.test(q);
  if (/(dim|°)7/.test(q)) set.add(9);
  else if (major7) set.add(11);
  else if (/(^|[^d])(7|9|11|13)/.test(q) && !/add/.test(q)) set.add(10);
  if (/6/.test(q) && !/13/.test(q)) set.add(9);
  if (/9|add9|add2/.test(q)) set.add(2);
  if (/11/.test(q)) set.add(5);
  if (/13/.test(q)) set.add(9);
  if (/b9/.test(q)) { set.delete(2); set.add(1); }

  if (third !== null) set.add(third);
  if (fifth !== null) set.add(fifth);
  return [...set].sort((a, b) => a - b);
}

/** Clases de altura (0-11) del acorde. */
export function chordTones(c: Chord): number[] {
  const tones = chordIntervals(c.quality).map((i) => mod12(c.root + i));
  if (c.bass !== null && !tones.includes(c.bass)) tones.push(c.bass);
  return tones;
}

/** Acordes "fáciles" en guitarra (posición abierta) para sugerir cejilla. */
const EASY = new Set(['C', 'D', 'E', 'G', 'A', 'Am', 'Em', 'Dm', 'C7', 'D7', 'E7', 'G7', 'A7', 'Am7', 'Em7', 'Dm7', 'Cmaj7', 'Dsus4', 'Asus4']);

function simpleName(c: Chord): string {
  return SHARP_NAMES[c.root] + c.quality;
}

/**
 * Sugiere la cejilla (capo) para que los acordes resulten más fáciles en guitarra.
 * Cada traste de cejilla resta un poco, para no proponer una cejilla alta
 * cuando sin ella los acordes ya son casi todos fáciles.
 */
export function suggestCapo(chords: Chord[], maxCapo = 7): { capo: number; easy: number; total: number } {
  const unique = new Map(chords.map((c) => [simpleName(c) + (c.bass ?? ''), c]));
  const list = [...unique.values()];
  let best = { capo: 0, easy: -1, total: list.length };
  let bestScore = -Infinity;
  for (let capo = 0; capo <= maxCapo; capo++) {
    const easy = list.filter((c) => EASY.has(simpleName(transposeChord(c, -capo)))).length;
    const score = easy - capo * 0.3;
    if (score > bestScore) { bestScore = score; best = { capo, easy, total: list.length }; }
  }
  return best;
}

export const ALL_KEYS = SHARP_NAMES;
