export interface Hymnal {
  id: string;
  name: string;
  description?: string;
}

export interface Hymn {
  id: string;
  hymnalId: string;
  number: number | null;
  title: string;
  chordpro: string;
  /** Vídeo de YouTube sugerido por el administrador (opcional). */
  videoId?: string | null;
  /** Tiempos de cada acorde (en segundos) para ese vídeo, si el admin los sincronizó. */
  syncTimes?: number[] | null;
}

export interface Library {
  hymnals: Hymnal[];
  hymns: Hymn[];
  source: 'demo' | 'server' | 'cache';
}
