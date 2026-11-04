import { memo, useEffect, useRef } from 'react';
import type { Song } from '../music/chordpro';
import { formatChord, parseChord, transposeChord, type Notation } from '../music/theory';

interface Props {
  song: Song;
  /** Semitonos a sumar a cada acorde (ya descontada la cejilla). */
  shift: number;
  notation: Notation;
  flats: boolean;
  fontSize: number;
  activeIndex: number | null;
  follow: boolean;
  onChordClick?: (index: number) => void;
}

export function displayChord(raw: string, shift: number, notation: Notation, flats: boolean): string {
  const c = parseChord(raw);
  return c ? formatChord(transposeChord(c, shift), notation, flats) : raw;
}

/** ¿El acorde siguiente cae a mitad de palabra? (se dibuja un guion para unir las sílabas) */
function isMidWord(text: string, next: { chord: string | null; text: string } | undefined): boolean {
  return !!next && next.chord !== null && /[\p{L}\p{N}]$/u.test(text) && /^[\p{L}\p{N}]/u.test(next.text);
}

export const SongView = memo(function SongView({ song, shift, notation, flats, fontSize, activeIndex, follow, onChordClick }: Props) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!follow || activeIndex === null || !root.current) return;
    const el = root.current.querySelector(`[data-i="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex, follow]);

  return (
    <div className="song" ref={root} style={{ fontSize }}>
      {song.sections.map((sec, si) => (
        <section key={si} className={sec.chorus ? 'sec chorus' : 'sec'}>
          {sec.label && <h3 className="sec-label">{sec.label}</h3>}
          {sec.lines.map((line, li) =>
            line.kind === 'comment' ? (
              <p key={li} className="comment">{line.text}</p>
            ) : (
              <div key={li} className="line">
                {line.segments.map((seg, gi, all) => (
                  <span key={gi} className={isMidWord(seg.text, all[gi + 1]) ? 'seg mid' : 'seg'}>
                    <span
                      className={
                        'chord' +
                        (seg.chord === null ? ' empty' : '') +
                        (seg.index !== null && seg.index === activeIndex ? ' active' : '') +
                        (seg.index !== null && activeIndex !== null && seg.index < activeIndex ? ' past' : '')
                      }
                      data-i={seg.index ?? undefined}
                      onClick={seg.index !== null && onChordClick ? () => onChordClick(seg.index!) : undefined}
                    >
                      {seg.chord !== null ? displayChord(seg.chord, shift, notation, flats) : ' '}
                    </span>
                    <span className="lyric">{seg.text || ' '}</span>
                  </span>
                ))}
              </div>
            ),
          )}
        </section>
      ))}
    </div>
  );
});
