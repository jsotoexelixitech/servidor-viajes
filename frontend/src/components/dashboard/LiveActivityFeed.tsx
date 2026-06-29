import React, { useState, useEffect, useRef } from 'react';
import type { RangoTemporal } from '../../api';
import type { FeedEvent } from '../../types';
import { getDemoViajes, isDemoMode } from '../../demo';
import type { DemoViajeRaw } from '../../demo';
import { fmtBs, relTime } from '../../utils/formatters';

function viajeToEvent(v: DemoViajeRaw): FeedEvent {
  const kind: FeedEvent['kind'] =
    v.estadoPoliza === 'ERROR' || v.polizaError ? 'error'
    : v.estado === 'EN_CURSO' || v.estado === 'INICIADO' ? 'started'
    : v.cnpoliza ? 'policy'
    : 'finished';
  return { id: v.id, ts: new Date(v.creadoEn), kind, conductor: v.nombreConductor, placa: v.numeroPlaca, monto: v.prima };
}

const FEED_KIND_CFG = {
  started:  { dot: 'bg-amber-500',   label: 'Viaje iniciado',   text: 'text-amber-800',   bg: 'bg-amber-50/60' },
  policy:   { dot: 'bg-emerald-500', label: 'Póliza emitida',   text: 'text-emerald-800', bg: 'bg-emerald-50/60' },
  finished: { dot: 'bg-slate-400',   label: 'Viaje finalizado', text: 'text-slate-600',   bg: 'bg-slate-50/50' },
  error:    { dot: 'bg-red-500',     label: 'Error póliza',     text: 'text-red-700',     bg: 'bg-red-50/50' },
};

export function LiveActivityFeed({
  active, rango,
}: {
  active: boolean;
  rango: RangoTemporal;
}) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [newId, setNewId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const demo = getDemoViajes(rango);
    if (demo.length > 0) {
      const sorted = [...demo]
        .sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime())
        .slice(0, 18)
        .map(viajeToEvent);
      setEvents(sorted);
    }
  }, [active, rango]);

  useEffect(() => {
    if (!active || !isDemoMode()) return;
    const tick = () => {
      const demo = getDemoViajes();
      if (!demo.length) return;
      const source = demo[Math.floor(Math.random() * Math.min(demo.length, 30))];
      const fresh: FeedEvent = {
        ...viajeToEvent(source),
        id: 'tick-' + Date.now(),
        ts: new Date(),
        kind: Math.random() < 0.45 ? 'started' : Math.random() < 0.7 ? 'policy' : 'finished',
      };
      setNewId(fresh.id);
      setEvents(prev => [fresh, ...prev].slice(0, 25));
      setTimeout(() => setNewId(null), 600);
    };
    const t = setInterval(tick, 12000);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;

  return (
    <div className="card flex flex-col h-full min-h-[420px] max-h-[680px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <p className="section-title flex items-center gap-2 text-[11px]">
          <span className="relative flex w-2 h-2">
            <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-60 animate-ping" />
            <span className="relative w-2 h-2 rounded-full bg-emerald-500" />
          </span>
          Actividad en vivo
        </p>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
          {events.length} eventos
        </span>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {events.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-8">Sin actividad reciente</p>
        )}
        {events.map(ev => {
          const cfg = FEED_KIND_CFG[ev.kind];
          return (
            <div key={ev.id}
              className={`rounded-lg px-2.5 py-2 ${cfg.bg} ${ev.id === newId ? 'feed-enter' : ''}`}>
              <div className="flex items-start gap-2">
                <span className={`mt-1 w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-[10.5px] font-extrabold ${cfg.text} truncate`}>{cfg.label}</p>
                  <p className="text-[10px] text-slate-700 truncate font-medium">{ev.conductor}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[9.5px] font-mono text-slate-500">{ev.placa}</span>
                    <span className="text-[9.5px] text-slate-400 font-medium">{relTime(ev.ts)} atrás</span>
                  </div>
                  {ev.monto && ev.monto > 0 && (
                    <span className="text-[10px] font-bold text-brand-600">Bs {fmtBs(ev.monto)}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
