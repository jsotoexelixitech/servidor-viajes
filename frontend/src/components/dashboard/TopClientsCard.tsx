import React, { useState, useEffect, useCallback } from 'react';
import type { CarteraCliente, RangoTemporal } from '../../api';
import { dashboardApi } from '../../api';
import { Ic } from '../ui/Icons';
import { Spinner } from '../ui/Spinner';
import { fmtBs, fmtInt } from '../../utils/formatters';

export function TopClientsCard({
  adminKey, rango, onSelect,
}: {
  adminKey: string;
  rango: RangoTemporal;
  onSelect: (c: { id: string; nombre: string }) => void;
}) {
  const [list, setList] = useState<CarteraCliente[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!adminKey.trim()) return;
    setLoading(true);
    try {
      const r = await dashboardApi.cartera(adminKey);
      setList(r.data);
    } catch { /* silently ignore */ }
    finally { setLoading(false); }
  }, [adminKey]);

  useEffect(() => { load(); }, [load, rango]);

  const top5 = [...list]
    .sort((a, b) => (b.primaTotal ?? 0) - (a.primaTotal ?? 0))
    .slice(0, 5);

  const maxPrima = Math.max(1, ...top5.map(c => c.primaTotal ?? 0));

  return (
    <div className="card p-4 sm:p-5 flex flex-col">
      <p className="section-title text-[11px] mb-3 flex items-center gap-1.5">
        {Ic.users('w-3.5 h-3.5 text-brand-500')} Top clientes
      </p>
      {loading && list.length === 0 && (
        <div className="py-6 flex justify-center"><Spinner /></div>
      )}
      {!loading && top5.length === 0 && (
        <p className="text-xs text-slate-500 py-6 text-center">Sin datos</p>
      )}
      <div className="space-y-2.5">
        {top5.map((c, i) => {
          const pct = ((c.primaTotal ?? 0) / maxPrima) * 100;
          return (
            <button key={c.id} onClick={() => onSelect({ id: c.id, nombre: c.nombre })}
              className="w-full text-left rounded-lg hover:bg-slate-50 -mx-1 px-1 py-0.5 transition-colors group">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-5 h-5 rounded-md bg-brand-100 text-brand-700 text-[10px] font-extrabold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-xs font-bold text-slate-800 truncate flex-1 group-hover:text-brand-700 transition-colors">
                  {c.nombre}
                </span>
                <span className="text-[10px] font-extrabold text-brand-700 tabular-nums shrink-0">
                  Bs {fmtBs(c.primaTotal ?? 0)}
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden ml-7">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-all duration-500"
                  style={{ width: `${pct}%` }} />
              </div>
            </button>
          );
        })}
      </div>
      {top5.length === 0 && !loading && list.length > 0 && (
        <p className="text-[10px] text-slate-500 mt-3 text-right">{fmtInt(list.length)} clientes en total</p>
      )}
    </div>
  );
}
