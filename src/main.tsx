import { StrictMode } from 'react';
import { Capacitor } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { SettingsProvider } from './lib/settings';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </AuthProvider>
  </StrictMode>,
);

// En la app de Android, el botón «atrás» vuelve a la pantalla anterior en vez de cerrar la app.
if (Capacitor.isNativePlatform()) {
  import('@capacitor/app').then(({ App: NativeApp }) => {
    NativeApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void NativeApp.exitApp();
    });
  });
}

// App instalable y con uso sin conexión (PWA). En la app nativa no hace falta.
if ('serviceWorker' in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
