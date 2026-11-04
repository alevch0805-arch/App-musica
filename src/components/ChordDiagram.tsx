import { memo } from 'react';
import { formatChord, mod12, noteName, type Chord, type Notation } from '../music/theory';
import { frettedVoicing, pianoKeys, type Instrument } from '../music/voicings';

interface Props {
  chord: Chord;
  instrument: Instrument;
  notation: Notation;
  flats: boolean;
  size?: number;
}

export const ChordDiagram = memo(function ChordDiagram({ chord, instrument, notation, flats, size = 1 }: Props) {
  const name = formatChord(chord, notation, flats);
  if (instrument === 'none') return null;
  return (
    <figure className="diagram" style={{ width: (instrument === 'piano' ? 132 : 84) * size }}>
      <figcaption>{name}</figcaption>
      {instrument === 'piano' ? <Piano chord={chord} bassName={noteName(chord.bass ?? chord.root, notation, flats)} /> : <Fretboard chord={chord} instrument={instrument} />}
    </figure>
  );
});

function Fretboard({ chord, instrument }: { chord: Chord; instrument: 'guitar' | 'ukulele' }) {
  const v = frettedVoicing(chord, instrument);
  if (!v) return <div className="diagram-missing">sin posición</div>;
  const strings = v.frets.length;
  const fretted = v.frets.filter((f) => f > 0);
  const maxFret = fretted.length ? Math.max(...fretted) : 0;
  const base = maxFret > 4 ? Math.min(...fretted) : 1;
  const rows = 4;
  const w = 70, h = 78, left = 10, top = 14;
  const sx = (w - left * 2) / (strings - 1);
  const fy = (h - top - 6) / rows;

  // Cejilla: el traste mínimo pisado en varias cuerdas consecutivas hasta la última.
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const atMin = v.frets.map((f, i) => (f === minF ? i : -1)).filter((i) => i >= 0);
  const barre = fretted.length > 4 && atMin.length >= 2 ? { from: atMin[0], to: strings - 1 } : null;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="diagrama de acorde">
      {base === 1 ? (
        <rect x={left} y={top - 3} width={w - left * 2} height={3} className="nut" />
      ) : (
        <text x={1} y={top + fy * 0.7} className="fret-label">{base}</text>
      )}
      {Array.from({ length: rows + 1 }, (_, r) => (
        <line key={r} x1={left} x2={w - left} y1={top + r * fy} y2={top + r * fy} className="fret" />
      ))}
      {Array.from({ length: strings }, (_, s) => (
        <line key={s} x1={left + s * sx} x2={left + s * sx} y1={top} y2={top + rows * fy} className="string" />
      ))}
      {barre && (
        <rect
          x={left + barre.from * sx - 4}
          y={top + (minF - base + 0.5) * fy - 4}
          width={(barre.to - barre.from) * sx + 8}
          height={8}
          rx={4}
          className="dot"
        />
      )}
      {v.frets.map((f, s) => {
        const x = left + s * sx;
        if (f < 0) return <text key={s} x={x} y={top - 5} className="mark">×</text>;
        if (f === 0) return <circle key={s} cx={x} cy={top - 7} r={2.6} className="open" />;
        return <circle key={s} cx={x} cy={top + (f - base + 0.5) * fy} r={4} className="dot" />;
      })}
    </svg>
  );
}

const WHITE = [0, 2, 4, 5, 7, 9, 11];

function Piano({ chord, bassName }: { chord: Chord; bassName: string }) {
  const { keys } = pianoKeys(chord);
  const active = new Set(keys);
  const octaves = 2;
  const ww = 9, wh = 40, bw = 6, bh = 25;
  const whites: number[] = [];
  const blacks: { k: number; x: number }[] = [];
  for (let o = 0; o < octaves; o++) {
    WHITE.forEach((pc) => whites.push(o * 12 + pc));
  }
  whites.forEach((k, i) => {
    if ([0, 2, 5, 7, 9].includes(mod12(k))) blacks.push({ k: k + 1, x: (i + 1) * ww - bw / 2 });
  });
  const width = whites.length * ww;
  return (
    <svg viewBox={`0 0 ${width} ${wh + 12}`} role="img" aria-label="teclado de piano">
      {whites.map((k, i) => (
        <rect key={k} x={i * ww} y={0} width={ww} height={wh} className={active.has(k) ? 'key white on' : 'key white'} />
      ))}
      {blacks.map(({ k, x }) => (
        <rect key={k} x={x} y={0} width={bw} height={bh} className={active.has(k) ? 'key black on' : 'key black'} />
      ))}
      <text x={width / 2} y={wh + 10} className="bass-label">bajo: {bassName}</text>
    </svg>
  );
}
