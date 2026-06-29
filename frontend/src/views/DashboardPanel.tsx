import React, { useState, useCallback, useEffect } from 'react';
import type { Tab } from '../types';
import {
  dashboardApi, DashboardKpis, RankingConductor, RangoTemporal,
} from '../api';
import { isDemoMode } from '../demo';
import { Ic } from '../components/ui/Icons';
import { Spinner } from '../components/ui/Spinner';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { HelpHint } from '../components/ui/HelpHint';
import { KpiCard } from '../components/ui/KpiCard';
import { MiniStat } from '../components/ui/MiniStat';
import { RangeSelector } from '../components/dashboard/RangeSelector';
import { RankingCard } from '../components/dashboard/RankingCard';
import { ClientSwitcher } from '../components/dashboard/ClientSwitcher';
import { fmtBs, fmtInt, iniciales, relTime } from '../utils/formatters';
import { fakeTrendSeries, fakeTrendDelta } from '../utils/trends';

const RANGOS: { id: RangoTemporal; label: string }[] = [
  { id: 'hoy',  label: 'Hoy' },
  { id: '7d',   label: '7d' },
  { id: '30d',  label: '30d' },
  { id: 'mes',  label: 'Mes' },
  { id: 'todo', label: 'Todo' },
];

export function DashboardPanel({
  apiKeySet, tenantNombre, navTo, adminKey,
  selectedClient, onSelectClient,
}: {
  apiKeySet: boolean;
  tenantNombre: string;
  navTo: (t: Tab) => void;
  adminKey: string;
  selectedClient: { id: string; nombre: string } | null;
  onSelectClient: (c: { id: string; nombre: string } | null) => void;
}) {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [topPrima, setTopPrima] = useState<RankingConductor[]>([]);
  const [topViajes, setTopViajes] = useState<RankingConductor[]>([]);
  const [topComision, setTopComision] = useState<RankingConductor[]>([]);
  const [enCurso, setEnCurso] = useState<RankingConductor[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [rango, setRango] = useState<RangoTemporal>('30d');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [, setRelTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setRelTick(x => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const adminMode = !!adminKey.trim();
  const drilledDown = adminMode && !!selectedClient;

  const load = useCallback(async () => {
    if (!apiKeySet && !drilledDown) return;
    setLoading(true); setErr('');
    try {
      if (drilledDown && selectedClient) {
        const [k, rp, rv, rc, ec] = await Promise.all([
          dashboardApi.kpisDeTenant(adminKey, selectedClient.id, rango),
          dashboardApi.rankingDeTenant(adminKey, selectedClient.id, 'prima', 5, rango),
          dashboardApi.rankingDeTenant(adminKey, selectedClient.id, 'viajes', 5, rango),
          dashboardApi.rankingDeTenant(adminKey, selectedClient.id, 'comision', 5, rango),
          dashboardApi.enCursoDeTenant(adminKey, selectedClient.id, rango),
        ]);
        setKpis(k.data); setTopPrima(rp.data); setTopViajes(rv.data);
        setTopComision(rc.data); setEnCurso(ec.data);
      } else {
        const [k, rp, rv, rc, ec] = await Promise.all([
          dashboardApi.kpis(rango),
          dashboardApi.ranking('prima', 5, rango),
          dashboardApi.ranking('viajes', 5, rango),
          dashboardApi.ranking('comision', 5, rango),
          dashboardApi.enCurso(rango),
        ]);
        setKpis(k.data); setTopPrima(rp.data); setTopViajes(rv.data);
        setTopComision(rc.data); setEnCurso(ec.data);
      }
      setUpdatedAt(new Date());
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setErr(err?.response?.data?.message ?? 'No se pudieron cargar los KPIs');
    } finally {
      setLoading(false);
    }
  }, [apiKeySet, adminKey, drilledDown, selectedClient, rango]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!adminMode) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSwitcherOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [adminMode]);

  const subtitle = (
    <span className="flex items-center gap-1.5 flex-wrap">
      {drilledDown && (
        <>
          <button onClick={() => onSelectClient(null)}
            className="text-slate-500 hover:text-brand-700 font-bold transition-colors">
            Mi cartera
          </button>
          <span className="text-slate-400">{Ic.chevron('w-3 h-3')}</span>
        </>
      )}
      <span>Gestión de cartera</span>
      <span className="text-slate-400">·</span>
      {adminMode ? (
        <>
          <ClientSwitcher
            adminKey={adminKey}
            currentName={selectedClient?.nombre ?? tenantNombre ?? 'Cliente conectado'}
            isDrillDown={drilledDown}
            open={switcherOpen}
            onOpenChange={setSwitcherOpen}
            onSelect={c => onSelectClient(c)}
            onClearSelection={() => onSelectClient(null)}
            onCreateNew={() => navTo('setup')}
          />
          <HelpHint text="Cambia de cliente para ver su dashboard. Atajo: Ctrl/Cmd + K." />
        </>
      ) : (
        <span>{tenantNombre || 'Cliente conectado'}</span>
      )}
    </span>
  );

  return (
    <div className="animate-in-slow" key={selectedClient?.id ?? 'self'}>
      <PageHeader
        title="Panel de Control"
        subtitle={apiKeySet || adminMode ? subtitle : 'Conecta tu API Key para ver los datos de tu cartera'}
        action={(apiKeySet || drilledDown) && (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="inline-flex items-center gap-1.5">
              <RangeSelector value={rango} onChange={setRango} />
              <HelpHint text="Filtra todos los KPIs y rankings al rango temporal seleccionado." side="bottom" />
            </div>
            <span className="hidden md:flex items-center gap-1 text-[10.5px] text-slate-500 font-semibold">
              <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              {loading ? 'Actualizando…' : updatedAt ? `Hace ${relTime(updatedAt)}` : '—'}
            </span>
            <button onClick={load}
              title={`Actualizar (vista: ${RANGOS.find(r => r.id === rango)?.label})`}
              className="btn-secondary h-9 text-xs flex items-center gap-1.5 px-3"
              disabled={loading}>
              {loading ? <Spinner size="sm" /> : Ic.refresh()} Actualizar
            </button>
          </div>
        )}
      />

      {!apiKeySet && !drilledDown && (
        <div className="mb-6">
          <EmptyState
            title="No hay sesión activa"
            sub={adminMode
              ? 'Selecciona un cliente con el switcher arriba o conecta tu API Key para empezar.'
              : 'Conecta tu API Key en el header para ver KPIs, viajes, comisiones y conductores de tu cartera.'}
            action={(
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {adminMode && (
                  <button onClick={() => setSwitcherOpen(true)} className="btn-primary text-xs px-4 inline-flex">
                    {Ic.users()} Elegir cliente
                  </button>
                )}
                <button onClick={() => navTo('setup')} className="btn-secondary text-xs px-4 inline-flex">
                  {Ic.plus()} Crear nuevo cliente
                </button>
              </div>
            )}
          />
        </div>
      )}

      {err && (
        <div className="alert-error mb-5">
          <p className="text-xs font-bold text-red-700">{err}</p>
        </div>
      )}

      {(apiKeySet || drilledDown) && (
        <>
          <div className="space-y-4">

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger">
                <KpiCard
                  icon={Ic.rows('w-4 h-4 text-white')}
                  gradient="gradient-brand"
                  label="Viajes realizados"
                  value={fmtInt(kpis?.totalViajes ?? 0)}
                  sub={`${kpis?.viajesFinalizados ?? 0} finalizados`}
                  loading={loading}
                  delta={fakeTrendDelta(kpis?.totalViajes ?? 0, 'viajes')}
                  trend={fakeTrendSeries(kpis?.totalViajes ?? 0, 'viajes')}
                  onClick={() => navTo('listar')}
                />
                <KpiCard
                  icon={Ic.pulse('w-4 h-4 text-white')}
                  gradient="gradient-warm"
                  label="Viajes activos"
                  value={fmtInt(kpis?.viajesActivos ?? 0)}
                  sub="en curso ahora"
                  loading={loading}
                  delta={fakeTrendDelta(kpis?.viajesActivos ?? 0, 'activos')}
                  trend={fakeTrendSeries(kpis?.viajesActivos ?? 0, 'activos')}
                  onClick={() => navTo('monitor')}
                />
                <KpiCard
                  icon={Ic.shield('w-4 h-4 text-white')}
                  gradient="gradient-success"
                  label="Pólizas activas"
                  value={fmtInt(kpis?.polizasActivas ?? 0)}
                  sub={`${kpis?.recibos ?? 0} recibos emitidos`}
                  loading={loading}
                  delta={fakeTrendDelta(kpis?.polizasActivas ?? 0, 'polizas')}
                  trend={fakeTrendSeries(kpis?.polizasActivas ?? 0, 'polizas')}
                  onClick={() => navTo('listar')}
                />
                <KpiCard
                  icon={Ic.cash('w-4 h-4 text-white')}
                  gradient="gradient-accent"
                  label="Comisiones"
                  value={fmtBs(kpis?.comisionTotal ?? 0)}
                  currency="Bs"
                  sub={`Prima total: Bs ${fmtBs(kpis?.primaTotal ?? 0)}`}
                  loading={loading}
                  delta={fakeTrendDelta(kpis?.comisionTotal ?? 0, 'comision')}
                  trend={fakeTrendSeries(kpis?.comisionTotal ?? 0, 'comision')}
                />
              </div>

              {enCurso.length > 0 && (
                <div className="card p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <p className="section-title flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      Conductores en curso
                      <HelpHint text="Conductores con al menos un viaje en estado EN_CURSO. Se actualiza al refrescar el dashboard." />
                    </p>
                    <span className="badge badge-yellow">{enCurso.length} activos</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {enCurso.map(c => (
                      <div key={c.conductorId ?? c.nombre}
                        className="border border-slate-200 rounded-xl p-3 bg-gradient-to-br from-amber-50/40 to-white">
                        <div className="flex items-start gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 font-extrabold text-xs flex items-center justify-center shrink-0">
                            {iniciales(c.nombre)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-800 truncate">{c.nombre}</p>
                            <p className="text-[11px] text-slate-600 font-mono">{c.cedula}</p>
                          </div>
                          <span
                            title={`${c.viajesActivos} viaje${c.viajesActivos === 1 ? '' : 's'} en curso`}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 ring-1 ring-amber-300/60 text-amber-800 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide shrink-0">
                            <span className="relative flex w-1.5 h-1.5">
                              <span className="absolute inset-0 rounded-full bg-amber-500 opacity-70 animate-ping" />
                              <span className="relative w-1.5 h-1.5 rounded-full bg-amber-600" />
                            </span>
                            {Ic.car('w-3 h-3')}
                            <span>en ruta</span>
                            {c.viajesActivos > 1 && <span className="ml-0.5 tabular-nums">×{c.viajesActivos}</span>}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <RankingCard titulo="Top por prima"    icon={Ic.trend('w-4 h-4 text-white')}  metricaLabel="Prima Bs"     data={topPrima}    metrica="prima"    loading={loading} />
                <RankingCard titulo="Top por viajes"   icon={Ic.trophy('w-4 h-4 text-white')} metricaLabel="Viajes"       data={topViajes}   metrica="viajes"   loading={loading} />
                <RankingCard titulo="Top por comisión" icon={Ic.cash('w-4 h-4 text-white')}   metricaLabel="Comisión Bs" data={topComision} metrica="comision" loading={loading} />
              </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card p-5 sm:p-6">
                <p className="section-title mb-4">Indicadores complementarios</p>
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Ticket promedio"  value={`Bs ${fmtBs(kpis?.ticketPromedio ?? 0)}`} />
                  <MiniStat label="Prima en USD"     value={`$ ${fmtBs(kpis?.primaTotalExt ?? 0)}`} />
                  <MiniStat label="Recibos emitidos" value={fmtInt(kpis?.recibos ?? 0)} />
                  <MiniStat label="% conversión"
                    value={`${kpis && kpis.totalViajes > 0 ? Math.round((kpis.polizasActivas / kpis.totalViajes) * 100) : 0} %`} />
                </div>
              </div>

              <div className="card p-5 sm:p-6">
                <p className="section-title mb-4">Métricas de rendimiento</p>
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Finalizados"      value={fmtInt(kpis?.viajesFinalizados ?? 0)} />
                  <MiniStat label="Prima USD total"  value={`$ ${fmtBs(kpis?.primaTotalExt ?? 0)}`} />
                  <MiniStat label="Recibos"          value={fmtInt(kpis?.recibos ?? 0)} />
                  <MiniStat label="Ticket Bs prom."  value={`Bs ${fmtBs(kpis?.ticketPromedio ?? 0)}`} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
