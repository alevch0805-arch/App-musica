import { describe, expect, it } from 'vitest';
import { chordTones, formatChord, parseChord, prefersFlats, suggestCapo, transposeChord } from './theory';
import { parseChordPro } from './chordpro';
import { frettedVoicing } from './voicings';

const p = (s: string) => parseChord(s)!;

describe('parseChord', () => {
  it('lee notación americana', () => {
    expect(p('C')).toEqual({ root: 0, quality: '', bass: null });
    expect(p('F#m7')).toEqual({ root: 6, quality: 'm7', bass: null });
    expect(p('Bb')).toEqual({ root: 10, quality: '', bass: null });
    expect(p('G/B')).toEqual({ root: 7, quality: '', bass: 11 });
    expect(p('Faug').quality).toBe('aug');
  });
  it('lee notación latina', () => {
    expect(p('Do')).toEqual({ root: 0, quality: '', bass: null });
    expect(p('Lam')).toEqual({ root: 9, quality: 'm', bass: null });
    expect(p('Fa#m')).toEqual({ root: 6, quality: 'm', bass: null });
    expect(p('Sol/Si')).toEqual({ root: 7, quality: '', bass: 11 });
    expect(p('Sib7')).toEqual({ root: 10, quality: '7', bass: null });
  });
  it('rechaza lo que no es acorde', () => {
    expect(parseChord('N.C.')).toBeNull();
    expect(parseChord('')).toBeNull();
  });
});

describe('transposición y formato', () => {
  it('sube y baja semitonos', () => {
    expect(formatChord(transposeChord(p('G/B'), 2), 'american', false)).toBe('A/C#');
    expect(formatChord(transposeChord(p('C'), -1), 'american', false)).toBe('B');
    expect(formatChord(transposeChord(p('Am'), 1), 'latin', true)).toBe('Sibm');
  });
  it('elige bemoles según la tonalidad', () => {
    expect(prefersFlats(p('F'), 'auto')).toBe(true);
    expect(prefersFlats(p('Dm'), 'auto')).toBe(true);
    expect(prefersFlats(p('G'), 'auto')).toBe(false);
    expect(prefersFlats(p('G'), 'flat')).toBe(true);
  });
  it('calcula notas del acorde', () => {
    expect(chordTones(p('C')).sort()).toEqual([0, 4, 7]);
    expect(chordTones(p('Am7')).sort((a, b) => a - b)).toEqual([0, 4, 7, 9]);
    expect(chordTones(p('G7')).sort((a, b) => a - b)).toEqual([2, 5, 7, 11]);
    expect(chordTones(p('Bdim')).sort((a, b) => a - b)).toEqual([2, 5, 11]);
  });
  it('sugiere cejilla', () => {
    // Eb Ab Bb con cejilla 3 se tocan como C F G... con cejilla 1 como D G A (todos fáciles)
    const s = suggestCapo(['Eb', 'Ab', 'Bb'].map(p));
    expect(s.easy).toBe(3);
    expect([1, 3]).toContain(s.capo);
  });
});

describe('ChordPro', () => {
  const song = parseChordPro(`{title: Prueba}
{key: G}
{number: 12}
{c: Estrofa 1}
[G]Hola [D/F#]mundo

{soc}
[C]Coro[G]
{eoc}`);
  it('lee metadatos', () => {
    expect(song.title).toBe('Prueba');
    expect(song.key).toBe('G');
    expect(song.number).toBe(12);
  });
  it('separa secciones y acordes', () => {
    expect(song.sections).toHaveLength(2);
    expect(song.sections[0].label).toBe('Estrofa 1');
    expect(song.sections[1].chorus).toBe(true);
    expect(song.chordSequence).toEqual(['G', 'D/F#', 'C', 'G']);
    const line = song.sections[0].lines[0];
    expect(line.kind === 'lyrics' && line.segments.map((s) => [s.chord, s.text, s.index])).toEqual([
      ['G', 'Hola ', 0],
      ['D/F#', 'mundo', 1],
    ]);
  });
});

describe('digitaciones', () => {
  it('usa posiciones abiertas conocidas', () => {
    expect(frettedVoicing(p('C'), 'guitar')!.frets).toEqual([-1, 3, 2, 0, 1, 0]);
    expect(frettedVoicing(p('Bb'), 'guitar')!.frets).toEqual([-1, 1, 3, 3, 3, 1]);
    expect(frettedVoicing(p('Ab'), 'guitar')!.frets).toEqual([4, 6, 6, 5, 4, 4]);
  });
  it('encuentra posiciones para cualquier acorde', () => {
    for (const name of ['F#m', 'Bb', 'C#7', 'Ebmaj7', 'G/B', 'Absus4']) {
      expect(frettedVoicing(p(name), 'guitar'), name).not.toBeNull();
      expect(frettedVoicing(p(name), 'ukulele'), name).not.toBeNull();
    }
    expect(frettedVoicing(p('C'), 'ukulele')!.frets).toEqual([0, 0, 0, 3]);
  });
});
