#!/usr/bin/env node
/**
 * Sube un himnario (carpeta con archivos .cho / .chordpro) a Supabase.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run importar -- contenido/himnario-bautista
 *
 * La carpeta debe tener un himnario.json: { "id": "bautista", "name": "Himnario Bautista", "description": "..." }
 * Cada archivo es un himno en ChordPro; el número se toma de {number: N} o del
 * inicio del nombre del archivo (p. ej. "023-a-dios-sea-la-gloria.cho").
 *
 * ¡Ojo! La clave service_role salta todas las protecciones: úsala sólo en tu
 * ordenador, nunca dentro de la app.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const dir = process.argv[2];
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!dir || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run importar -- <carpeta>');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const meta = JSON.parse(await readFile(path.join(dir, 'himnario.json'), 'utf8'));
if (!meta.id || !meta.name) throw new Error('himnario.json necesita "id" y "name"');

const directive = (src, ...names) => {
  for (const n of names) {
    const m = new RegExp(`^\\{\\s*${n}\\s*:\\s*(.*?)\\s*\\}\\s*$`, 'im').exec(src);
    if (m) return m[1];
  }
  return null;
};

const files = (await readdir(dir)).filter((f) => /\.(cho|chordpro|crd|pro)$/i.test(f)).sort();
const rows = [];
for (const f of files) {
  const chordpro = await readFile(path.join(dir, f), 'utf8');
  const slug = f.replace(/\.[^.]+$/, '');
  const num = directive(chordpro, 'number', 'n') ?? /^(\d+)/.exec(slug)?.[1] ?? null;
  rows.push({
    id: `${meta.id}-${slug}`,
    hymnal_id: meta.id,
    number: num ? parseInt(num, 10) : null,
    title: directive(chordpro, 'title', 't') ?? slug,
    chordpro,
    updated_at: new Date().toISOString(),
  });
}

let { error } = await db.from('hymnals').upsert({ id: meta.id, name: meta.name, description: meta.description ?? null, sort: meta.sort ?? 0 });
if (error) throw error;
for (let i = 0; i < rows.length; i += 200) {
  ({ error } = await db.from('hymns').upsert(rows.slice(i, i + 200)));
  if (error) throw error;
}
console.log(`✔ ${meta.name}: ${rows.length} himnos subidos.`);
