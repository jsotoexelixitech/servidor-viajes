// ─── App-level types ──────────────────────────────────────────────────────────

export type Tab =
  | 'dashboard' | 'setup' | 'mapeo' | 'viaje' | 'finalizar'
  | 'listar' | 'monitor' | 'conductores' | 'cartera' | 'flota';

export type ReqStatus = 'idle' | 'loading' | 'success' | 'error';

export interface Notif {
  id: string;
  tipo: 'success' | 'error' | 'info' | 'warning';
  titulo: string;
  mensaje: string;
  ts: Date;
}

// ─── Feed event (dashboard activity feed) ────────────────────────────────────
export type FeedEvent = {
  id: string;
  ts: Date;
  kind: 'started' | 'policy' | 'finished' | 'error';
  conductor: string;
  placa: string;
  monto?: number;
};
