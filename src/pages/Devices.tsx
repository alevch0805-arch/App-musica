import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError, useAuth } from '../lib/auth';
import { getDeviceId } from '../lib/device';

interface Device {
  id: string;
  device_id: string;
  name: string | null;
  created_at: string;
  last_seen: string;
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });

/** Lista los dispositivos de la cuenta y permite desvincular uno. */
export function Devices({ limitReached = false }: { limitReached?: boolean }) {
  const { retryDevice, signOut, profile } = useAuth();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const me = getDeviceId();

  const refresh = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('devices').select('*').order('last_seen', { ascending: false });
    if (error) setError(friendlyError(error.message));
    else setDevices(data as Device[]);
  };
  useEffect(() => { refresh(); }, []);

  const unlink = async (d: Device) => {
    if (!supabase) return;
    if (!confirm(`¿Desvincular «${d.name ?? 'dispositivo'}»? Sólo se puede hacer una vez cada 30 días.`)) return;
    const { error } = await supabase.rpc('unlink_device', { p_id: d.id });
    if (error) { setError(friendlyError(error.message)); return; }
    await refresh();
    if (limitReached) await retryDevice();
  };

  return (
    <div className={limitReached ? 'auth' : ''}>
      <div className={limitReached ? 'auth-card wide' : 'card'}>
        <h1>Mis dispositivos</h1>
        {limitReached && (
          <p className="error">
            Tu cuenta ya está activa en {profile?.max_devices ?? 2} dispositivos. Para usarla aquí, desvincula uno de ellos.
          </p>
        )}
        {error && <p className="error">{error}</p>}
        {!devices ? <p>Cargando…</p> : (
          <ul className="devices">
            {devices.map((d) => (
              <li key={d.id}>
                <div>
                  <b>{d.name ?? 'Dispositivo'}</b> {d.device_id === me && <span className="chip">este</span>}
                  <small>Alta: {fmtDate(d.created_at)} · Último uso: {fmtDate(d.last_seen)}</small>
                </div>
                {d.device_id !== me && <button className="danger" onClick={() => unlink(d)}>Desvincular</button>}
              </li>
            ))}
            {!devices.length && <li>No hay dispositivos.</li>}
          </ul>
        )}
        {limitReached && <button onClick={signOut}>Cerrar sesión</button>}
      </div>
    </div>
  );
}
