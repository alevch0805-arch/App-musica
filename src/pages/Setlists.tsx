import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createSetlist, sortSetlists, useSetlists } from '../data/setlists';

export function nextSunday(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

export const fmtDay = (date: string) =>
  new Date(date + 'T12:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });

export function Setlists() {
  const lists = sortSetlists(useSetlists());
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="setlists">
      <h1>Listas para el culto</h1>
      <form
        className="row card"
        onSubmit={(e) => {
          e.preventDefault();
          const s = createSetlist(name.trim() || 'Culto del domingo', nextSunday());
          setName('');
          navigate(`/listas/${s.id}`);
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (p. ej. Culto del domingo)" style={{ flex: 1 }} />
        <button className="primary">+ Nueva lista</button>
      </form>
      <ul className="hymn-list">
        {lists.map((s) => (
          <li key={s.id} className={s.date && s.date < today ? 'past' : ''}>
            <Link to={`/listas/${s.id}`}>
              <span className="date">{s.date ? fmtDay(s.date) : '—'}</span>
              <span className="title">{s.name}</span>
              <span className="hymnal">{s.items.length} himno{s.items.length === 1 ? '' : 's'}</span>
            </Link>
          </li>
        ))}
        {!lists.length && <li className="empty">Aún no tienes listas. Crea una para preparar el próximo culto.</li>}
      </ul>
    </div>
  );
}
