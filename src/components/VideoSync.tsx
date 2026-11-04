/**
 * Reproductor de YouTube (reproductor oficial incrustado) con sincronización
 * de acordes "a golpe de toque": mientras suena el vídeo pulsas "Marcar" en
 * cada cambio de acorde y la app guarda el segundo exacto. Después, al
 * reproducir, va resaltando el acorde que toca, como en Chordify.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/.exec(s);
  return m ? m[1] : null;
}

export interface VideoSyncHandle {
  seekToChord: (index: number) => void;
}

interface Props {
  videoId: string | null;
  syncTimes: number[] | null;
  offset: number;
  chordCount: number;
  onChange: (p: { videoId?: string | null; syncTimes?: number[] | null; offset?: number }) => void;
  onActiveIndex: (index: number | null) => void;
  canPublish: boolean;
  onPublish?: () => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25];

export const VideoSync = forwardRef<VideoSyncHandle, Props>(function VideoSync(
  { videoId, syncTimes, offset, chordCount, onChange, onActiveIndex, canPublish, onPublish },
  ref,
) {
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [url, setUrl] = useState('');
  const [recording, setRecording] = useState<number[] | null>(null);
  const [speed, setSpeed] = useState(1);

  // Crea / cambia el reproductor cuando cambia el vídeo.
  useEffect(() => {
    if (!videoId || !holder.current) return;
    let cancelled = false;
    setReady(false);
    const el = document.createElement('div');
    holder.current.replaceChildren(el);
    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      player.current = new YT.Player(el, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: { onReady: () => !cancelled && setReady(true) },
      });
    });
    return () => {
      cancelled = true;
      try { player.current?.destroy(); } catch { /* ignorar */ }
      player.current = null;
    };
  }, [videoId]);

  const now = useCallback((): number => {
    try { return player.current?.getCurrentTime?.() ?? 0; } catch { return 0; }
  }, []);

  // Seguimiento del acorde actual.
  useEffect(() => {
    if (!ready || recording) return;
    if (!syncTimes?.length) { onActiveIndex(null); return; }
    let last: number | null = -2;
    const id = window.setInterval(() => {
      const t = now() + offset;
      let idx: number | null = null;
      // búsqueda binaria del último acorde que ya empezó
      let lo = 0, hi = syncTimes.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (syncTimes[mid] <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
      }
      if (idx !== last) { last = idx; onActiveIndex(idx); }
    }, 100);
    return () => window.clearInterval(id);
  }, [ready, recording, syncTimes, offset, now, onActiveIndex]);

  useImperativeHandle(ref, () => ({
    seekToChord(index: number) {
      const t = syncTimes?.[index];
      if (t === undefined || !player.current) return;
      player.current.seekTo(Math.max(0, t - offset), true);
      player.current.playVideo();
    },
  }), [syncTimes, offset]);

  const mark = useCallback(() => {
    if (!recording) return;
    const next = [...recording, Math.round(now() * 100) / 100];
    onActiveIndex(next.length - 1);
    if (next.length >= chordCount) {
      onChange({ syncTimes: next, offset: 0 });
      setRecording(null);
    } else {
      setRecording(next);
    }
  }, [recording, chordCount, now, onChange, onActiveIndex]);

  // Barra espaciadora = marcar, mientras se graba.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); mark(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording, mark]);

  const startRecording = () => {
    setRecording([]);
    onActiveIndex(null);
    player.current?.seekTo(0, true);
    player.current?.playVideo();
  };

  const stopRecording = () => {
    if (recording && recording.length) onChange({ syncTimes: recording, offset: 0 });
    setRecording(null);
  };

  if (!videoId) {
    return (
      <div className="video-empty">
        <p>Añade un vídeo de YouTube de este himno para practicar con él y seguir los acordes.</p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const id = parseYouTubeId(url);
            if (id) { onChange({ videoId: id, syncTimes: null, offset: 0 }); setUrl(''); }
            else alert('No reconozco ese enlace de YouTube.');
          }}
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Pega el enlace de YouTube" />
          <button type="submit">Añadir</button>
        </form>
      </div>
    );
  }

  const synced = syncTimes?.length ?? 0;
  return (
    <div className="video">
      <div className="video-frame" ref={holder} />
      <div className="video-controls">
        {recording ? (
          <>
            <button className="primary big" onClick={mark} disabled={!ready}>
              Marcar acorde {recording.length + 1}/{chordCount} <kbd>espacio</kbd>
            </button>
            <button onClick={() => setRecording((r) => (r && r.length ? r.slice(0, -1) : r))} disabled={!recording.length}>Deshacer</button>
            <button onClick={stopRecording}>Terminar</button>
          </>
        ) : (
          <>
            <button onClick={startRecording} disabled={!ready || !chordCount}>
              {synced ? 'Volver a sincronizar' : 'Sincronizar acordes'}
            </button>
            <label className="inline">
              Velocidad
              <select value={speed} onChange={(e) => { const v = Number(e.target.value); setSpeed(v); player.current?.setPlaybackRate(v); }}>
                {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
              </select>
            </label>
            {synced > 0 && (
              <label className="inline" title="Adelanta o retrasa el resaltado si va desfasado">
                Ajuste
                <button onClick={() => onChange({ offset: Math.round((offset - 0.1) * 10) / 10 })}>−</button>
                <span className="mono">{offset > 0 ? '+' : ''}{offset.toFixed(1)}s</span>
                <button onClick={() => onChange({ offset: Math.round((offset + 0.1) * 10) / 10 })}>+</button>
              </label>
            )}
            {canPublish && synced > 0 && <button onClick={onPublish}>Publicar para todos</button>}
            <button className="ghost" onClick={() => onChange({ videoId: null, syncTimes: null, offset: 0 })}>Quitar vídeo</button>
          </>
        )}
      </div>
      {!recording && !synced && <p className="hint">Pulsa «Sincronizar acordes» y toca «Marcar» (o la barra espaciadora) justo cuando cambie cada acorde.</p>}
    </div>
  );
});
