/**
 * Metrónomo con Web Audio. Programa los golpes con antelación sobre el reloj
 * de audio (no con setInterval), así no se descompasa aunque el móvil vaya lento.
 */

export interface Meter {
  beats: number;
  /** Tiempos con acento secundario (p. ej. el 4 en un 6/8). */
  secondary: number[];
}

/** Lee el compás ("3/4", "6/8"...). Por defecto 4/4. */
export function parseMeter(time?: string | null): Meter {
  const m = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(time ?? '');
  const beats = m ? Math.min(Math.max(parseInt(m[1], 10), 1), 16) : 4;
  const denom = m ? parseInt(m[2], 10) : 4;
  const secondary: number[] = [];
  if (denom === 8 && beats > 3 && beats % 3 === 0) {
    for (let b = 3; b < beats; b += 3) secondary.push(b);
  }
  return { beats, secondary };
}

export const MIN_BPM = 30;
export const MAX_BPM = 240;
export const clampBpm = (n: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(n)));

/** Calcula el tempo a partir de los toques (en milisegundos). null si no hay suficientes. */
export function tapTempo(taps: number[]): number | null {
  const recent = taps.slice(-6);
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const g = recent[i] - recent[i - 1];
    if (g > 0 && g < 2000) gaps.push(g);
  }
  if (!gaps.length) return null;
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return clampBpm(60000 / avg);
}

type Ctx = AudioContext;

export class Metronome {
  private ctx: Ctx | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private beat = 0;
  private visualTimers: number[] = [];
  bpm = 80;
  meter: Meter = { beats: 4, secondary: [] };
  volume = 0.8;
  onBeat: (beat: number) => void = () => {};

  get running() {
    return this.timer !== null;
  }

  start() {
    if (this.running) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx ??= new AC();
    void this.ctx.resume();
    this.beat = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.visualTimers.forEach((t) => window.clearTimeout(t));
    this.visualTimers = [];
    this.onBeat(-1);
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }

  private schedule() {
    const ctx = this.ctx!;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const beat = this.beat;
      this.click(this.nextTime, beat === 0 ? 'accent' : this.meter.secondary.includes(beat) ? 'secondary' : 'normal');
      const delay = Math.max(0, (this.nextTime - ctx.currentTime) * 1000);
      const t = window.setTimeout(() => {
        this.visualTimers = this.visualTimers.filter((x) => x !== t);
        this.onBeat(beat);
      }, delay);
      this.visualTimers.push(t);
      this.nextTime += 60 / this.bpm;
      this.beat = (beat + 1) % this.meter.beats;
    }
  }

  private click(at: number, kind: 'accent' | 'secondary' | 'normal') {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = kind === 'accent' ? 1600 : kind === 'secondary' ? 1250 : 1000;
    const peak = this.volume * (kind === 'normal' ? 0.6 : 1);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.06);
  }
}
