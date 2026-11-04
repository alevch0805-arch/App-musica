import { describe, expect, it } from 'vitest';
import { parseMeter, tapTempo } from './metronome';

describe('metrónomo', () => {
  it('lee el compás', () => {
    expect(parseMeter('3/4')).toEqual({ beats: 3, secondary: [] });
    expect(parseMeter('6/8')).toEqual({ beats: 6, secondary: [3] });
    expect(parseMeter(undefined)).toEqual({ beats: 4, secondary: [] });
    expect(parseMeter('raro')).toEqual({ beats: 4, secondary: [] });
  });
  it('calcula el tempo por toques', () => {
    expect(tapTempo([0])).toBeNull();
    expect(tapTempo([0, 500, 1000, 1500])).toBe(120);
    // una pausa larga no cuenta
    expect(tapTempo([0, 5000, 5750, 6500])).toBe(80);
  });
});
