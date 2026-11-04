import { describe, expect, it } from 'vitest';
import { chordsOverLyricsToChordPro } from './Editor';
import { parseYouTubeId } from '../components/VideoSync';

describe('convertir acordes encima de la letra', () => {
  it('inserta los acordes en su posición', () => {
    const src = 'G       D\nSanto, santo\nLam  Re7';
    expect(chordsOverLyricsToChordPro(src)).toBe('[G]Santo, s[D]anto\n[Lam] [Re7]');
  });
  it('deja intactas las líneas de letra', () => {
    expect(chordsOverLyricsToChordPro('Dios es amor')).toBe('Dios es amor');
  });
});

describe('enlaces de YouTube', () => {
  it('reconoce los formatos habituales', () => {
    for (const u of ['https://www.youtube.com/watch?v=abcdefghijk', 'https://youtu.be/abcdefghijk?t=3', 'https://youtube.com/shorts/abcdefghijk', 'abcdefghijk']) {
      expect(parseYouTubeId(u)).toBe('abcdefghijk');
    }
    expect(parseYouTubeId('https://example.com')).toBeNull();
  });
});
