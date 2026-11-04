import { describe, expect, it } from 'vitest';
import { parseChordPro } from '../music/chordpro';
import { buildSlides } from './Projector';

describe('diapositivas del proyector', () => {
  it('quita los acordes y separa por estrofas', () => {
    const song = parseChordPro(`{title: Prueba}
[G] [D] [C]

{c: Estrofa 1}
[G]Santo, [D]santo
es el [C]Señor

{soc}
[C]Gloria a [G]Dios
{eoc}`);
    const slides = buildSlides(song, 5);
    expect(slides[0]).toEqual({ kind: 'title', lines: ['Prueba'], label: '5' });
    expect(slides.slice(1).map((s) => s.lines)).toEqual([['Santo, santo', 'es el Señor'], ['Gloria a Dios']]);
    expect(slides[2].chorus).toBe(true);
  });
  it('parte estrofas largas', () => {
    const song = parseChordPro(Array.from({ length: 8 }, (_, i) => `línea ${i}`).join('\n'));
    const slides = buildSlides(song, null);
    expect(slides.slice(1).map((s) => s.lines.length)).toEqual([4, 4]);
  });
});
