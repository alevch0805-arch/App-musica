import { useAuth } from '../lib/auth';
import { useSettings } from '../lib/settings';
import { isDemo } from '../lib/supabase';
import type { Accidentals, Notation } from '../music/theory';
import type { Instrument } from '../music/voicings';
import { Devices } from './Devices';

export function SettingsPage() {
  const { settings, update } = useSettings();
  const { session, signOut, profile } = useAuth();
  return (
    <div className="settings">
      <div className="card">
        <h1>Ajustes</h1>
        <label>Instrumento
          <select value={settings.instrument} onChange={(e) => update({ instrument: e.target.value as Instrument })}>
            <option value="guitar">Guitarra</option>
            <option value="ukulele">Ukelele</option>
            <option value="piano">Piano / teclado</option>
            <option value="none">Ninguno (sólo nombres de acordes)</option>
          </select>
        </label>
        <label>Notación
          <select value={settings.notation} onChange={(e) => update({ notation: e.target.value as Notation })}>
            <option value="american">Americana (C D E F G A B)</option>
            <option value="latin">Latina (Do Re Mi Fa Sol La Si)</option>
          </select>
        </label>
        <label>Alteraciones
          <select value={settings.accidentals} onChange={(e) => update({ accidentals: e.target.value as Accidentals })}>
            <option value="auto">Automático según el tono</option>
            <option value="sharp">Siempre sostenidos (#)</option>
            <option value="flat">Siempre bemoles (b)</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.showDiagrams} onChange={(e) => update({ showDiagrams: e.target.checked })} />
          Mostrar diagramas de acordes
        </label>
        <label>Tamaño de letra: {settings.fontSize}px
          <input type="range" min={12} max={40} value={settings.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} />
        </label>
      </div>

      {isDemo ? (
        <div className="card"><p>Modo demo: sin cuentas ni límite de dispositivos. Configura Supabase en <code>.env</code> para activarlos.</p></div>
      ) : (
        <>
          <div className="card">
            <h2>Cuenta</h2>
            <p>{profile?.display_name ? <><b>{profile.display_name}</b> · </> : null}{session?.user.email}</p>
            {profile?.is_admin && <p className="chip">Administrador</p>}
            <button onClick={signOut}>Cerrar sesión</button>
          </div>
          <Devices />
        </>
      )}
    </div>
  );
}
