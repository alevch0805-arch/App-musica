import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLibrary } from '../data/repo';
import { canEdit, deleteSetlist, duplicateSetlist, isMine, moveItem, setlistAsText, updateSetlist, useSetlists, useSyncStatus, type SetlistItem, type SyncStatus } from '../data/setlists';
import { isDemo } from '../lib/supabase';
import { useSettings } from '../lib/settings';
import { parseChordPro } from '../music/chordpro';
import { formatChord, parseChord, prefersFlats, transposeChord } from '../music/theory';
import type { Hymn } from '../data/types';

const SYNC_LABEL: Record<SyncStatus, string> = {
  local: '',
  synced: '✓ Guardada en la nube',
  pending: 'Guardando…',
  syncing: 'Guardando…',
  error: 'Sin conexión: se guardará al volver la conexión',
};

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Tono original de un himno (directiva {key} o primer acorde). */
export function hymnKey(h: Hymn) {
  const song = parseChordPro(h.chordpro);
  return parseChord(song.key ?? '') ?? (song.chordSequence[0] ? parseChord(song.chordSequence[0]) : null);
}

export function SetlistPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const setlist = useSetlists().find((s) => s.id === id);
  const { library } = useLibrary();
  const { settings } = useSettings();
  const [query, setQuery] = useState('');
  const sync = useSyncStatus();

  const byId = useMemo(() => new Map((library?.hymns ?? []).map((h) => [h.id, h])), [library]);
  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q || !library) return [];
    return library.hymns
      .filter((h) => (/^\d+$/.test(q) ? String(h.number ?? '').startsWith(q) : normalize(h.title).includes(q)))
      .slice(0, 8);
  }, [query, library]);

  if (!setlist) return <p className="center">No encontré esa lista. <Link to="/listas">Volver</Link></p>;
  if (!library) return <p className="center">Cargando…</p>;

  const editable = canEdit(setlist);
  const mine = isMine(setlist);
  const setItems = (items: SetlistItem[]) => updateSetlist(setlist.id, (s) => ({ ...s, items }));
  const keyName = (h: Hymn, transpose: number) => {
    const k = hymnKey(h);
    if (!k) return '—';
    const t = transposeChord(k, transpose);
    return formatChord(t, settings.notation, prefersFlats(t, settings.accidentals));
  };
  const label = (h: Hymn | undefined) => (h ? `${h.number !== null ? h.number + '. ' : ''}${h.title}` : 'Himno no disponible');

  const share = async () => {
    const text = setlistAsText(setlist, setlist.items.map((it) => {
      const h = byId.get(it.hymnId);
      return h ? `${label(h)} (${keyName(h, it.transpose)})` : label(h);
    }));
    try {
      if (navigator.share) await navigator.share({ title: setlist.name, text });
      else { await navigator.clipboard.writeText(text); alert('Lista copiada. Ya puedes pegarla en WhatsApp o en un correo.'); }
    } catch { /* cancelado */ }
  };

  return (
    <div className="setlist">
      <Link to="/listas" className="back">← Listas</Link>
      <div className="card">
        {!mine && (
          <p className="notice">
            Lista {setlist.shared ? 'compartida' : ''} de <b>{setlist.ownerName ?? 'otro usuario'}</b>
            {editable ? ' · como administrador puedes editarla.' : ' · sólo lectura. Puedes copiarla a tus listas para cambiarla.'}
          </p>
        )}
        <div className="row">
          <input
            disabled={!editable}
            className="title-input"
            value={setlist.name}
            onChange={(e) => updateSetlist(setlist.id, (s) => ({ ...s, name: e.target.value }))}
            aria-label="Nombre de la lista"
          />
          <input
            disabled={!editable}
            type="date"
            value={setlist.date ?? ''}
            onChange={(e) => updateSetlist(setlist.id, (s) => ({ ...s, date: e.target.value || null }))}
            aria-label="Fecha"
            style={{ width: 'auto' }}
          />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" disabled={!setlist.items.length} onClick={() => navigate(`/himno/${encodeURIComponent(setlist.items[0].hymnId)}?lista=${setlist.id}&pos=0`)}>
            ▶ Tocar
          </button>
          <button disabled={!setlist.items.length} onClick={() => navigate(`/proyectar/${encodeURIComponent(setlist.items[0].hymnId)}?lista=${setlist.id}&pos=0`)}>
            Proyectar letras
          </button>
          <button disabled={!setlist.items.length} onClick={share}>Enviar por WhatsApp</button>
          {!mine && (
            <button onClick={() => navigate(`/listas/${duplicateSetlist(setlist).id}`)}>Copiar a mis listas</button>
          )}
        </div>
        {!isDemo && mine && (
          <label className="check share-toggle">
            <input
              type="checkbox"
              checked={!!setlist.shared}
              onChange={(e) => updateSetlist(setlist.id, (s) => ({ ...s, shared: e.target.checked }))}
            />
            Compartir con todos los usuarios (la verán en sus listas, sin poder cambiarla)
          </label>
        )}
        {!isDemo && SYNC_LABEL[sync] && <p className={'sync ' + sync}>{SYNC_LABEL[sync]}</p>}
      </div>

      <ol className="items">
        {setlist.items.map((it, i) => {
          const h = byId.get(it.hymnId);
          return (
            <li key={i} className="item">
              <span className="pos">{i + 1}</span>
              <div className="item-main">
                {h ? <Link to={`/himno/${encodeURIComponent(h.id)}?lista=${setlist.id}&pos=${i}`}>{label(h)}</Link> : <span className="muted">{label(h)}</span>}
{editable ? (
                <input
                  className="note"
                  value={it.note ?? ''}
                  placeholder="Nota (p. ej. sólo estrofas 1 y 3)"
                  onChange={(e) => setItems(setlist.items.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                />
                ) : it.note ? <small className="muted">📝 {it.note}</small> : null}
              </div>
              {h && editable && (
                <div className="tool">
                  <button onClick={() => setItems(setlist.items.map((x, j) => (j === i ? { ...x, transpose: x.transpose - 1 } : x)))} aria-label="Bajar tono">−</button>
                  <span className="key">{keyName(h, it.transpose)}</span>
                  <button onClick={() => setItems(setlist.items.map((x, j) => (j === i ? { ...x, transpose: x.transpose + 1 } : x)))} aria-label="Subir tono">+</button>
                </div>
              )}
              {!editable && h && <span className="key">{keyName(h, it.transpose)}</span>}
              {editable && <div className="tool">
                <button onClick={() => setItems(moveItem(setlist.items, i, i - 1))} disabled={i === 0} aria-label="Subir en la lista">↑</button>
                <button onClick={() => setItems(moveItem(setlist.items, i, i + 1))} disabled={i === setlist.items.length - 1} aria-label="Bajar en la lista">↓</button>
                <button className="danger" onClick={() => setItems(setlist.items.filter((_, j) => j !== i))} aria-label="Quitar">✕</button>
              </div>}
            </li>
          );
        })}
      </ol>

      {editable && <div className="card">
        <h2>Añadir himno</h2>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Número o título…" />
        <ul className="results">
          {results.map((h) => (
            <li key={h.id}>
              <button
                className="ghost"
                onClick={() => {
                  setItems([...setlist.items, { hymnId: h.id, transpose: 0 }]);
                  setQuery('');
                }}
              >
                + {label(h)} <span className="muted">· {library.hymnals.find((x) => x.id === h.hymnalId)?.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>}

      {(mine || editable) && <p className="row end">
        <button className="danger" onClick={() => { if (confirm('¿Borrar esta lista?')) { deleteSetlist(setlist.id); navigate('/listas'); } }}>
          Borrar lista
        </button>
      </p>}
    </div>
  );
}
