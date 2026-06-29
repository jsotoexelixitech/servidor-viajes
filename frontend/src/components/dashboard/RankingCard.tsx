import React from 'react';
import type { RankingConductor } from '../../api';
import { Spinner } from '../ui/Spinner';
import { HelpHint } from '../ui/HelpHint';
import { fmtBs, fmtInt } from '../../utils/formatters';

const RANKING_PALETTE: Record<'viajes' | 'prima' | 'comision', { gradient: string; bar: string; soft: string }> = {
  viajes:   { gradient: 'bg-gradient-to-br from-amber-500 to-orange-600',  bar: 'linear-gradient(90deg, #f59e0b, #ea580c)', soft: 'bg-amber-50' },
  prima:    { gradient: 'bg-gradient-to-br from-brand-700 to-brand-500',   bar: 'linear-gradient(90deg, #2e6dbf, #0f1a5a)', soft: 'bg-blue-50' },
  comision: { gradient: 'bg-gradient-to-br from-rose-500 to-red-600',      bar: 'linear-gradient(90deg, #f43f5e, #dc2626)', soft: 'bg-rose-50' },
};

const MEDAL_STYLES = [
  'bg-gradient-to-br from-yellow-300 to-amber-500 text-amber-900 ring-1 ring-amber-300 shadow-sm',
  'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800 ring-1 ring-slate-300 shadow-sm',
  'bg-gradient-to-br from-orange-300 to-amber-700 text-white ring-1 ring-orange-300 shadow-sm',
];

function MedalIcon() {
  return (
    <svg viewBox="0 0 12 12" className="w-3 h-3" fill="currentColor" aria-hidden>
      <circle cx="6" cy="7.5" r="3.5" />
      <path d="M3 1h2l1.2 2.6L4.7 5.5 3 1zm6 0H7L5.8 3.6 7.3 5.5 9 1z" opacity=".75" />
    </svg>
  );
}

export function RankingCard({
  titulo, icon, gradient, metricaLabel, data, metrica, loading,
}: {
  titulo: string;
  icon: React.ReactNode;
  gradient?: string;
  metricaLabel: string;
  data: RankingConductor[];
  metrica: 'viajes' | 'prima' | 'comision';
  loading: boolean;
}) {
  const palette = RANKING_PALETTE[metrica];
  const headerGradient = gradient ?? palette.gradient;
  const valor = (c: RankingConductor) =>
    metrica === 'viajes' ? fmtInt(c.totalViajes)
    : metrica === 'prima' ? fmtBs(c.primaGenerada)
    : fmtBs(c.comisionGenerada);
  const max = Math.max(
    1,
    ...data.map(c => metrica === 'viajes' ? c.totalViajes : metrica === 'prima' ? c.primaGenerada : c.comisionGenerada),
  );
  const hint =
    metrica === 'prima'    ? 'Suma de prima emitida por cada conductor (todos los planes RCV).'
    : metrica === 'comision' ? 'Comisión = prima × % del conductor. Mide el aporte económico real.'
    : 'Cantidad de viajes que cada conductor ha realizado.';

  return (
    <div className="card p-4 sm:p-5 flex flex-col group hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <p className="section-title text-[11px] flex items-center gap-1.5">
          <span>{titulo}</span>
          <HelpHint text={hint} />
        </p>
        <div className={`w-8 h-8 rounded-lg ${headerGradient} flex items-center justify-center shrink-0 shadow-sm`}>
          {icon}
        </div>
      </div>
      {loading && data.length === 0 && (
        <div className="py-6 flex items-center justify-center text-slate-500"><Spinner /></div>
      )}
      {!loading && data.length === 0 && (
        <p className="text-xs text-slate-600 py-6 text-center">Aún no hay datos</p>
      )}
      <div className="space-y-2.5">
        {data.map((c, i) => {
          const val = metrica === 'viajes' ? c.totalViajes : metrica === 'prima' ? c.primaGenerada : c.comisionGenerada;
          const pct = (val / max) * 100;
          const medal = i < 3 ? MEDAL_STYLES[i] : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
          const isTop = i === 0;
          return (
            <div key={(c.conductorId ?? '') + i}
              className={`rounded-lg -mx-1 px-1 py-0.5 ${isTop ? palette.soft : ''} transition-colors`}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`w-5 h-5 rounded-md text-[10px] font-extrabold flex items-center justify-center shrink-0 ${medal}`}
                    title={i === 0 ? 'Oro' : i === 1 ? 'Plata' : i === 2 ? 'Bronce' : `Posición ${i + 1}`}>
                    {i < 3 ? <MedalIcon /> : i + 1}
                  </span>
                  <span className={`text-xs ${isTop ? 'font-extrabold text-slate-900' : 'font-bold text-slate-800'} truncate`}>
                    {c.nombre}
                  </span>
                </div>
                <span className={`text-[11px] font-extrabold tabular-nums shrink-0 ${isTop ? 'text-slate-900' : 'text-slate-700'}`}>
                  {valor(c)}
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: palette.bar }} />
              </div>
            </div>
          );
        })}
      </div>
      {data.length > 0 && (
        <p className="text-[10px] text-slate-500 mt-3 text-right uppercase tracking-wide font-bold">{metricaLabel}</p>
      )}
    </div>
  );
}
