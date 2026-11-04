import { useEffect, useRef, useState } from 'react';
import { clampBpm, Metronome, parseMeter, tapTempo } from '../music/metronome';

interface Props {
  /** Tempo del himno ({tempo} en ChordPro), si lo tiene. */
  tempo?: number;
  time?: string;
  /** Tempo guardado por el usuario para este himno. */
  bpm: number | null;
  onBpm: (bpm: number) => void;
}

export function MetronomePanel({ tempo, time, bpm: savedBpm, onBpm }: Props) {
  const bpm = savedBpm ?? tempo ?? 80;
  const meter = parseMeter(time);
  const metro = useRef<Metronome | null>(null);
  const taps = useRef<number[]>([]);
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(-1);

  useEffect(() => {
    const m = new Metronome();
    m.onBeat = setBeat;
    metro.current = m;
    return () => m.dispose();
  }, []);

  useEffect(() => {
    if (!metro.current) return;
    metro.current.bpm = bpm;
    metro.current.meter = meter;
  }, [bpm, meter.beats, meter.secondary.join()]);

  const toggle = () => {
    const m = metro.current!;
    if (m.running) { m.stop(); setRunning(false); }
    else { m.bpm = bpm; m.meter = meter; m.start(); setRunning(true); }
  };

  const tap = () => {
    const now = performance.now();
    if (taps.current.length && now - taps.current[taps.current.length - 1] > 2000) taps.current = [];
    taps.current.push(now);
    const t = tapTempo(taps.current);
    if (t) onBpm(t);
  };

  return (
    <div className="metronome">
      <button className={running ? 'primary' : ''} onClick={toggle} aria-label={running ? 'Parar metrónomo' : 'Iniciar metrónomo'}>
        {running ? '■' : '▶'} Metrónomo
      </button>
      <div className="tool">
        <button onClick={() => onBpm(clampBpm(bpm - 1))} aria-label="Más lento">−</button>
        <span className="mono val bpm">♩ {bpm}</span>
        <button onClick={() => onBpm(clampBpm(bpm + 1))} aria-label="Más rápido">+</button>
      </div>
      <button onClick={tap} title="Toca al ritmo para fijar el tempo">Tap</button>
      {savedBpm !== null && tempo && savedBpm !== tempo && (
        <button className="ghost" onClick={() => onBpm(tempo)}>Original ({tempo})</button>
      )}
      <div className="beats" aria-hidden>
        {Array.from({ length: meter.beats }, (_, i) => (
          <span key={i} className={'beat' + (i === 0 ? ' first' : '') + (meter.secondary.includes(i) ? ' second' : '') + (i === beat ? ' on' : '')} />
        ))}
      </div>
    </div>
  );
}
