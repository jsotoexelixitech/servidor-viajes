import type { Tab } from '../types';

// ─── Badge maps ───────────────────────────────────────────────────────────────
export const POLIZA_BADGE: Record<string, string> = {
  ACTIVA:     'badge badge-green',
  EMITIENDO:  'badge badge-yellow',
  ERROR:      'badge badge-red',
  CRITICO:    'badge bg-red-600 text-white ring-0 animate-pulse',
  FINALIZADA: 'badge badge-gray',
};

export const TIPO_BADGE: Record<string, string> = {
  texto:   'badge badge-blue',
  numero:  'badge badge-purple',
  fecha:   'badge badge-yellow',
  interno: 'badge badge-gray',
};

export const GRUPO_META = {
  vehiculo: { label: 'Vehículo', icon: '🚗', color: 'bg-blue-500' },
  tomador:  { label: 'Tomador',  icon: '👤', color: 'bg-purple-500' },
  interno:  { label: 'Sistema',  icon: '⚙️', color: 'bg-slate-400' },
} as const;

// ─── Navigation (requires icons — defined in App.tsx alongside Ic) ───────────
export const NAV_REQUIRES_KEY = new Set<Tab>([
  'mapeo', 'viaje', 'finalizar', 'listar', 'monitor', 'conductores', 'flota',
]);
