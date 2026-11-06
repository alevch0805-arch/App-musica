import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { buildImport, hymnalNameIn, nameFromFile, slugify } from '../data/importer';
import { saveLocalHymnal, uploadHymnal, useLibrary } from '../data/repo';
import { save } from '../lib/storage';
import { useAuth } from '../lib/auth';
import { isDemo } from '../lib/supabase';

export function ImportPage() {
  const { profile } = useAuth();
  const { library } = useLibrary();
  const navigate = useNavigate();
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canUpload = !isDemo && !!profile?.is_admin;
  const [target, setTarget] = useState<'server' | 'device'>(canUpload ? 'server' : 'device');

  const id = slugify(name) || 'himnario';
  const items = useMemo(() => buildImport(files, id), [files, id]);
  const withWarnings = items.filter((i) => i.warnings.length);
  const exists = library?.hymnals.some((h) => h.id === id);

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    const read = await Promise.all([...list].map(async (f) => ({ name: f.name, text: await f.text() })));
    setFiles(read);
    if (!name) setName(hymnalNameIn(read[0].text) ?? nameFromFile(read[0].name));
  };

  const run = async () => {
    const hymnal = { id, name: name.trim(), description: description.trim() || undefined };
    const hymns = items.map((i) => i.hymn);
    try {
      if (target === 'server') {
        setBusy('Subiendo…');
        await uploadHymnal(hymnal, hymns, (n) => setBusy(`Subiendo… ${n}/${hymns.length}`));
      } else {
        saveLocalHymnal(hymnal, hymns);
      }
      save('last-hymnal', id);
      navigate('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="import">
      <Link to="/" className="back">← Himnarios</Link>
      <h1>Importar himnario</h1>
      <div className="card">
        <p className="hint">
          Elige uno o varios archivos ChordPro (<code>.chopro</code>, <code>.cho</code>, <code>.txt</code>). Un mismo archivo puede
          traer el himnario completo, con los himnos separados por <code>{'{new_song}'}</code>.
        </p>
        <input type="file" accept=".chopro,.cho,.crd,.pro,.chordpro,.txt" multiple onChange={(e) => pick(e.target.files)} aria-label="Archivos" />
      </div>

      {items.length > 0 && (
        <>
          <div className="card">
            <label>Nombre del himnario<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Descripción (opcional)<input value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            {canUpload ? (
              <div className="row">
                <label className="check"><input type="radio" checked={target === 'server'} onChange={() => setTarget('server')} /> Subir al servidor (lo ven todos los usuarios)</label>
                <label className="check"><input type="radio" checked={target === 'device'} onChange={() => setTarget('device')} /> Sólo en este dispositivo</label>
              </div>
            ) : (
              <p className="hint">Se guardará sólo en este dispositivo{isDemo ? '' : '. Para que lo vean todos, un administrador debe importarlo'}.</p>
            )}
            {exists && <p className="notice">Ya existe un himnario con este nombre: se reemplazarán sus himnos.</p>}
            {error && <p className="error">{error}</p>}
            <div className="row end">
              <button className="primary" disabled={!!busy || !name.trim()} onClick={run}>
                {busy ?? `Importar ${items.length} himno${items.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>

          <div className="card">
            <h2>{items.length} himnos {withWarnings.length > 0 && <span className="chip">{withWarnings.length} con avisos</span>}</h2>
            <ul className="admin-list import-list">
              {items.map((i) => (
                <li key={i.hymn.id}>
                  <span className="num">{i.hymn.number ?? '·'}</span>
                  <span className="grow">{i.hymn.title}</span>
                  <small className="muted">{i.chords} acordes</small>
                  {i.warnings.map((w) => <span key={w} className="status expired">{w}</span>)}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
