import { describe, expect, it } from 'vitest';
import { moveItem, sortSetlists, type Setlist } from './setlists';

const s = (id: string, date: string | null, updatedAt = 0): Setlist => ({ id, name: id, date, items: [], updatedAt });

describe('listas', () => {
  it('mueve elementos', () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });
  it('ordena próximas, pasadas y sin fecha', () => {
    const r = sortSetlists([s('sin', null), s('pasada', '2026-01-01'), s('lejos', '2026-12-20'), s('pronto', '2026-11-08'), s('reciente', '2026-11-01')], '2026-11-04');
    expect(r.map((x) => x.id)).toEqual(['pronto', 'lejos', 'reciente', 'pasada', 'sin']);
  });
});
