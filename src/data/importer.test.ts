import { describe, expect, it } from 'vitest';
import { buildImport, hymnalNameIn, nameFromFile, slugify, splitSongs } from './importer';

const book = `{title: Primero}
{number: 2}
[G]Hola

{new_song}
{title: Segundo}
{number: 1}
[C]Adiós
{ns}
{title: Sin acordes}
Sólo letra`;

describe('importar himnarios', () => {
  it('separa los himnos de un archivo', () => {
    expect(splitSongs(book)).toHaveLength(3);
    expect(splitSongs('{title: Uno}\n[C]x')).toHaveLength(1);
  });
  it('arma los himnos ordenados por número, con avisos', () => {
    const r = buildImport([{ name: 'libro.chopro', text: book }], 'juvenil');
    expect(r.map((x) => [x.hymn.id, x.hymn.number, x.hymn.title])).toEqual([
      ['juvenil-001', 1, 'Segundo'],
      ['juvenil-002', 2, 'Primero'],
      ['juvenil-sin-acordes', null, 'Sin acordes'],
    ]);
    expect(r[2].warnings).toContain('sin acordes');
  });
  it('no repite identificadores', () => {
    const r = buildImport([{ name: 'a.cho', text: '{title: X}\n{number: 1}\n[C]a' }, { name: 'b.cho', text: '{title: Y}\n{number: 1}\n[C]b' }], 'h');
    expect(new Set(r.map((x) => x.hymn.id)).size).toBe(2);
  });
  it('lee el nombre del himnario guardado en el archivo', () => {
    expect(hymnalNameIn('{x_himnario: Himnario Juvenil}\n{title: A}')).toBe('Himnario Juvenil');
    expect(hymnalNameIn('{title: A}')).toBeNull();
  });
  it('nombres y slugs', () => {
    expect(nameFromFile('Himnario_Regional_Juvenil.chopro')).toBe('Himnario Regional Juvenil');
    expect(slugify('¡Santo, Santo! Señor')).toBe('santo-santo-senor');
  });
});
