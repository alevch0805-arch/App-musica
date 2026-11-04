-- Pruebas de las reglas de acceso. Se ejecutan con:  supabase/tests/run.sh
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

create or replace function pg_temp.expect_error(sql text, expected text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'Se esperaba el error % y no hubo error: %', expected, sql;
exception when others then
  if sqlerrm not like '%' || expected || '%' then raise; end if;
end $$;

create or replace function pg_temp.as_user(uid uuid, device text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  perform set_config('request.headers', json_build_object('x-device-id', device)::text, false);
end $$;

-- Datos
insert into invite_codes (code, max_uses) values ('UNO', 1), ('DOS', 2);
insert into invite_codes (code, expires_at) values ('VIEJO', now() - interval '1 day');
insert into hymnals (id, name) values ('h', 'Himnario');
insert into hymns (id, hymnal_id, title, chordpro) values ('h-1', 'h', 'Santo', '[D]Santo');

-- Registro con invitación
select pg_temp.expect_error($$insert into auth.users (email) values ('x@x.com')$$, 'INVITE_INVALID');
select pg_temp.expect_error($$insert into auth.users (email, raw_user_meta_data) values ('x@x.com', '{"invite_code":"NOEXISTE"}')$$, 'INVITE_INVALID');
select pg_temp.expect_error($$insert into auth.users (email, raw_user_meta_data) values ('x@x.com', '{"invite_code":"VIEJO"}')$$, 'INVITE_INVALID');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@x.com', '{"invite_code":"UNO"}'),
  ('00000000-0000-0000-0000-00000000000b', 'ana@x.com', '{"invite_code":"DOS","display_name":"Ana"}');
select pg_temp.expect_error($$insert into auth.users (email, raw_user_meta_data) values ('y@x.com', '{"invite_code":"UNO"}')$$, 'INVITE_INVALID');
update profiles set is_admin = true where email = 'admin@x.com';
do $$ begin assert (select display_name from profiles where email = 'ana@x.com') = 'Ana'; end $$;

set role authenticated;

-- Ana: dos dispositivos sí, el tercero no
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'movil-ana-1');
do $$ begin assert (select count(*) from hymns) = 0, 'sin dispositivo registrado no ve himnos'; end $$;
select register_device('movil-ana-1', 'Android');
do $$ begin assert (select count(*) from hymns) = 1, 'con dispositivo registrado ve himnos'; end $$;
select register_device('movil-ana-1', 'Android'); -- repetir no suma
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'tablet-ana-2');
select register_device('tablet-ana-2', 'iPad');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'portatil-ana-3');
select pg_temp.expect_error($$select register_device('portatil-ana-3', 'Windows')$$, 'DEVICE_LIMIT');
do $$ begin assert (select count(*) from hymns) = 0, 'un tercer dispositivo no ve himnos'; end $$;

-- Ana no puede ver datos de otros, ni invitaciones, ni hacerse admin
do $$ begin assert (select count(*) from profiles) = 1; end $$;
do $$ begin assert (select count(*) from invite_codes) = 0; end $$;
update profiles set is_admin = true, max_devices = 10 where email = 'ana@x.com';
do $$ begin assert not (select is_admin from profiles where email = 'ana@x.com'); end $$;
select pg_temp.expect_error($$insert into invite_codes (code) values ('HACK')$$, 'row-level security');

-- Desvincular: una vez cada 30 días
select unlink_device((select id from devices where device_id = 'tablet-ana-2'));
select register_device('portatil-ana-3', 'Windows');
select pg_temp.expect_error($$select unlink_device((select id from devices where device_id = 'movil-ana-1'))$$, 'UNLINK_TOO_SOON');

-- Administrador
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'pc-admin-1');
select register_device('pc-admin-1', 'Mac');
do $$ begin assert (select count(*) from profiles) = 2, 'admin ve todos los perfiles'; end $$;
do $$ begin assert (select count(*) from devices) = 3, 'admin ve todos los dispositivos'; end $$;
insert into invite_codes (code, note) values ('NUEVO-123', 'Para Luis');
do $$ begin assert (select count(*) from invite_codes) = 4; end $$;
delete from invite_codes where code = 'VIEJO';
update profiles set max_devices = 3 where email = 'ana@x.com';
delete from devices where user_id = '00000000-0000-0000-0000-00000000000b' and device_id = 'movil-ana-1';
select pg_temp.expect_error($$update profiles set is_admin = false where email = 'admin@x.com'$$, 'CANNOT_DEMOTE_SELF');

-- Bloquear a Ana: pierde el acceso
update profiles set blocked = true where email = 'ana@x.com';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'portatil-ana-3');
do $$ begin assert (select count(*) from hymns) = 0, 'bloqueada no ve himnos'; end $$;
select pg_temp.expect_error($$select register_device('portatil-ana-3', 'Windows')$$, 'BLOCKED');

-- Listas compartidas
reset role;
update profiles set blocked = false where email = 'ana@x.com';
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000000c', 'luis@x.com', '{"invite_code":"NUEVO-123"}');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'portatil-ana-3');
select register_device('portatil-ana-3', 'Windows');
insert into setlists (id, name, items) values ('ana-privada', 'Ensayo', '[{"hymnId":"h-1","transpose":2}]');
insert into setlists (id, name, shared) values ('ana-domingo', 'Domingo', true);
select pg_temp.expect_error($$insert into setlists (id, owner_id, name) values ('falsa', '00000000-0000-0000-0000-00000000000c', 'X')$$, 'row-level security');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'movil-luis-1');
do $$ begin assert (select count(*) from setlists) = 0, 'sin dispositivo no ve listas'; end $$;
select register_device('movil-luis-1', 'Android');
do $$ begin assert (select array_agg(id) from setlists) = array['ana-domingo'], 'Luis sólo ve la compartida'; end $$;
update setlists set name = 'Hackeada' where id = 'ana-domingo';
delete from setlists where id = 'ana-domingo';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'portatil-ana-3');
do $$ begin assert (select name from setlists where id = 'ana-domingo') = 'Domingo', 'Luis no puede editar ni borrar'; end $$;
update setlists set owner_id = '00000000-0000-0000-0000-00000000000c', name = 'Domingo 2' where id = 'ana-domingo';
do $$ begin assert (select owner_id from setlists where id = 'ana-domingo') = '00000000-0000-0000-0000-00000000000b', 'el dueño no cambia'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'pc-admin-1');
update setlists set name = 'Domingo (admin)' where id = 'ana-domingo';
do $$ begin assert (select name from setlists where id = 'ana-domingo') = 'Domingo (admin)', 'admin edita compartidas'; end $$;
update setlists set name = 'X' where id = 'ana-privada';
do $$ begin assert (select name from setlists where id = 'ana-privada') = 'Ensayo', 'admin no edita privadas'; end $$;

reset role;
\o
\echo 'OK: todas las pruebas de base de datos pasaron'
