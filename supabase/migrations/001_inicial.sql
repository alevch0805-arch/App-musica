-- =====================================================================
--  Himnos y acordes · esquema inicial para Supabase
--  - Registro sólo con código de invitación
--  - Máximo de dispositivos por cuenta (2 por defecto)
--  - Los himnos sólo se entregan a dispositivos registrados
--  Ejecútalo en Supabase → SQL Editor (o con `supabase db push`).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Códigos de invitación (sólo los gestiona el administrador) ----------
create table if not exists public.invite_codes (
  code        text primary key,
  note        text,                       -- p. ej. "Para Juan Pérez"
  max_uses    int  not null default 1,
  uses        int  not null default 0,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.invite_codes enable row level security;
-- Sin políticas: nadie puede leerlos desde la app; sólo el panel de Supabase.

-- ---------- Perfiles ----------
create table if not exists public.profiles (
  id              uuid primary key references auth.users on delete cascade,
  email           text,
  display_name    text,
  is_admin        boolean not null default false,
  max_devices     int     not null default 2,
  last_unlink_at  timestamptz,
  invite_code     text,
  created_at      timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "ver mi perfil" on public.profiles;
create policy "ver mi perfil" on public.profiles for select using (auth.uid() = id);

-- Al registrarse: valida y consume el código de invitación, y crea el perfil.
-- Si el código no vale, el registro se rechaza.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_code text := nullif(trim(new.raw_user_meta_data->>'invite_code'), '');
begin
  update invite_codes
     set uses = uses + 1
   where code = v_code
     and uses < max_uses
     and (expires_at is null or expires_at > now());
  if not found then
    raise exception 'INVITE_INVALID';
  end if;

  insert into profiles (id, email, display_name, invite_code)
  values (new.id, new.email, nullif(new.raw_user_meta_data->>'display_name', ''), v_code);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Dispositivos ----------
create table if not exists public.devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  device_id   text not null,
  name        text,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  unique (user_id, device_id)
);
alter table public.devices enable row level security;
drop policy if exists "ver mis dispositivos" on public.devices;
create policy "ver mis dispositivos" on public.devices for select using (auth.uid() = user_id);
-- Altas y bajas sólo mediante las funciones de abajo.

-- Registra este dispositivo. Falla con DEVICE_LIMIT si ya hay demasiados.
create or replace function public.register_device(p_device_id text, p_name text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_max   int;
  v_count int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(length(p_device_id), 0) < 8 then raise exception 'BAD_DEVICE'; end if;

  update devices set last_seen = now(), name = coalesce(p_name, name)
   where user_id = v_uid and device_id = p_device_id;
  if found then return json_build_object('status', 'ok'); end if;

  -- Evita que dos dispositivos nuevos entren a la vez y superen el límite.
  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  select max_devices into v_max from profiles where id = v_uid;
  select count(*) into v_count from devices where user_id = v_uid;
  if v_count >= coalesce(v_max, 2) then
    raise exception 'DEVICE_LIMIT';
  end if;

  insert into devices (user_id, device_id, name) values (v_uid, p_device_id, p_name)
  on conflict (user_id, device_id) do update set last_seen = now();
  return json_build_object('status', 'registered');
end $$;

-- Desvincula un dispositivo propio. Para evitar que se comparta la cuenta,
-- sólo se permite una vez cada 30 días (el administrador no tiene límite).
create or replace function public.unlink_device(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_prof  profiles;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_prof from profiles where id = v_uid;
  if not v_prof.is_admin and v_prof.last_unlink_at is not null
     and v_prof.last_unlink_at > now() - interval '30 days' then
    raise exception 'UNLINK_TOO_SOON';
  end if;
  delete from devices where id = p_id and user_id = v_uid;
  if not found then raise exception 'NOT_FOUND'; end if;
  update profiles set last_unlink_at = now() where id = v_uid;
end $$;

-- ¿La petición actual viene de un dispositivo registrado de este usuario?
-- La app envía la cabecera x-device-id en cada petición.
create or replace function public.current_device_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from devices
     where user_id = auth.uid()
       and device_id = coalesce(current_setting('request.headers', true)::json->>'x-device-id', '')
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

revoke all on function public.register_device(text, text) from public, anon;
revoke all on function public.unlink_device(uuid) from public, anon;
grant execute on function public.register_device(text, text) to authenticated;
grant execute on function public.unlink_device(uuid) to authenticated;
grant execute on function public.current_device_ok() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------- Contenido: himnarios e himnos ----------
create table if not exists public.hymnals (
  id          text primary key,
  name        text not null,
  description text,
  sort        int not null default 0
);

create table if not exists public.hymns (
  id          text primary key,
  hymnal_id   text not null references public.hymnals on delete cascade,
  number      int,
  title       text not null,
  chordpro    text not null,
  video_id    text,            -- vídeo de YouTube sugerido
  sync_times  real[],          -- segundo en que empieza cada acorde en ese vídeo
  updated_at  timestamptz not null default now()
);
create index if not exists hymns_hymnal_number on public.hymns (hymnal_id, number);

alter table public.hymnals enable row level security;
alter table public.hymns   enable row level security;

drop policy if exists "leer himnarios" on public.hymnals;
create policy "leer himnarios" on public.hymnals for select to authenticated using (public.current_device_ok());
drop policy if exists "admin himnarios" on public.hymnals;
create policy "admin himnarios" on public.hymnals for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "leer himnos" on public.hymns;
create policy "leer himnos" on public.hymns for select to authenticated using (public.current_device_ok());
drop policy if exists "admin himnos" on public.hymns;
create policy "admin himnos" on public.hymns for all to authenticated using (public.is_admin()) with check (public.is_admin());
