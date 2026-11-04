import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Accidentals, Notation } from '../music/theory';
import type { Instrument } from '../music/voicings';
import { load, save } from './storage';

export interface Settings {
  instrument: Instrument;
  notation: Notation;
  accidentals: Accidentals;
  fontSize: number;
  showDiagrams: boolean;
}

const DEFAULTS: Settings = {
  instrument: 'guitar',
  notation: 'american',
  accidentals: 'auto',
  fontSize: 18,
  showDiagrams: true,
};

const Ctx = createContext<{ settings: Settings; update: (p: Partial<Settings>) => void } | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULTS, ...load<Partial<Settings>>('settings', {}) }));
  const update = (p: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...p };
      save('settings', next);
      return next;
    });
  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings debe usarse dentro de <SettingsProvider>');
  return ctx;
}
