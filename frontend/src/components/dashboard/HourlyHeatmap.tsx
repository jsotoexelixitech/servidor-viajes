import React from 'react';
import type { RangoTemporal } from '../../api';
import { getDemoViajes } from '../../demo';
import { Ic } from '../ui/Icons';
import { buildHeatmap, heatColor, HEATMAP_DAYS, HEATMAP_HOURS } from '../../utils/heatmap';

export function HourlyHeatmap({ rango }: { rango: RangoTemporal }) {
  const demo = getDemoViajes(rango);
  if (!demo.length) return null;

  const mat = buildHeatmap(demo);
  const maxVal = Math.max(...mat.flatMap(r => r));

  let peakDay = 0, peakHour = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (mat[d][h] > mat[peakDay][peakHour]) { peakDay = d; peakHour = h; }
    }
  }

  return (
    <div className="card p-4 sm:p-5 mb-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="section-title flex items-center gap-2">
          {Ic.pulse('w-3.5 h-3.5 text-brand-500')} Mapa de calor — actividad por hora
        </p>
        {maxVal > 0 && (
          <span className="badge badge-blue text-[10px]">
            Hora pico: {HEATMAP_DAYS[peakDay]} {String(peakHour).padStart(2, '0')}h &nbsp;({mat[peakDay][peakHour]} viajes)
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="flex mb-1 ml-8">
            {HEATMAP_HOURS.map(h => (
              <div key={h} className="flex-1 text-center text-[8px] font-bold text-slate-400">
                {h % 4 === 0 ? String(h).padStart(2, '0') : ''}
              </div>
            ))}
          </div>
          {HEATMAP_DAYS.map((day, di) => (
            <div key={day} className="flex items-center mb-0.5">
              <span className="w-8 shrink-0 text-[9px] font-bold text-slate-500 text-right pr-1.5">{day}</span>
              {HEATMAP_HOURS.map(h => {
                const val = mat[di][h];
                const isPeak = di === peakDay && h === peakHour;
                return (
                  <div
                    key={h}
                    title={`${day} ${String(h).padStart(2, '0')}:00 — ${val} viaje${val !== 1 ? 's' : ''}`}
                    className={`heatmap-cell flex-1 h-4 rounded-[3px] mx-px ${isPeak ? 'ring-1 ring-offset-[1px] ring-brand-400' : ''}`}
                    style={{ background: heatColor(val, maxVal) }}
                  />
                );
              })}
            </div>
          ))}
          <div className="flex items-center gap-1.5 mt-2 justify-end">
            <span className="text-[9px] text-slate-400 font-medium">Menos</span>
            {['#f1f5f9', '#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#0f1a5a'].map(c => (
              <div key={c} className="w-3 h-3 rounded-sm" style={{ background: c }} />
            ))}
            <span className="text-[9px] text-slate-400 font-medium">Más</span>
          </div>
        </div>
      </div>
    </div>
  );
}
