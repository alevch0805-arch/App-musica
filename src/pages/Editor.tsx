import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SongView } from '../components/SongView';
import { loadCustomHymns, saveCustomHymn } from '../data/repo';
import { parseChordPro } from '../music/chordpro';

const TEMPLATE = `{title: Título del canto}
{key: G}

{c: Estrofa 1}
[G]Escribe la letra y pon los [D]acordes
entre [Em]corchetes justo antes de la [C]sílaba.

{soc}
[C]Así se marca el [G]coro
{eoc}
`;

/** Convierte el formato clásico "acordes encima de la letra" a ChordPro. */
export function chordsOverLyricsToChordPro(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const isChordLine = (l: string) => {
    const tokens = l.trim().split(/\s+/).filter(Boolean);
    return tokens.length > 0 && tokens.every((t) => /^(?:[A-G]|Do|Re|Mi|Fa|Sol|La|Si)(?:#|b)?[\w#+°ø()]*(?:\/[A-G](?:#|b)?|\/(?:Do|Re|Mi|Fa|Sol|La|Si)(?:#|b)?)?$/.test(t));
  };
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!isChordLine(l)) { out.push(l); continue; }
    const next = lines[i + 1];
    const chords = [...l.matchAll(/\S+/g)].map((m) => ({ pos: m.index!, name: m[0] }));
    if (next === undefined || !next.trim() || isChordLine(next)) {
      out.push(chords.map((c) => `[${c.name}]`).join(' '));
      continue;
    }
    let lyric = next.padEnd(Math.max(...chords.map((c) => c.pos)) + 1, ' ');
    for (const c of [...chords].reverse()) lyric = lyric.slice(0, c.pos) + `[${c.name}]` + lyric.slice(c.pos);
    out.push(lyric.replace(/\s+$/, ''));
    i++;
  }
  return out.join('\n');
}

export function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const existing = id ? loadCustomHymns().find((h) => h.id === id) : undefined;
  const [text, setText] = useState(existing?.chordpro ?? TEMPLATE);
  const song = useMemo(() => parseChordPro(text), [text]);

  const onSave = () => {
    const hymnId = existing?.id ?? `custom-${Date.now().toString(36)}`;
    saveCustomHymn({
      id: hymnId,
      hymnalId: 'custom',
      number: song.number ?? null,
      title: song.title || 'Sin título',
      chordpro: text,
    });
    navigate(`/himno/${hymnId}`);
  };

  return (
    <div className="editor">
      <h1>{existing ? 'Editar canto' : 'Nuevo canto'}</h1>
      <p className="hint">
        Formato ChordPro: los acordes van entre corchetes, p. ej. <code>[G]Santo</code>. Si pegas un canto con los acordes en
        la línea de arriba, pulsa «Convertir».
      </p>
      <div className="editor-grid">
        <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={22} />
        <div className="preview">
          <h2>{song.title}</h2>
          <SongView song={song} shift={0} notation="american" flats={false} fontSize={16} activeIndex={null} follow={false} />
        </div>
      </div>
      <div className="row end">
        <button onClick={() => setText(chordsOverLyricsToChordPro(text))}>Convertir acordes encima → ChordPro</button>
        <button onClick={() => navigate(-1)}>Cancelar</button>
        <button className="primary" onClick={onSave}>Guardar</button>
      </div>
    </div>
  );
}
