import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { isDemo } from './lib/supabase';
import { Library } from './pages/Library';
import { HymnPage } from './pages/HymnPage';
import { Editor } from './pages/Editor';
import { Login } from './pages/Login';
import { Devices } from './pages/Devices';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  const { status, error, signOut } = useAuth();

  if (status === 'loading') return <p className="center">Cargando…</p>;
  if (status === 'signedOut') return <Login />;
  if (status === 'deviceLimit') return <Devices limitReached />;
  if (status === 'error') {
    return (
      <div className="center">
        <p className="error">{error}</p>
        <button onClick={signOut}>Cerrar sesión</button>
      </div>
    );
  }

  return (
    <HashRouter>
      <nav className="topbar">
        <NavLink to="/" end className="brand">♪ Himnos</NavLink>
        {isDemo && <span className="chip demo" title="Sin servidor: no hay registro ni límite de dispositivos">modo demo</span>}
        <span className="spacer" />
        <NavLink to="/ajustes">Ajustes</NavLink>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/himno/:id" element={<HymnPage />} />
          <Route path="/nuevo" element={<Editor />} />
          <Route path="/editar/:id" element={<Editor />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="*" element={<Library />} />
        </Routes>
      </main>
    </HashRouter>
  );
}
