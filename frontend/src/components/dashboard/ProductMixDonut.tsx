import React from 'react';
import type { DashboardKpis, RangoTemporal } from '../../api';
import { getDemoViajes } from '../../demo';

type DonutSlice = { label: string; value: number; color: string };

function DonutSVG({ slices }: { slices: DonutSlice[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return <circle cx="50" cy="50" r="36" fill="none" stroke="#e2e8f0" strokeWidth="12" />;
  }

  let offset = 0;
  const C = 2 * Math.PI * 36;
  return (
    <>
      {slices.map(sl => {
        const dash = (sl.value / total) * C;
        const gap = C - dash;
        const rot = (offset / total) * 360 - 90;
        offset += sl.value;
        return (
          <circle key={sl.label}
            cx="50" cy="50" r="36"
            fill="none"
            stroke={sl.color}
            strokeWidth="13"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={0}
            style={{ transformOrigin: '50px 50px', transform: `rotate(${rot}deg)` }}
            className="donut-arc"
          />
        );
      })}
    </>
  );
}

export function ProductMixDonut({
  rango, kpis,
}: {
  rango: RangoTemporal;
  kpis?: DashboardKpis | null;
}) {
  const demo = getDemoViajes(rango);
  let slices: DonutSlice[] = [];

  if (demo.length > 0) {
    const counts: Record<string, number> = {};
    for (const v of demo) { const p = v.planPoliza ?? 'OTRO'; counts[p] = (counts[p] ?? 0) + 1; }
    const colors: Record<string, string> = { RCVBAS: '#2e6dbf', RUSPAT: '#e84f51', OTRO: '#94a3b8' };
    slices = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([label, value]) => ({ label, value, color: colors[label] ?? '#94a3b8' }));
  } else if (kpis) {
    const activas = kpis.polizasActivas;
    const resto = Math.max(0, kpis.totalViajes - activas);
    if (activas + resto > 0) {
      slices = [
        { label: 'Con póliza', value: activas, color: '#2e6dbf' },
        { label: 'Sin póliza', value: resto,   color: '#e2e8f0' },
      ];
    }
  }

  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <div className="card p-4 sm:p-5 flex flex-col">
      <p className="section-title text-[11px] mb-3">Mix de productos</p>
      {total === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">Sin datos</p>
      ) : (
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 100 100" className="w-20 h-20 shrink-0">
            <DonutSVG slices={slices} />
            <text x="50" y="54" textAnchor="middle"
              style={{ fontSize: 10, fontWeight: 800, fontFamily: 'Inter', fill: '#1e293b' }}>
              {total}
            </text>
          </svg>
          <div className="space-y-2 flex-1 min-w-0">
            {slices.map(sl => (
              <div key={sl.label} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: sl.color }} />
                <span className="text-xs font-bold text-slate-700 truncate flex-1">{sl.label}</span>
                <span className="text-[10px] font-extrabold text-slate-600 tabular-nums">
                  {Math.round((sl.value / total) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
