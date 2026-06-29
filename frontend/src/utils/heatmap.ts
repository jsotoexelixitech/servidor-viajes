import type { DemoViajeRaw } from '../demo';

// ─── Heatmap computation helpers ─────────────────────────────────────────────

export const HEATMAP_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const HEATMAP_HOURS = Array.from({ length: 24 }, (_, i) => i);

/** Builds a [dayOfWeek 0=Lun..6=Dom][hour 0..23] = count matrix. */
export function buildHeatmap(list: DemoViajeRaw[]): number[][] {
  const mat = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const v of list) {
    const d = new Date(v.creadoEn);
    const dow = (d.getDay() + 6) % 7; // JS: Sun=0 → Mon=0
    mat[dow][d.getHours()]++;
  }
  return mat;
}

export function heatColor(val: number, max: number): string {
  if (max === 0 || val === 0) return '#f1f5f9';
  const t = val / max;
  if (t < 0.2) return '#dbeafe';
  if (t < 0.4) return '#93c5fd';
  if (t < 0.6) return '#3b82f6';
  if (t < 0.8) return '#1d4ed8';
  return '#0f1a5a';
}
