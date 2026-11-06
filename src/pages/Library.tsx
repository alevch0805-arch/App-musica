import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../data/repo';
import { load, save } from '../lib/storage';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Library() {
  const { library, error } = useLibrary();
  const [query, setQuery] = useState('');
  const [hymnalId, setHymnalId] = useState<string>(() => load('last-hymnal', 'all'));
  const favorites = load<string[]>('favorites', []);

  const results = useMemo(() => {
    if (!library) return [];
    const q = normalize(query.trim());
    return library.hymns
      .filter((h) => hymnalId === 'all' || (hymnalId === 'fav' ? favorites.includes(h.id) : h.hymnalId === hymnalId))
      .filter((h) => {
        if (!q) return true;
        if (/^\d+$/.test(q)) return String(h.number ?? '').startsWith(q);
        return normalize(h.title).includes(q) || normalize(h.chordpro).includes(q);
      })
      .sort((a, b) => (a.hymnalId.localeCompare(b.hymnalId)) || ((a.number ?? 1e9) - (b.number ?? 1e9)) || a.title.localeCompare(b.title));
  }, [library, query, hymnalId, favorites]);

  if (error && !library) return <p className="center error">No se pudo cargar el himnario: {error}</p>;
  if (!library) return <p className="center">Cargando himnarios…</p>;

  const hymnalName = (id: string) => library.hymnals.find((h) => h.id === id)?.name ?? '';

  return (
    <div className="library">
      {library.source === 'cache' && <p className="notice">Sin conexión: mostrando la última copia guardada.</p>}
      <div className="search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por número, título o letra…"
          autoFocus
        />
        <select
          value={hymnalId}
          onChange={(e) => { setHymnalId(e.target.value); save('last-hymnal', e.target.value); }}
          aria-label="Himnario"
        >
          <option value="all">Todos los himnarios</option>
          <option value="fav">★ Favoritos</option>
          {library.hymnals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </div>

      <ul className="hymn-list">
        {results.map((h) => (
          <li key={h.id}>
            <Link to={`/himno/${encodeURIComponent(h.id)}`}>
              <span className="num">{h.number ?? '·'}</span>
              <span className="title">{h.title}</span>
              {hymnalId === 'all' && <span className="hymnal">{hymnalName(h.hymnalId)}</span>}
              {favorites.includes(h.id) && <span className="star">★</span>}
            </Link>
          </li>
        ))}
        {!results.length && <li className="empty">No hay resultados.</li>}
      </ul>
      <p className="row end">
        <Link className="button" to="/importar">Importar himnario</Link>
        <Link className="button" to="/nuevo">+ Añadir canto propio</Link>
      </p>
    </div>
  );
}
