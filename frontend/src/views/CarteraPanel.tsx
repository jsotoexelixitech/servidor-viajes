import React, { useState, useCallback, useEffect } from 'react';
import { dashboardApi, KpisGlobales, CarteraCliente } from '../api';
import { DEMO_INFO } from '../demo';
import { Ic } from '../components/ui/Icons';
import { Spinner } from '../components/ui/Spinner';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { KpiCard } from '../components/ui/KpiCard';
import { fmtBs, fmtInt, iniciales } from '../utils/formatters';

export function CarteraPanel({
  adminKey, setAdminKey, demoOn,
}: {
  adminKey: string;
  setAdminKey: (s: string) => void;
  demoOn: boolean;
}) {
  const [global, setGlobal] = useState<KpisGlobales | null>(null);
  const [cartera, setCartera] = useState<CarteraCliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const effectiveKey = demoOn ? (adminKey.trim() || DEMO_INFO.adminKey) : adminKey;

  const load = useCallback(async () => {
    if (!effectiveKey.trim()) {
      setErr('Ingresa una Admin Key para ver la cartera global');
      return;
    }
    setLoading(true); setErr('');
    try {
      const [g, c] = await Promise.all([
        dashboardApi.global(effectiveKey),
        dashboardApi.cartera(effectiveKey),
      ]);
      setGlobal(g.data);
      setCartera(c.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setErr(err?.response?.data?.message ?? 'Admin Key inválida o error de conexión');
      setGlobal(null);
      setCartera([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveKey]);

  useEffect(() => {
    if (demoOn) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoOn]);

  return (
    <div className="animate-in">
      <PageHeader
        title="Cartera de Clientes"
        subtitle={demoOn
          ? 'Visión consolidada de los clientes de la plataforma · datos simulados'
          : 'Visión consolidada de todos los clientes de la plataforma (vista administrativa)'}
        action={
          <button onClick={load} className="btn-secondary h-9 text-xs flex items-center gap-1.5 px-3"
            disabled={loading}>
            {loading ? <Spinner size="sm" /> : Ic.refresh()} {demoOn ? 'Refrescar' : 'Recargar'}
          </button>
        }
      />

      {!demoOn ? (
        <div className="card p-4 sm:p-5 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="label">Admin Key</label>
              <input type="password" className="input"
                value={adminKey}
                onChange={e => setAdminKey(e.target.value)}
                placeholder="ADMIN_SECRET del servidor" />
            </div>
            <button onClick={load} className="btn-primary h-10 px-4 text-xs flex items-center gap-1.5"
              disabled={loading}>
              {loading ? <Spinner size="sm" /> : Ic.refresh()} Cargar cartera
            </button>
          </div>
          {err && <p className="text-xs font-bold text-red-600 mt-3">{err}</p>}
        </div>
      ) : (
        err && (
          <div className="alert-error mb-5">
            <p className="text-xs font-bold text-red-700">{err}</p>
          </div>
        )
      )}

      {global && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-5 stagger">
          <KpiCard icon={Ic.shield('w-4 h-4 text-white')} gradient="gradient-brand"   label="Clientes activos"
            value={fmtInt(global.totalTenants)} sub={`${global.totalConductores} conductores`} loading={false} />
          <KpiCard icon={Ic.rows('w-4 h-4 text-white')}  gradient="gradient-success"  label="Viajes totales"
            value={fmtInt(global.totalViajes)} sub={`${global.viajesActivos} activos`} loading={false} />
          <KpiCard icon={Ic.shield('w-4 h-4 text-white')} gradient="gradient-warm"   label="Pólizas activas"
            value={fmtInt(global.polizasActivas)} sub={`${global.recibos} recibos`} loading={false} />
          <KpiCard icon={Ic.cash('w-4 h-4 text-white')}  gradient="gradient-accent"  label="Prima global"
            value={`Bs ${fmtBs(global.primaTotal)}`} sub={`$ ${fmtBs(global.primaTotalExt)}`} loading={false} />
          <KpiCard icon={Ic.trend('w-4 h-4 text-white')} gradient="bg-gradient-to-br from-emerald-600 to-emerald-400"
            label="Comisiones" value={`Bs ${fmtBs(global.comisionTotal)}`} sub="generadas en total" loading={false} />
        </div>
      )}

      {cartera.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <p className="section-title">Detalle por cliente</p>
            <span className="badge badge-blue">{cartera.length} clientes</span>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="text-right">Viajes</th>
                  <th className="text-right hidden sm:table-cell">Activos</th>
                  <th className="text-right">Prima Bs</th>
                  <th className="text-right">Comisión Bs</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {cartera.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-700 to-brand-500 text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">
                          {iniciales(c.nombre)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{c.nombre}</p>
                          <p className="text-[10px] text-slate-500 font-mono truncate">{c.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-right font-bold tabular-nums">{fmtInt(c.totalViajes)}</td>
                    <td className="text-right tabular-nums hidden sm:table-cell">
                      {c.viajesActivos > 0
                        ? <span className="badge badge-yellow">{c.viajesActivos}</span>
                        : <span className="text-slate-400">0</span>}
                    </td>
                    <td className="text-right font-bold tabular-nums text-brand-700">{fmtBs(c.primaTotal)}</td>
                    <td className="text-right font-bold tabular-nums text-emerald-600">{fmtBs(c.comisionTotal)}</td>
                    <td>
                      <span className={c.activo ? 'badge badge-green' : 'badge badge-gray'}>
                        {c.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!global && !err && !loading && (
        <EmptyState
          icon={Ic.shield('w-6 h-6')}
          title="Carga la cartera"
          sub="Ingresa tu Admin Key arriba para ver los datos consolidados de todos los clientes"
        />
      )}
    </div>
  );
}
