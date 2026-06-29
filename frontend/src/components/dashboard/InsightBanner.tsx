import React from 'react';
import type { DashboardKpis, RankingConductor, RangoTemporal } from '../../api';
import { Ic } from '../ui/Icons';
import { fmtBs, fmtInt } from '../../utils/formatters';

const RANGO_LABEL: Record<RangoTemporal, string> = {
  hoy: 'hoy', '7d': 'esta semana', '30d': 'estos 30 días', mes: 'este mes', todo: 'en total',
};

export function InsightBanner({
  kpis, topPrima, rango, onViewDetail,
}: {
  kpis: DashboardKpis;
  topPrima: RankingConductor[];
  rango: RangoTemporal;
  onViewDetail: () => void;
}) {
  const top = topPrima[0];
  if (!kpis.totalViajes && !kpis.primaTotal) return null;

  const parts: React.ReactNode[] = [];
  if (kpis.totalViajes > 0) {
    parts.push(
      <span key="v">
        Se registraron{' '}
        <strong className="text-slate-900">{fmtInt(kpis.totalViajes)} viaje{kpis.totalViajes !== 1 ? 's' : ''}</strong>
        {' '}{RANGO_LABEL[rango]}
      </span>,
    );
  }
  if (kpis.primaTotal > 0) {
    parts.push(<span key="p">prima acumulada <strong className="text-brand-700">Bs {fmtBs(kpis.primaTotal)}</strong></span>);
  }
  if (kpis.comisionTotal > 0) {
    parts.push(<span key="c">comisiones <strong className="text-emerald-700">Bs {fmtBs(kpis.comisionTotal)}</strong></span>);
  }

  return (
    <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 via-white to-orange-50 px-4 py-3.5 mb-5 flex items-start gap-3 shadow-[0_2px_8px_-2px_rgb(251_191_36/0.18)]">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
        {Ic.sparkle('w-4 h-4 text-white')}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-700 mb-0.5">
          Resumen · {RANGO_LABEL[rango]}
        </p>
        <p className="text-sm text-slate-700 leading-snug">
          {parts.reduce<React.ReactNode[]>((acc, el, i) => {
            if (i === 0) return [el];
            if (i === parts.length - 1) return [...acc, <span key={`sep${i}`} className="text-slate-400"> · </span>, el];
            return [...acc, <span key={`sep${i}`} className="text-slate-400">, </span>, el];
          }, [])}
          {top && (
            <span className="ml-1 text-slate-500">
              · Top: <strong className="text-slate-800">{top.nombre}</strong>
              {' '}
              <span className="text-[11px] font-mono text-brand-600">(Bs {fmtBs(top.primaGenerada)})</span>
            </span>
          )}
          .
        </p>
      </div>
      <button onClick={onViewDetail}
        className="shrink-0 text-[10.5px] font-bold text-amber-700 hover:text-amber-900 bg-amber-100/60 hover:bg-amber-100 border border-amber-200 rounded-lg px-2.5 py-1.5 transition-colors flex items-center gap-1">
        Ver detalle {Ic.arrow('w-3 h-3')}
      </button>
    </div>
  );
}
