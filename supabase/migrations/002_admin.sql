-- =====================================================================
--  Panel de administrador: invitaciones, usuarios, bloqueo y dispositivos
--  Ejecútalo después de 001_inicial.sql.
-- =====================================================================

alter table public.profiles add column if not exists blocked boolean not null default false;

-- El administrador ve y gestiona perfiles, dispositivos e invitaciones.
drop policy if exists "admin lee perfiles" on public.profiles;
create policy "admin lee perfiles" on public.profiles for select to authenticated using (public.is_admin());
drop policy if exists "admin edita perfiles" on public.profiles;
create policy "admin edita perfiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin lee dispositivos" on public.devices;
create policy "admin lee dispositivos" on public.devices for select to authenticated using (public.is_admin());
drop policy if exists "admin borra dispositivos" on public.devices;
create policy "admin borra dispositivos" on public.devices for delete to authenticated using (public.is_admin());

drop policy if exists "admin invitaciones" on public.invite_codes;
create policy "admin invitaciones" on public.invite_codes for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Un administrador no puede quitarse a sí mismo el permiso de admin ni bloquearse
-- (para no quedarse fuera por error).
create or replace function public.protect_own_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id = auth.uid() and old.is_admin and (not new.is_admin or new.blocked) then
    raise exception 'CANNOT_DEMOTE_SELF';
  end if;
  return new;
end $$;
drop trigger if exists protect_own_admin on public.profiles;
create trigger protect_own_admin before update on public.profiles
  for each row execute function public.protect_own_admin();

-- Usuarios bloqueados: no pueden registrar dispositivos ni leer himnos.
create or replace function public.register_device(p_device_id text, p_name text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_prof  profiles;
  v_count int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(length(p_device_id), 0) < 8 then raise exception 'BAD_DEVICE'; end if;

  select * into v_prof from profiles where id = v_uid;
  if v_prof.blocked then raise exception 'BLOCKED'; end if;

  update devices set last_seen = now(), name = coalesce(p_name, name)
   where user_id = v_uid and device_id = p_device_id;
  if found then return json_build_object('status', 'ok'); end if;

  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  select count(*) into v_count from devices where user_id = v_uid;
  if v_count >= coalesce(v_prof.max_devices, 2) then
    raise exception 'DEVICE_LIMIT';
  end if;

  insert into devices (user_id, device_id, name) values (v_uid, p_device_id, p_name)
  on conflict (user_id, device_id) do update set last_seen = now();
  return json_build_object('status', 'registered');
end $$;

create or replace function public.current_device_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from devices d
      join profiles p on p.id = d.user_id
     where d.user_id = auth.uid()
       and not p.blocked
       and d.device_id = coalesce(current_setting('request.headers', true)::json->>'x-device-id', '')
  );
$$;
