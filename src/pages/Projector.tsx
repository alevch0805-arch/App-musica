/**
 * Modo proyector: sólo la letra, en grande, una estrofa por pantalla.
 * Avanza con flechas, espacio, Re Pág / Av Pág (pedales y mandos de
 * presentación), o tocando la mitad derecha / izquierda de la pantalla.
 * B = pantalla en negro.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLibrary } from '../data/repo';
import { useSetlists } from '../data/setlists';
import { parseChordPro, type Song } from '../music/chordpro';

export interface Slide {
  kind: 'title' | 'lyrics';
  label?: string | null;
  lines: string[];
  chorus?: boolean;
}

const MAX_LINES = 6;

export function buildSlides(song: Song, number: number | null): Slide[] {
  const slides: Slide[] = [{ kind: 'title', lines: [song.title], label: number !== null ? String(number) : null }];
  for (const sec of song.sections) {
    const lines = sec.lines
      .filter((l) => l.kind === 'lyrics')
      .map((l) => (l.kind === 'lyrics' ? l.segments.map((s) => s.text).join('').replace(/\s+/g, ' ').trim() : ''))
      .filter(Boolean);
    if (!lines.length) continue;
    const parts = Math.ceil(lines.length / MAX_LINES);
    const per = Math.ceil(lines.length / parts);
    for (let i = 0; i < lines.length; i += per) {
      slides.push({ kind: 'lyrics', label: sec.label, chorus: sec.chorus, lines: lines.slice(i, i + per) });
    }
  }
  return slides;
}

export function Projector() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const listId = params.get('lista');
  const pos = Number(params.get('pos') ?? 0);
  const { library } = useLibrary();
  const setlist = useSetlists().find((l) => l.id === listId);
  const navigate = useNavigate();
  const hymn = library?.hymns.find((h) => h.id === id);
  const slides = useMemo(() => (hymn ? buildSlides(parseChordPro(hymn.chordpro), hymn.number) : []), [hymn]);
  const [index, setIndex] = useState(0);
  const [black, setBlack] = useState(false);

  useEffect(() => setIndex(0), [id, pos]);

  const goHymn = useCallback((i: number) => {
    const target = setlist?.items[i];
    if (target) navigate(`/proyectar/${encodeURIComponent(target.hymnId)}?lista=${setlist!.id}&pos=${i}`, { replace: true });
  }, [setlist, navigate]);

  const next = useCallback(() => {
    if (index < slides.length - 1) setIndex(index + 1);
    else goHymn(pos + 1);
  }, [index, slides.length, goHymn, pos]);
  const prev = useCallback(() => {
    if (index > 0) setIndex(index - 1);
    else goHymn(pos - 1);
  }, [index, goHymn, pos]);

  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    navigate(-1);
  }, [navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); next(); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); prev(); }
      else if (e.key === 'b' || e.key === 'B' || e.key === '.') setBlack((b) => !b);
      else if (e.key === 'Escape' && !document.fullscreenElement) exit();
      else if (e.key === 'Home') setIndex(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, exit]);

  if (!library) return <p className="center">Cargando…</p>;
  if (!hymn) return <p className="center">No encontré ese himno. <Link to="/">Volver</Link></p>;

  const slide = slides[Math.min(index, slides.length - 1)];
  const nextHymn = setlist?.items[pos + 1] ? library.hymns.find((h) => h.id === setlist.items[pos + 1].hymnId) : undefined;
  const longest = Math.max(...slide.lines.map((l) => l.length), 10);
  // Tamaño de letra según la línea más larga y el número de líneas.
  const fontSize = `min(${Math.min(9, 150 / longest).toFixed(2)}vw, ${(70 / Math.max(slide.lines.length, 2)).toFixed(2)}vh)`;

  return (
    <div
      className={'projector' + (black ? ' black' : '')}
      onClick={(e) => (e.clientX > window.innerWidth / 2 ? next() : prev())}
    >
      {!black && (
        <div className={'slide ' + slide.kind + (slide.chorus ? ' chorus' : '')} style={{ fontSize }}>
          {slide.kind === 'title' ? (
            <>
              {slide.label && <div className="slide-num">{slide.label}</div>}
              <h1>{slide.lines[0]}</h1>
            </>
          ) : (
            slide.lines.map((l, i) => <p key={i}>{l}</p>)
          )}
        </div>
      )}
      <div className="proj-bar" onClick={(e) => e.stopPropagation()}>
        <button onClick={exit}>✕ Salir</button>
        <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}>
          Pantalla completa
        </button>
        <button onClick={() => setBlack((b) => !b)}>{black ? 'Mostrar' : 'Negro'}</button>
        <span className="proj-info">
          {setlist ? `${pos + 1}/${setlist.items.length} · ` : ''}
          {index + 1}/{slides.length}
          {slide.label && slide.kind === 'lyrics' ? ` · ${slide.label}` : ''}
          {index === slides.length - 1 && nextHymn ? ` · Siguiente: ${nextHymn.title}` : ''}
        </span>
      </div>
    </div>
  );
}
