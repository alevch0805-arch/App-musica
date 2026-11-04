import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChordDiagram } from '../components/ChordDiagram';
import { SongView, displayChord } from '../components/SongView';
import { VideoSync, type VideoSyncHandle } from '../components/VideoSync';
import { deleteCustomHymn, loadHymnPrefs, publishSync, saveHymnPrefs, useLibrary, type HymnPrefs } from '../data/repo';
import { nextSunday } from './Setlists';
import { addToSetlist, createSetlist, updateSetlist, useSetlists } from '../data/setlists';
import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';
import { load, save } from '../lib/storage';
import { parseChordPro } from '../music/chordpro';
import { formatChord, parseChord, prefersFlats, suggestCapo, transposeChord, type Chord } from '../music/theory';
import type { Instrument } from '../music/voicings';

export function HymnPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const listId = params.get('lista');
  const pos = Number(params.get('pos') ?? 0);
  const { library } = useLibrary();
  const hymn = library?.hymns.find((h) => h.id === id);
  if (!library) return <p className="center">Cargando…</p>;
  if (!hymn) return <p className="center">No encontré ese himno. <Link to="/">Volver</Link></p>;
  return <HymnView key={`${hymn.id}:${listId}:${pos}`} hymnId={hymn.id} listId={listId} pos={pos} />;
}

function HymnView({ hymnId, listId, pos }: { hymnId: string; listId: string | null; pos: number }) {
  const { library } = useLibrary();
  const hymn = library!.hymns.find((h) => h.id === hymnId)!;
  const hymnal = library!.hymnals.find((h) => h.id === hymn.hymnalId);
  const { settings, update } = useSettings();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const song = useMemo(() => parseChordPro(hymn.chordpro), [hymn.chordpro]);
  const [prefs, setPrefs] = useState<HymnPrefs>(() => loadHymnPrefs(hymn));
  const [active, setActive] = useState<number | null>(null);
  const video = useRef<VideoSyncHandle>(null);
  const [favorite, setFavorite] = useState(() => load<string[]>('favorites', []).includes(hymnId));
  const toggleFavorite = () => {
    const list = load<string[]>('favorites', []).filter((x) => x !== hymnId);
    if (!favorite) list.push(hymnId);
    save('favorites', list);
    setFavorite(!favorite);
  };

  const changePrefs = useCallback((p: Partial<HymnPrefs>) => {
    setPrefs((old) => {
      const next = { ...old, ...p };
      saveHymnPrefs(hymnId, next);
      return next;
    });
  }, [hymnId]);

  // Dentro de una lista, el tono es el de la lista (cada culto puede ir en un tono distinto).
  const setlists = useSetlists();
  const setlist = listId ? setlists.find((l) => l.id === listId) : undefined;
  const item = setlist?.items[pos]?.hymnId === hymnId ? setlist.items[pos] : undefined;
  const transpose = item ? item.transpose : prefs.transpose;
  const setTranspose = (n: number) => {
    if (item && setlist) updateSetlist(setlist.id, (l) => ({ ...l, items: l.items.map((x, j) => (j === pos ? { ...x, transpose: n } : x)) }));
    else setTranspose(n);
  };
  const goTo = useCallback((i: number) => {
    const target = setlist?.items[i];
    if (target) navigate(`/himno/${encodeURIComponent(target.hymnId)}?lista=${setlist!.id}&pos=${i}`, { replace: true });
  }, [setlist, navigate]);

  // Flechas del teclado o pedal Bluetooth: himno anterior / siguiente de la lista.
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      if (e.key === 'ArrowRight') goTo(pos + 1);
      else if (e.key === 'ArrowLeft') goTo(pos - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, pos, goTo]);

  const originalKey = parseChord(song.key ?? '') ?? (song.chordSequence[0] ? parseChord(song.chordSequence[0]) : null);
  const soundingKey = originalKey ? transposeChord(originalKey, transpose) : null;
  const flats = prefersFlats(soundingKey, settings.accidentals);
  const shift = transpose - prefs.capo;
  const fmt = (c: Chord | null) => (c ? formatChord(c, settings.notation, flats) : '—');

  const parsed = useMemo(() => song.chordSequence.map((c) => parseChord(c)), [song]);
  const uniqueChords = useMemo(() => {
    const seen = new Map<string, Chord>();
    for (const c of parsed) {
      if (!c) continue;
      const t = transposeChord(c, shift);
      const k = `${t.root}${t.quality}/${t.bass}`;
      if (!seen.has(k)) seen.set(k, t);
    }
    return [...seen.values()];
  }, [parsed, shift]);

  const capoTip = useMemo(
    () => suggestCapo(parsed.filter((c): c is Chord => !!c).map((c) => transposeChord(c, transpose))),
    [parsed, transpose],
  );

  const current = active !== null ? parsed[active] : null;
  const upcoming = active !== null ? song.chordSequence.slice(active + 1, active + 5) : [];

  // Título de la pestaña con el número y nombre del himno.
  useEffect(() => {
    document.title = `${hymn.number ? hymn.number + '. ' : ''}${song.title || hymn.title}`;
  }, [hymn, song.title]);

  const publish = async () => {
    try {
      await publishSync(hymn.id, prefs.videoId, prefs.syncTimes);
      alert('Vídeo y sincronización publicados para todos los usuarios.');
    } catch (e) {
      alert('No se pudo publicar: ' + (e as Error).message);
    }
  };

  return (
    <div className="hymn">
      <header className="hymn-head">
        {item && setlist ? (
          <div className="list-nav">
            <button onClick={() => goTo(pos - 1)} disabled={pos === 0} aria-label="Himno anterior">←</button>
            <Link to={`/listas/${setlist.id}`} className="list-name">{setlist.name} · {pos + 1}/{setlist.items.length}</Link>
            <button onClick={() => goTo(pos + 1)} disabled={pos >= setlist.items.length - 1} aria-label="Himno siguiente">→</button>
          </div>
        ) : (
          <Link to="/" className="back">← {hymnal?.name ?? 'Himnarios'}</Link>
        )}
        <h1>{hymn.number !== null && <span className="num">{hymn.number}</span>} {song.title || hymn.title}
          <button className="star-btn" onClick={toggleFavorite} aria-label={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}>{favorite ? '★' : '☆'}</button>
        </h1>
        {song.author && <p className="author">{song.author}</p>}
        {item?.note && <p className="item-note">📝 {item.note}</p>}
        <p className="meta">
          Tono original: <b>{fmt(originalKey)}</b>
          {transpose !== 0 && <> · Suena en: <b>{fmt(soundingKey)}</b></>}
          {song.time && <> · Compás {song.time}</>}
          {song.tempo && <> · ♩ = {song.tempo}</>}
        </p>
        <div className="row">
          <Link className="button" to={`/proyectar/${encodeURIComponent(hymn.id)}${item && setlist ? `?lista=${setlist.id}&pos=${pos}` : ''}`}>Proyectar</Link>
          {!item && (
            <select
              value=""
              aria-label="Añadir a una lista"
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                const listIdTarget = v === 'new' ? createSetlist(prompt('Nombre de la lista', 'Culto del domingo') || 'Culto del domingo', nextSunday()).id : v;
                addToSetlist(listIdTarget, hymn.id, transpose);
                alert('Añadido a la lista.');
              }}
            >
              <option value="">+ Añadir a lista…</option>
              {setlists.map((l) => <option key={l.id} value={l.id}>{l.name}{l.date ? ` (${l.date})` : ''}</option>)}
              <option value="new">Nueva lista…</option>
            </select>
          )}
        </div>
      </header>

      <div className="toolbar">
        <div className="tool">
          <span>Tono</span>
          <button onClick={() => setTranspose(transpose - 1)} aria-label="Bajar medio tono">−</button>
          <span className="mono val">{transpose > 0 ? '+' : ''}{transpose}</span>
          <button onClick={() => setTranspose(transpose + 1)} aria-label="Subir medio tono">+</button>
          {transpose !== 0 && <button className="ghost" onClick={() => setTranspose(0)}>Original</button>}
        </div>
        <div className="tool">
          <span>Cejilla</span>
          <button onClick={() => changePrefs({ capo: Math.max(0, prefs.capo - 1) })} aria-label="Quitar cejilla">−</button>
          <span className="mono val">{prefs.capo}</span>
          <button onClick={() => changePrefs({ capo: Math.min(11, prefs.capo + 1) })} aria-label="Poner cejilla">+</button>
          {capoTip.capo !== prefs.capo && capoTip.easy > 0 && (
            <button className="ghost" onClick={() => changePrefs({ capo: capoTip.capo })} title="La cejilla con acordes más fáciles">
              Sugerida: {capoTip.capo}
            </button>
          )}
        </div>
        <div className="tool">
          <select value={settings.instrument} onChange={(e) => update({ instrument: e.target.value as Instrument })} aria-label="Instrumento">
            <option value="guitar">Guitarra</option>
            <option value="ukulele">Ukelele</option>
            <option value="piano">Piano</option>
            <option value="none">Sólo acordes</option>
          </select>
          <select value={settings.notation} onChange={(e) => update({ notation: e.target.value as 'latin' | 'american' })} aria-label="Notación">
            <option value="american">C D E</option>
            <option value="latin">Do Re Mi</option>
          </select>
        </div>
        <div className="tool">
          <button onClick={() => update({ fontSize: Math.max(12, settings.fontSize - 2) })} aria-label="Letra más pequeña">A−</button>
          <button onClick={() => update({ fontSize: Math.min(40, settings.fontSize + 2) })} aria-label="Letra más grande">A+</button>
        </div>
      </div>

      {settings.instrument !== 'none' && settings.showDiagrams && (
        <div className="diagrams">
          {uniqueChords.map((c, i) => (
            <ChordDiagram key={i} chord={c} instrument={settings.instrument} notation={settings.notation} flats={flats} />
          ))}
        </div>
      )}

      <div className="hymn-body">
        <aside className="player">
          <VideoSync
            ref={video}
            videoId={prefs.videoId}
            syncTimes={prefs.syncTimes}
            offset={prefs.offset}
            chordCount={song.chordSequence.length}
            onChange={changePrefs}
            onActiveIndex={setActive}
            canPublish={!!profile?.is_admin && hymn.hymnalId !== 'custom'}
            onPublish={publish}
          />
          {current && (
            <div className="now">
              <div className="now-main">
                <small>Ahora</small>
                <ChordDiagram
                  chord={transposeChord(current, shift)}
                  instrument={settings.instrument === 'none' ? 'guitar' : settings.instrument}
                  notation={settings.notation}
                  flats={flats}
                  size={1.4}
                />
              </div>
              <div className="next">
                <small>Siguen</small>
                {upcoming.map((c, i) => <span key={i} className="chip">{displayChord(c, shift, settings.notation, flats)}</span>)}
              </div>
            </div>
          )}
        </aside>

        <SongView
          song={song}
          shift={shift}
          notation={settings.notation}
          flats={flats}
          fontSize={settings.fontSize}
          activeIndex={active}
          follow={!!prefs.syncTimes}
          onChordClick={prefs.syncTimes ? (i) => video.current?.seekToChord(i) : undefined}
        />
      </div>

      {hymn.hymnalId === 'custom' && (
        <div className="row end">
          <Link to={`/editar/${hymn.id}`} className="button">Editar</Link>
          <button
            className="danger"
            onClick={() => {
              if (confirm('¿Borrar este canto?')) { deleteCustomHymn(hymn.id); navigate('/'); }
            }}
          >
            Borrar
          </button>
        </div>
      )}
    </div>
  );
}
