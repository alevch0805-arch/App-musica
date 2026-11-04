-- =====================================================================
--  Listas para el culto guardadas en el servidor.
--  Cada usuario edita las suyas; las marcadas como "compartidas" las ven
--  todos los usuarios (sólo lectura). El administrador puede editar y
--  borrar las compartidas.
-- =====================================================================

create table if not exists public.setlists (
  id          text primary key,
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  owner_name  text,
  name        text not null,
  date        date,
  items       jsonb not null default '[]'::jsonb,   -- [{hymnId, transpose, note}]
  shared      boolean not null default false,
  updated_at  timestamptz not null default now()
);
create index if not exists setlists_owner on public.setlists (owner_id);
create index if not exists setlists_shared on public.setlists (shared) where shared;

alter table public.setlists enable row level security;

drop policy if exists "leer listas" on public.setlists;
create policy "leer listas" on public.setlists for select to authenticated
  using (public.current_device_ok() and (owner_id = auth.uid() or shared or public.is_admin()));

drop policy if exists "crear listas" on public.setlists;
create policy "crear listas" on public.setlists for insert to authenticated
  with check (owner_id = auth.uid() and public.current_device_ok());

drop policy if exists "editar listas" on public.setlists;
create policy "editar listas" on public.setlists for update to authenticated
  using (public.current_device_ok() and (owner_id = auth.uid() or (shared and public.is_admin())))
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "borrar listas" on public.setlists;
create policy "borrar listas" on public.setlists for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- Nadie puede cambiar el dueño de una lista.
create or replace function public.setlists_keep_owner()
returns trigger language plpgsql as $$
begin
  new.owner_id := old.owner_id;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists setlists_keep_owner on public.setlists;
create trigger setlists_keep_owner before update on public.setlists
  for each row execute function public.setlists_keep_owner();
