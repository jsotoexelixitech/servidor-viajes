// ─── Number / text formatters ─────────────────────────────────────────────────

export const fmtBs = (n: number): string =>
  new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export const fmtInt = (n: number): string =>
  new Intl.NumberFormat('es-VE').format(n);

export function relTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const s = Math.round(ms / 1000);
  if (s < 5) return 'unos segundos';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const dd = Math.floor(h / 24);
  return `${dd} d`;
}

export function iniciales(nombre: string): string {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
}
