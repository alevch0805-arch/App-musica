import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/auth';

type Mode = 'login' | 'signup' | 'reset';

export function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { invite_code: invite.trim(), display_name: name.trim() } },
        });
        if (error) throw error;
        if (!data.session) setMessage({ text: 'Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.', error: false });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        setMessage({ text: 'Te enviamos un correo para cambiar la contraseña.', error: false });
      }
    } catch (err) {
      setMessage({ text: friendlyError((err as Error).message), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="logo">♪</div>
        <h1>Himnos y acordes</h1>
        <div className="tabs">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Entrar</button>
          <button className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>Registrarme</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <>
              <label>Código de invitación<input value={invite} onChange={(e) => setInvite(e.target.value)} required autoComplete="off" /></label>
              <label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
            </>
          )}
          <label>Correo<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
          {mode !== 'reset' && (
            <label>
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </label>
          )}
          {message && <p className={message.error ? 'error' : 'ok'}>{message.text}</p>}
          <button className="primary" disabled={busy}>
            {mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar correo'}
          </button>
        </form>
        {mode === 'login' && <button className="link" onClick={() => setMode('reset')}>¿Olvidaste tu contraseña?</button>}
        {mode === 'reset' && <button className="link" onClick={() => setMode('login')}>Volver</button>}
        <p className="hint">El acceso es sólo por invitación. Cada cuenta puede usarse en 2 dispositivos.</p>
      </div>
    </div>
  );
}
