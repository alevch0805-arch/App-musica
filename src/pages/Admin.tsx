import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError, useAuth } from '../lib/auth';
import {
  appUrl, generateInviteCode, inviteMessage, inviteStatus, relativeDay, STATUS_LABEL,
  type AdminDevice, type AdminProfile, type InviteCode,
} from '../lib/admin';

type Tab = 'invites' | 'users';

async function shareText(title: string, text: string) {
  try {
    if (navigator.share) await navigator.share({ title, text });
    else { await navigator.clipboard.writeText(text); alert('Copiado. Ya puedes pegarlo en WhatsApp o en un correo.'); }
  } catch { /* cancelado */ }
}

export function Admin() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('invites');
  if (!supabase) return <div className="card">El panel de administrador necesita Supabase configurado (ahora estás en modo demo).</div>;
  if (!profile?.is_admin) return <div className="card">Sólo los administradores pueden ver esta página.</div>;
  return (
    <div className="admin">
      <h1>Administración</h1>
      <div className="tabs">
        <button className={tab === 'invites' ? 'on' : ''} onClick={() => setTab('invites')}>Invitaciones</button>
        <button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Usuarios</button>
      </div>
      {tab === 'invites' ? <Invites /> : <Users />}
    </div>
  );
}

function Invites() {
  const [codes, setCodes] = useState<InviteCode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [maxUses, setMaxUses] = useState(1);
  const [days, setDays] = useState(30);
  const [created, setCreated] = useState<InviteCode | null>(null);
  const [filter, setFilter] = useState<'active' | 'all'>('active');

  const refresh = useCallback(async () => {
    const { data, error } = await supabase!.from('invite_codes').select('*').order('created_at', { ascending: false });
    if (error) setError(friendlyError(error.message));
    else setCodes(data as InviteCode[]);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const row = {
      code: generateInviteCode(),
      note: note.trim() || null,
      max_uses: maxUses,
      expires_at: days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null,
    };
    const { data, error } = await supabase!.from('invite_codes').insert(row).select().single();
    if (error) { setError(friendlyError(error.message)); return; }
    setCreated(data as InviteCode);
    setNote('');
    refresh();
  };

  const remove = async (c: InviteCode) => {
    if (!confirm(`¿Borrar la invitación ${c.code}? Quien la tenga ya no podrá registrarse.`)) return;
    const { error } = await supabase!.from('invite_codes').delete().eq('code', c.code);
    if (error) setError(friendlyError(error.message));
    refresh();
  };

  const visible = (codes ?? []).filter((c) => filter === 'all' || inviteStatus(c) === 'active');

  return (
    <>
      <form className="card invite-form" onSubmit={create}>
        <h2>Nueva invitación</h2>
        <label>Para quién (opcional)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="p. ej. Luis Pérez" /></label>
        <div className="row">
          <label>Usos
            <select value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))}>
              {[1, 2, 5, 10, 25].map((n) => <option key={n} value={n}>{n === 1 ? '1 persona' : `${n} personas`}</option>)}
            </select>
          </label>
          <label>Caduca
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>en 7 días</option>
              <option value={30}>en 30 días</option>
              <option value={90}>en 3 meses</option>
              <option value={0}>nunca</option>
            </select>
          </label>
        </div>
        <button className="primary">Crear invitación</button>
        {created && (
          <div className="created">
            <p>Invitación creada:</p>
            <p className="code-big">{created.code}</p>
            <div className="row">
              <button type="button" className="primary" onClick={() => shareText('Invitación', inviteMessage(created.code, appUrl(), created.note))}>Enviar invitación</button>
              <button type="button" onClick={() => setCreated(null)}>Cerrar</button>
            </div>
          </div>
        )}
      </form>

      {error && <p className="error">{error}</p>}

      <div className="card">
        <div className="row between">
          <h2>Invitaciones</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value as 'active' | 'all')} aria-label="Filtro">
            <option value="active">Sólo activas</option>
            <option value="all">Todas</option>
          </select>
        </div>
        {!codes ? <p>Cargando…</p> : (
          <ul className="admin-list">
            {visible.map((c) => {
              const st = inviteStatus(c);
              return (
                <li key={c.code}>
                  <div className="grow">
                    <span className="mono strong">{c.code}</span> <span className={`status ${st}`}>{STATUS_LABEL[st]}</span>
                    <small>
                      {c.note ? `${c.note} · ` : ''}{c.uses}/{c.max_uses} usos
                      {c.expires_at ? ` · caduca ${new Date(c.expires_at).toLocaleDateString('es')}` : ''}
                    </small>
                  </div>
                  {st === 'active' && <button onClick={() => shareText('Invitación', inviteMessage(c.code, appUrl(), c.note))}>Enviar</button>}
                  <button className="danger" onClick={() => remove(c)} aria-label={`Borrar ${c.code}`}>✕</button>
                </li>
              );
            })}
            {!visible.length && <li className="muted">No hay invitaciones {filter === 'active' ? 'activas' : ''}.</li>}
          </ul>
        )}
      </div>
    </>
  );
}

function Users() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState<AdminProfile[] | null>(null);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [u, d] = await Promise.all([
      supabase!.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase!.from('devices').select('*').order('last_seen', { ascending: false }),
    ]);
    if (u.error || d.error) { setError(friendlyError((u.error ?? d.error)!.message)); return; }
    setUsers(u.data as AdminProfile[]);
    setDevices(d.data as AdminDevice[]);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const byUser = useMemo(() => {
    const m = new Map<string, AdminDevice[]>();
    for (const d of devices) m.set(d.user_id, [...(m.get(d.user_id) ?? []), d]);
    return m;
  }, [devices]);

  const update = async (u: AdminProfile, change: Partial<AdminProfile>) => {
    const { error } = await supabase!.from('profiles').update(change).eq('id', u.id);
    if (error) setError(friendlyError(error.message));
    else { setError(null); refresh(); }
  };

  const removeDevices = async (ids: string[], what: string) => {
    if (!confirm(`¿Quitar ${what}? La persona tendrá que volver a entrar en ese dispositivo.`)) return;
    const { error } = await supabase!.from('devices').delete().in('id', ids);
    if (error) setError(friendlyError(error.message));
    refresh();
  };

  const q = query.trim().toLowerCase();
  const list = (users ?? []).filter((u) => !q || `${u.email} ${u.display_name ?? ''}`.toLowerCase().includes(q));
  const total = users?.length ?? 0;
  const activeWeek = (users ?? []).filter((u) => (byUser.get(u.id) ?? []).some((d) => Date.now() - new Date(d.last_seen).getTime() < 7 * 86400000)).length;

  return (
    <>
      <div className="stats">
        <div className="stat"><b>{total}</b><span>usuarios</span></div>
        <div className="stat"><b>{activeWeek}</b><span>activos esta semana</span></div>
        <div className="stat"><b>{devices.length}</b><span>dispositivos</span></div>
      </div>
      {error && <p className="error">{error}</p>}
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o correo…" />
      {!users ? <p>Cargando…</p> : (
        <ul className="users">
          {list.map((u) => {
            const ds = byUser.get(u.id) ?? [];
            const last = ds[0]?.last_seen;
            const isMe = u.id === me?.id;
            return (
              <li key={u.id} className={'user card' + (u.blocked ? ' blocked' : '')}>
                <div className="row between">
                  <div className="grow">
                    <b>{u.display_name || u.email}</b>
                    {u.is_admin && <span className="chip">admin</span>}
                    {u.blocked && <span className="status expired">Bloqueado</span>}
                    <small>{u.display_name ? `${u.email} · ` : ''}alta {relativeDay(u.created_at)}{last ? ` · último uso ${relativeDay(last)}` : ' · sin uso'}</small>
                  </div>
                  <button className="ghost" onClick={() => setOpen(open === u.id ? null : u.id)}>
                    {ds.length}/{u.max_devices} dispositivos {open === u.id ? '▲' : '▼'}
                  </button>
                </div>
                {open === u.id && (
                  <div className="user-detail">
                    <ul className="devices">
                      {ds.map((d) => (
                        <li key={d.id}>
                          <div><b>{d.name ?? 'Dispositivo'}</b><small>alta {relativeDay(d.created_at)} · último uso {relativeDay(d.last_seen)}</small></div>
                          <button className="danger" onClick={() => removeDevices([d.id], `«${d.name ?? 'este dispositivo'}»`)}>Quitar</button>
                        </li>
                      ))}
                      {!ds.length && <li className="muted">Sin dispositivos.</li>}
                    </ul>
                    <div className="row">
                      <div className="tool">
                        <span>Máximo</span>
                        <button onClick={() => update(u, { max_devices: Math.max(1, u.max_devices - 1) })} aria-label="Menos dispositivos">−</button>
                        <span className="mono val">{u.max_devices}</span>
                        <button onClick={() => update(u, { max_devices: Math.min(10, u.max_devices + 1) })} aria-label="Más dispositivos">+</button>
                      </div>
                      {ds.length > 0 && <button onClick={() => removeDevices(ds.map((d) => d.id), 'todos sus dispositivos')}>Quitar todos</button>}
                      {!isMe && (
                        <>
                          <button className={u.blocked ? '' : 'danger'} onClick={() => update(u, { blocked: !u.blocked })}>
                            {u.blocked ? 'Desbloquear' : 'Bloquear'}
                          </button>
                          <button onClick={() => { if (u.is_admin || confirm(`¿Hacer administrador a ${u.email}?`)) update(u, { is_admin: !u.is_admin }); }}>
                            {u.is_admin ? 'Quitar admin' : 'Hacer admin'}
                          </button>
                        </>
                      )}
                    </div>
                    {u.invite_code && <small className="muted">Entró con la invitación {u.invite_code}</small>}
                  </div>
                )}
              </li>
            );
          })}
          {!list.length && <li className="muted">No hay usuarios.</li>}
        </ul>
      )}
    </>
  );
}
