import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Notif } from '../types';
import {
  flotaApi, FlotaCierre, FlotaConductorResumen, FlotaConfig, FlotaResumen, FlotaViaje,
} from '../api';
import { KpiCard } from '../components/ui/KpiCard';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Ic } from '../components/ui/Icons';
import { useBrand } from '../lib/branding';

/**
 * Flota por uso (Ridery): viajes por conductor, cobro por tiempo o km y un solo recibo mensual por la póliza.
 * Pensada para operación de La Mundial; también se abre embebida (iframe) dentro de su sistema.
 */

type PushNotif = (tipo: Notif['tipo'], titulo: string, msg: string) => void;
type SubTab = 'resumen' | 'feed' | 'conductores' | 'cierres' | 'config' | 'simulador';

const SUBTABS: { id: SubTab; label: string; icon: (p?: string) => React.ReactNode }[] = [
  { id: 'resumen',     label: 'Resumen del mes',    icon: Ic.grid },
  { id: 'feed',        label: 'Viajes en vivo',     icon: Ic.pulse },
  { id: 'conductores', label: 'Conductores',        icon: Ic.users },
  { id: 'cierres',     label: 'Cierres y recibo',   icon: Ic.cash },
  { id: 'config',      label: 'Cobro',              icon: Ic.gear },
  { id: 'simulador',   label: 'Simulador',          icon: Ic.sparkle },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
const n = (v: unknown) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
const fmt = (v: unknown, d = 0) => n(v).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (v: unknown, moneda = 'USD') => `${fmt(v, 2)} ${moneda}`;
const fecha = (v?: string | null) => v ? new Date(v).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const hora = (v?: string | null) => v ? new Date(v).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '—';
const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`);
const mesActual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const mesLabel = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  const s = new Date(y, (m || 1) - 1, 1).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const errMsg = (e: unknown) => {
  const err = e as { response?: { data?: { message?: unknown } }; message?: string };
  const m = err.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : String(m ?? err.message ?? 'Error');
};

const ESTADO_VIAJE: Record<string, { cls: string; label: string }> = {
  INICIADO:   { cls: 'badge badge-yellow', label: 'En curso' },
  FINALIZADO: { cls: 'badge badge-green',  label: 'Finalizado' },
  CANCELADO:  { cls: 'badge badge-gray',   label: 'Cancelado' },
};
const ESTADO_CIERRE: Record<string, { cls: string; label: string }> = {
  BORRADOR:        { cls: 'badge badge-yellow', label: 'Borrador' },
  RECIBO_SIMULADO: { cls: 'badge badge-blue',   label: 'Recibo simulado' },
  RECIBO_GENERADO: { cls: 'badge badge-green',  label: 'Recibo generado' },
  ERROR:           { cls: 'badge badge-red',    label: 'Error' },
};

// ── Contenedor ──────────────────────────────────────────────────────────────
export function FlotaPanel({
  pushNotif, demoOn, tenantNombre, embed,
}: {
  pushNotif: PushNotif;
  demoOn: boolean;
  tenantNombre?: string;
  embed?: boolean;
}) {
  const [sub, setSub] = useState<SubTab>('resumen');
  const [periodo, setPeriodo] = useState(mesActual());

  if (demoOn) {
    return (
      <EmptyState
        title="Flota por uso trabaja con datos reales"
        sub="Desactiva el modo demo y conéctate con la API key de la plataforma (Ridery). Para probar sin Ridery usa el Simulador."
      />
    );
  }

  return (
    <div className="animate-in space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="section-title text-brand-600">{Ic.car('w-3.5 h-3.5')} Póliza de flota por uso</p>
          <h1 className={`${embed ? 'text-xl font-display font-bold text-[#091133]' : 'page-title'} mt-1 truncate`}>
            {tenantNombre || 'Flota'}
          </h1>
          {!embed && (
            <p className="page-subtitle">Viajes por conductor, cobro por tiempo o por km y un solo recibo mensual por la póliza.</p>
          )}
        </div>
        <label className="label mb-0">
          Mes
          <input type="month" className="input mt-1 h-9 text-sm w-44 normal-case tracking-normal font-medium"
            value={periodo} onChange={(e) => e.target.value && setPeriodo(e.target.value)} />
        </label>
      </div>

      <nav className="card p-1.5 flex flex-wrap gap-1">
        {SUBTABS.map((t) => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              sub === t.id ? 'bg-brand-700 text-white shadow-[var(--shadow-brand)]' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}>
            {t.icon('w-3.5 h-3.5')} {t.label}
          </button>
        ))}
      </nav>

      {sub === 'resumen'     && <ResumenTab periodo={periodo} pushNotif={pushNotif} go={setSub} />}
      {sub === 'feed'        && <FeedTab pushNotif={pushNotif} />}
      {sub === 'conductores' && <ConductoresTab periodo={periodo} pushNotif={pushNotif} />}
      {sub === 'cierres'     && <CierresTab periodo={periodo} pushNotif={pushNotif} />}
      {sub === 'config'      && <ConfigTab pushNotif={pushNotif} />}
      {sub === 'simulador'   && <SimuladorTab periodo={periodo} pushNotif={pushNotif} onDone={() => setSub('cierres')} />}
    </div>
  );
}

/** Pantalla mínima de conexión para el modo embebido cuando la clave no llegó por la URL ni por postMessage. */
export function FlotaEmbedConnect({
  loading, error, onConnect,
}: { loading: boolean; error: string; onConnect: (apiKey: string) => void }) {
  const [key, setKey] = useState('');
  const brand = useBrand();
  return (
    <div className="max-w-md mx-auto mt-10 card p-6 space-y-4 animate-in">
      <div className="flex items-center gap-3">
        <img src={brand.logoUrl} alt="" className="w-10 h-10 object-contain" />
        <div>
          <p className="text-sm font-extrabold text-slate-900">{brand.appTitle}</p>
          <p className="text-xs text-slate-600">Conecta la API key de la plataforma para ver los viajes y el cobro del mes.</p>
        </div>
      </div>
      <input type="password" className="input" placeholder="API Key" value={key}
        onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && key.trim() && onConnect(key.trim())} />
      {error && <p className="form-error text-xs text-red-600">{error}</p>}
      <button className="btn-primary w-full" disabled={loading || !key.trim()} onClick={() => onConnect(key.trim())}>
        {loading ? <Spinner size="sm" /> : Ic.key()} Conectar
      </button>
    </div>
  );
}

/** Estado del acceso por SSO (Nexus): validando, error, o aviso de "abrir desde Nexus". Sin campo de API key. */
export function SsoEstado({ loading, error, mensaje }: { loading: boolean; error: string; mensaje?: string }) {
  const brand = useBrand();
  return (
    <div className="max-w-md mx-auto mt-10 card p-8 text-center animate-in">
      <img src={brand.logoUrl} alt="" className="w-14 h-14 mx-auto object-contain" draggable={false} />
      {!loading && !error && mensaje ? (
        <>
          <p className="font-display text-lg font-bold text-[#091133] mt-5">{brand.appTitle}</p>
          <p className="text-sm text-[#5E6275] mt-2">{mensaje}</p>
        </>
      ) : loading || !error ? (
        <>
          <div className="flex justify-center mt-5"><Spinner size="lg" /></div>
          <p className="font-display text-lg font-bold text-[#091133] mt-4">Validando el acceso</p>
          <p className="text-xs text-[#5E6275] mt-1">Confirmando la sesión con Nexus…</p>
        </>
      ) : (
        <>
          <p className="font-display text-lg font-bold text-[#091133] mt-5">No se pudo abrir la flota</p>
          <p className="text-sm text-[#8F2A2D] bg-[#FDECEC] rounded-xl px-3 py-2 mt-3">{error}</p>
          <p className="text-xs text-[#5E6275] mt-3">Vuelve a abrir el módulo desde Nexus. Si persiste, avisa a soporte.</p>
        </>
      )}
    </div>
  );
}

// ── Resumen del mes ─────────────────────────────────────────────────────────
function ResumenTab({ periodo, pushNotif, go }: { periodo: string; pushNotif: PushNotif; go: (t: SubTab) => void }) {
  const [data, setData] = useState<FlotaResumen | null>(null);
  const [cfg, setCfg] = useState<FlotaConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([flotaApi.resumen(periodo), flotaApi.config()]);
      setData(r.data); setCfg(c.data);
    } catch (e) {
      pushNotif('error', 'No se pudo cargar el resumen', errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [periodo, pushNotif]);

  useEffect(() => { void load(); }, [load]);

  const diasMes = data?.diasMes ?? 30;
  const diasTrans = data?.diasTranscurridos ?? 0;
  const proyeccion = data && diasTrans > 0 ? (data.totalMonto / diasTrans) * diasMes : 0;
  const promedio = data?.promedioViaje ?? (data && data.totalViajes ? data.totalMonto / data.totalViajes : 0);
  const avance = Math.min(100, Math.round((diasTrans / Math.max(diasMes, 1)) * 100));

  if (!data) return <div className="card p-10 flex justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 stagger">
        <KpiCard icon={Ic.cash('w-4 h-4')} gradient="gradient-brand" loading={loading}
          label="Total a cobrar este mes" value={fmt(data.totalMonto, 2)} currency={data.moneda}
          sub={diasTrans < diasMes ? `Proyección al cierre: ${money(proyeccion, data.moneda)}` : 'Mes completo'} />
        <KpiCard icon={Ic.car('w-4 h-4')} gradient="gradient-navy-blue" loading={loading}
          label="Viajes finalizados" value={fmt(data.totalViajes)}
          sub={`${fmt(data.cancelados ?? 0)} cancelados · ${fmt(data.enCurso)} en curso ahora`} />
        <KpiCard icon={Ic.trend('w-4 h-4')} gradient="gradient-navy-deep" loading={loading}
          label="Km recorridos" value={fmt(data.totalKm, 1)} sub={`${dur(data.totalMinutos)} en viaje`} />
        <KpiCard icon={Ic.users('w-4 h-4')} gradient="gradient-red" loading={loading}
          label="Costo promedio por viaje" value={fmt(promedio, 2)} currency={data.moneda}
          sub={`${fmt(data.conductoresActivos ?? data.conductores.length)} conductores con viajes`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card p-5 xl:col-span-2">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="section-title">{Ic.trend('w-3.5 h-3.5')} Cobro por día · {mesLabel(periodo)}</p>
              <p className="text-xs text-slate-500 mt-1">Suma del costo de los viajes finalizados cada día.</p>
            </div>
            <button className="btn-ghost text-xs" onClick={() => void load()}>{Ic.refresh('w-3.5 h-3.5')} Actualizar</button>
          </div>
          <DailyBars periodo={periodo} dias={data.porDia ?? []} moneda={data.moneda} diasMes={diasMes} />
        </div>

        <div className="card p-5 flex flex-col gap-4">
          <div>
            <p className="section-title">{Ic.shield('w-3.5 h-3.5')} Recibo del mes</p>
            <p className="text-xs text-slate-500 mt-1">Póliza <span className="font-mono font-semibold text-slate-700">{data.cnpoliza}</span></p>
          </div>
          <div>
            <div className="flex items-end justify-between text-xs text-slate-600 mb-1.5">
              <span>Avance del mes</span><span className="font-bold">{diasTrans} / {diasMes} días</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-2 gradient-brand rounded-full transition-all" style={{ width: `${avance}%` }} />
            </div>
          </div>
          <dl className="text-xs space-y-2">
            <Row k="Acumulado" v={<b className="text-slate-900">{money(data.totalMonto, data.moneda)}</b>} />
            <Row k="Proyección al cierre" v={money(proyeccion, data.moneda)} />
            {cfg && (
              <>
                <Row k="Se cobra por" v={cfg.modalidad === 'KM' ? 'kilómetro recorrido' : 'minuto de viaje'} />
                <Row k="Tarifa" v={`${fmt(cfg.tarifa, 4)} ${cfg.moneda} / ${cfg.modalidad === 'KM' ? 'km' : 'min'}`} />
                <Row k="Mínimo por viaje" v={money(cfg.minimoPorViaje, cfg.moneda)} />
                <Row k="Cierre" v={cfg.modoCierre === 'AUTO' ? `Automático · día ${cfg.diaCierre}` : 'Manual'} />
              </>
            )}
          </dl>
          <div className="mt-auto flex gap-2">
            <button className="btn-primary flex-1 text-xs" onClick={() => go('cierres')}>{Ic.cash('w-3.5 h-3.5')} Ir al cierre</button>
            <button className="btn-secondary text-xs" onClick={() => go('config')}>{Ic.gear('w-3.5 h-3.5')} Cobro</button>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="section-title">{Ic.trophy('w-3.5 h-3.5')} Conductores con más cobro</p>
            <p className="text-xs text-slate-500 mt-1">Participación de cada conductor en el recibo del mes (detalle interno, no va al recibo).</p>
          </div>
          {data.conductores.length > 5 && (
            <button className="btn-secondary text-xs" onClick={() => go('conductores')}>Ver los {data.conductores.length} {Ic.arrow()}</button>
          )}
        </div>
        {data.conductores.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            Sin viajes finalizados en {mesLabel(periodo)}. Usa el <button className="underline font-semibold" onClick={() => go('simulador')}>Simulador</button> o espera los viajes de la plataforma.
          </p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {data.conductores.slice(0, 5).map((c, i) => (
              <li key={(c.conductorDoc ?? '') + c.conductorNombre} className="py-2.5 flex items-center gap-3">
                <span className={`w-6 h-6 rounded-lg text-[11px] font-extrabold flex items-center justify-center shrink-0 ${
                  i === 0 ? 'gradient-brand text-white' : 'bg-slate-100 text-slate-600'}`}>{i + 1}</span>
                <div className="min-w-0 w-48">
                  <p className="text-sm font-semibold text-slate-800 truncate">{c.conductorNombre}</p>
                  <p className="text-[11px] text-slate-500 truncate">{c.conductorDoc ?? '—'} · {c.placas.join(', ')}</p>
                </div>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-2 gradient-brand rounded-full" style={{ width: `${Math.min(c.participacion, 100)}%` }} />
                </div>
                <span className="text-xs text-slate-500 w-20 text-right">{c.viajes} viajes</span>
                <span className="text-sm font-bold text-slate-900 w-28 text-right tabular-nums">{money(c.costo, data.moneda)}</span>
                <span className="text-xs font-bold text-brand-700 w-12 text-right">{c.participacion}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-slate-700 font-medium text-right">{v}</dd></div>;
}

/** Barras por día del mes (SVG, sin librerías). */
function DailyBars({ periodo, dias, moneda, diasMes }: {
  periodo: string; dias: NonNullable<FlotaResumen['porDia']>; moneda: string; diasMes: number;
}) {
  const serie = useMemo(() => {
    const map = new Map(dias.map((d) => [d.dia, d]));
    return Array.from({ length: diasMes }, (_, i) => {
      const dia = `${periodo}-${String(i + 1).padStart(2, '0')}`;
      return map.get(dia) ?? { dia, viajes: 0, monto: 0, km: 0, minutos: 0 };
    });
  }, [dias, diasMes, periodo]);
  const max = Math.max(1, ...serie.map((d) => d.monto));
  const hoy = new Date().toISOString().slice(0, 10);
  const W = serie.length * 22, H = 150, base = 128;
  if (dias.length === 0) {
    return <p className="text-sm text-slate-500 py-10 text-center">Todavía no hay viajes finalizados en este mes.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px] h-40" role="img" aria-label="Cobro por día">
        {[0.25, 0.5, 0.75, 1].map((p) => (
          <line key={p} x1="0" x2={W} y1={base - p * 110} y2={base - p * 110} stroke="#eef2f7" strokeWidth="1" />
        ))}
        {serie.map((d, i) => {
          const h = (d.monto / max) * 110;
          const esHoy = d.dia === hoy;
          return (
            <g key={d.dia}>
              <rect x={i * 22 + 4} y={base - h} width="14" height={h} rx="3"
                style={{ fill: esHoy ? 'var(--lm-red)' : d.monto > 0 ? 'var(--lm-blue)' : '#e2e8f0' }} opacity={d.monto > 0 ? 1 : 0.6}>
                <title>{`${d.dia}: ${d.viajes} viajes · ${money(d.monto, moneda)} · ${fmt(d.km, 1)} km`}</title>
              </rect>
              {(i === 0 || (i + 1) % 5 === 0) && (
                <text x={i * 22 + 11} y={H - 6} textAnchor="middle" fontSize="9" fill="#64748b">{i + 1}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 text-[10.5px] text-slate-500 mt-1">
        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-[var(--lm-blue)] inline-block" /> Día con viajes</span>
        <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-[var(--lm-red)] inline-block" /> Hoy</span>
        <span className="ml-auto">Máximo del mes: {money(max, moneda)}</span>
      </div>
    </div>
  );
}

// ── Viajes en vivo ──────────────────────────────────────────────────────────
function FeedTab({ pushNotif }: { pushNotif: PushNotif }) {
  const [list, setList] = useState<FlotaViaje[]>([]);
  const [estado, setEstado] = useState('');
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState(false);
  const [ultima, setUltima] = useState<Date | null>(null);
  const [ahora, setAhora] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await flotaApi.feed(100, estado || undefined);
      setList(data); setUltima(new Date()); setAhora(Date.now());
    } catch (e) {
      pushNotif('error', 'No se pudo cargar el feed', errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [estado, pushNotif]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!auto) return;
    const t = window.setInterval(() => { void load(); }, 10000);
    return () => window.clearInterval(t);
  }, [auto, load]);

  const hoy = new Date().toDateString();
  const enCurso = list.filter((v) => v.estado === 'INICIADO').length;
  const finHoy = list.filter((v) => v.estado === 'FINALIZADO' && v.fin && new Date(v.fin).toDateString() === hoy).length;
  const canHoy = list.filter((v) => v.estado === 'CANCELADO' && new Date(v.inicio).toDateString() === hoy).length;
  const cobroHoy = list.filter((v) => v.estado === 'FINALIZADO' && v.fin && new Date(v.fin).toDateString() === hoy)
    .reduce((a, v) => a + n(v.costo), 0);

  const FILTROS = [['', 'Todos'], ['INICIADO', 'En curso'], ['FINALIZADO', 'Finalizados'], ['CANCELADO', 'Cancelados']];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Mini label="En curso ahora" value={fmt(enCurso)} tone="amber" pulse={enCurso > 0} />
        <Mini label="Finalizados hoy" value={fmt(finHoy)} tone="green" />
        <Mini label="Cancelados hoy" value={fmt(canHoy)} tone="slate" />
        <Mini label="Cobro de hoy" value={money(cobroHoy, list[0]?.moneda ?? 'USD')} tone="brand" />
      </div>

      <div className="card p-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {FILTROS.map(([v, l]) => (
            <button key={v} onClick={() => setEstado(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${estado === v ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {l}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-600 font-medium">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span className={`w-1.5 h-1.5 rounded-full ${auto ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
          En vivo (cada 10 s)
        </label>
        <span className="text-[11px] text-slate-500">{ultima ? `Actualizado ${ultima.toLocaleTimeString('es-VE')}` : ''}</span>
        <button className="btn-secondary text-xs py-1.5" onClick={() => void load()}>{loading ? <Spinner size="sm" /> : Ic.refresh('w-3.5 h-3.5')} Actualizar</button>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Estado</th><th>Conductor</th><th>Placa</th><th>Inicio</th><th>Duración</th>
              <th>Recorrido</th><th className="text-right">Km</th><th className="text-right">Costo</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={8} className="p-0"><EmptyState title="Sin viajes" sub="Todavía no llegaron viajes de la plataforma." /></td></tr>
            ) : list.map((v) => {
              const enCursoRow = v.estado === 'INICIADO';
              const minutos = enCursoRow ? (ahora - new Date(v.inicio).getTime()) / 60000 : n(v.minutos);
              return (
                <tr key={v.id} className={enCursoRow ? 'bg-amber-50/40' : ''}>
                  <td>
                    <span className={ESTADO_VIAJE[v.estado]?.cls ?? 'badge badge-gray'}>
                      {enCursoRow && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                      {ESTADO_VIAJE[v.estado]?.label ?? v.estado}
                    </span>
                    {v.simulado && <span className="badge badge-gray ml-1">sim</span>}
                  </td>
                  <td className="font-semibold text-slate-800">{v.conductorNombre ?? '—'}</td>
                  <td className="font-mono text-xs">{v.placa}</td>
                  <td className="text-xs text-slate-600" title={fecha(v.inicio)}>{hora(v.inicio)} <span className="text-slate-400">{new Date(v.inicio).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}</span></td>
                  <td className="text-xs">{v.estado === 'CANCELADO' ? '—' : dur(minutos)}{enCursoRow && <span className="text-amber-600"> y contando</span>}</td>
                  <td className="text-xs text-slate-600 max-w-[220px] truncate">{v.origen?.direccion ?? '—'} → {v.destino?.direccion ?? (enCursoRow ? '…' : '—')}</td>
                  <td className="text-right tabular-nums">{v.km ? fmt(v.km, 1) : '—'}</td>
                  <td className="text-right font-bold text-slate-900 tabular-nums">{v.costo ? money(v.costo, v.moneda ?? 'USD') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">Se muestran los últimos 100 viajes. Los contadores de "hoy" se calculan sobre esa lista.</p>
    </div>
  );
}

function Mini({ label, value, tone, pulse }: { label: string; value: string; tone: 'amber' | 'green' | 'slate' | 'brand'; pulse?: boolean }) {
  const dot = { amber: 'bg-amber-500', green: 'bg-emerald-500', slate: 'bg-slate-400', brand: 'bg-brand-600' }[tone];
  return (
    <div className="card p-4 flex items-center gap-3">
      <span className={`w-2 h-2 rounded-full ${dot} ${pulse ? 'animate-pulse' : ''}`} />
      <div><p className="stat-label">{label}</p><p className="text-xl font-extrabold text-slate-900 tabular-nums leading-tight">{value}</p></div>
    </div>
  );
}

// ── Conductores ─────────────────────────────────────────────────────────────
type SortKey = 'costo' | 'viajes' | 'km' | 'minutos' | 'conductorNombre';
function ConductoresTab({ periodo, pushNotif }: { periodo: string; pushNotif: PushNotif }) {
  const [data, setData] = useState<FlotaResumen | null>(null);
  const [sort, setSort] = useState<SortKey>('costo');
  const [q, setQ] = useState('');

  useEffect(() => {
    flotaApi.resumen(periodo).then((r) => setData(r.data))
      .catch((e) => pushNotif('error', 'No se pudieron cargar los conductores', errMsg(e)));
  }, [periodo, pushNotif]);

  const rows = useMemo(() => {
    if (!data) return [];
    const f = q.trim().toLowerCase();
    const list = data.conductores.filter((c) =>
      !f || c.conductorNombre.toLowerCase().includes(f) || (c.conductorDoc ?? '').toLowerCase().includes(f) || c.placas.join(' ').toLowerCase().includes(f));
    return [...list].sort((a, b) => sort === 'conductorNombre'
      ? a.conductorNombre.localeCompare(b.conductorNombre)
      : (b[sort] as number) - (a[sort] as number));
  }, [data, q, sort]);

  const exportar = () => {
    if (!data) return;
    const head = ['Conductor', 'Documento', 'Placas', 'Viajes', 'Km', 'Minutos', `Monto ${data.moneda}`, 'Participacion %'];
    const lines = rows.map((c) => [c.conductorNombre, c.conductorDoc ?? '', c.placas.join(' '), c.viajes, c.km, c.minutos, c.costo, c.participacion]
      .map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';'));
    const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `flota-conductores-${periodo}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!data) return <div className="card p-10 flex justify-center"><Spinner size="lg" /></div>;

  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={right ? 'text-right' : ''}>
      <button onClick={() => setSort(k)} className={`inline-flex items-center gap-1 ${sort === k ? 'text-brand-700' : ''}`}>
        {label}{sort === k && <span className="text-[9px]">▼</span>}
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="card p-3 flex flex-wrap items-center gap-3">
        <input className="input h-9 text-sm max-w-xs" placeholder="Buscar conductor, documento o placa…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-slate-500">{rows.length} de {data.conductores.length} conductores · {mesLabel(periodo)}</span>
        <button className="btn-secondary text-xs ml-auto" onClick={exportar} disabled={rows.length === 0}>{Ic.rows('w-3.5 h-3.5')} Exportar CSV</button>
      </div>
      <div className="card p-0 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <Th k="conductorNombre" label="Conductor" />
              <th>Placas</th>
              <Th k="viajes" label="Viajes" right />
              <Th k="km" label="Km" right />
              <Th k="minutos" label="Tiempo" right />
              <Th k="costo" label="Monto" right />
              <th className="w-56">Participación en el recibo</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="p-0"><EmptyState title="Sin conductores" sub="No hay viajes finalizados en el mes con ese filtro." /></td></tr>
            ) : rows.map((c, i) => <ConductorRow key={(c.conductorDoc ?? '') + c.conductorNombre} c={c} i={i} moneda={data.moneda} />)}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 font-bold text-slate-800">
                <td colSpan={3}>Total</td>
                <td className="text-right">{fmt(rows.reduce((a, c) => a + c.viajes, 0))}</td>
                <td className="text-right">{fmt(rows.reduce((a, c) => a + c.km, 0), 1)}</td>
                <td className="text-right">{dur(rows.reduce((a, c) => a + c.minutos, 0))}</td>
                <td className="text-right">{money(rows.reduce((a, c) => a + c.costo, 0), data.moneda)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function ConductorRow({ c, i, moneda }: { c: FlotaConductorResumen; i: number; moneda: string }) {
  return (
    <tr>
      <td className="text-xs text-slate-400">{i + 1}</td>
      <td><p className="font-semibold text-slate-800">{c.conductorNombre}</p><p className="text-[11px] text-slate-500">{c.conductorDoc ?? '—'}</p></td>
      <td className="font-mono text-xs">{c.placas.join(', ')}</td>
      <td className="text-right tabular-nums">{fmt(c.viajes)}</td>
      <td className="text-right tabular-nums">{fmt(c.km, 1)}</td>
      <td className="text-right text-xs">{dur(c.minutos)}</td>
      <td className="text-right font-bold text-slate-900 tabular-nums">{money(c.costo, moneda)}</td>
      <td>
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden"><div className="h-2 gradient-brand rounded-full" style={{ width: `${Math.min(c.participacion, 100)}%` }} /></div>
          <span className="text-xs font-bold text-brand-700 w-12 text-right">{c.participacion}%</span>
        </div>
      </td>
    </tr>
  );
}

// ── Cierres y recibo ────────────────────────────────────────────────────────
function CierresTab({ periodo: periodoProp, pushNotif }: { periodo: string; pushNotif: PushNotif }) {
  const [list, setList] = useState<FlotaCierre[]>([]);
  const [periodo, setPeriodo] = useState(periodoProp);
  const [busy, setBusy] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<{ cierre: FlotaCierre; resumen: FlotaResumen } | null>(null);

  useEffect(() => { setPeriodo(periodoProp); }, [periodoProp]);

  const load = useCallback(async () => {
    try { const { data } = await flotaApi.cierres(); setList(data); }
    catch (e) { pushNotif('error', 'No se pudieron cargar los cierres', errMsg(e)); }
  }, [pushNotif]);

  useEffect(() => { void load(); }, [load]);

  const verDetalle = async (id: string) => {
    try { const { data } = await flotaApi.detalleCierre(id); setDetalle(data); }
    catch (e) { pushNotif('error', 'No se pudo cargar el detalle', errMsg(e)); }
  };

  const calcular = async () => {
    setBusy('calcular');
    try {
      const { data } = await flotaApi.calcularCierre(periodo);
      pushNotif('success', `Cierre ${data.periodo} calculado`, `${data.totalViajes} viajes · ${money(data.monto, data.moneda)}`);
      await load(); await verDetalle(data.id);
    } catch (e) {
      pushNotif('error', 'No se pudo calcular el cierre', errMsg(e));
    } finally { setBusy(null); }
  };

  const generar = async (c: FlotaCierre, modo: 'SIMULADO' | 'REAL') => {
    if (modo === 'REAL' && !window.confirm(
      `Se generará un recibo REAL en Sis2000 por ${money(c.monto, c.moneda)} a la póliza ${c.cnpoliza}.\n\n¿Continuar?`)) return;
    setBusy(c.id + modo);
    try {
      const { data } = await flotaApi.generarRecibo(c.id, modo);
      pushNotif('success', modo === 'REAL' ? 'Recibo generado en Sis2000' : 'Recibo simulado', `Recibo ${data.cnrecibo ?? ''}`);
      await load(); await verDetalle(c.id);
    } catch (e) {
      pushNotif('error', 'No se pudo generar el recibo', errMsg(e)); await load();
    } finally { setBusy(null); }
  };

  const actual = list.find((c) => c.periodo === periodo);

  return (
    <div className="space-y-5">
      <div className="card p-5 flex flex-wrap items-end gap-4">
        <label className="label mb-0">Mes a cerrar
          <input type="month" className="input mt-1 h-9 text-sm w-44 normal-case tracking-normal font-medium" value={periodo} onChange={(e) => e.target.value && setPeriodo(e.target.value)} />
        </label>
        <button className="btn-primary" disabled={busy === 'calcular' || (actual && actual.estado === 'RECIBO_GENERADO')} onClick={() => void calcular()}>
          {busy === 'calcular' ? <Spinner size="sm" /> : Ic.cash()} {actual ? 'Recalcular cierre' : 'Calcular cierre'}
        </button>
        <Stepper paso={!actual ? 1 : actual.estado === 'BORRADOR' || actual.estado === 'ERROR' ? 2 : 3} simulado={actual?.estado === 'RECIBO_SIMULADO'} />
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Mes</th><th>Póliza</th><th className="text-right">Viajes</th><th className="text-right">Km</th><th className="text-right">Monto</th><th>Estado</th><th>Recibo</th><th className="text-right">Acciones</th></tr></thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={8} className="p-0"><EmptyState title="Sin cierres" sub="Calcula el cierre de un mes para ver el total y generar el recibo." /></td></tr>
            ) : list.map((c) => {
              const editable = c.estado !== 'RECIBO_GENERADO';
              const sel = detalle?.cierre.id === c.id;
              return (
                <tr key={c.id} className={sel ? 'bg-brand-50/40' : ''}>
                  <td className="font-bold text-slate-800">{mesLabel(c.periodo)}</td>
                  <td className="font-mono text-xs">{c.cnpoliza}</td>
                  <td className="text-right tabular-nums">{fmt(c.totalViajes)}</td>
                  <td className="text-right tabular-nums">{fmt(c.totalKm, 1)}</td>
                  <td className="text-right font-bold text-slate-900 tabular-nums">{money(c.monto, c.moneda)}</td>
                  <td><span className={ESTADO_CIERRE[c.estado]?.cls}>{ESTADO_CIERRE[c.estado]?.label}</span></td>
                  <td className="font-mono text-xs">{c.cnrecibo ?? '—'}</td>
                  <td className="text-right whitespace-nowrap space-x-1.5">
                    <button className="btn-ghost text-xs py-1.5" onClick={() => void verDetalle(c.id)}>Detalle</button>
                    {editable && (
                      <>
                        <button className="btn-secondary text-xs py-1.5" disabled={!!busy} onClick={() => void generar(c, 'SIMULADO')}>
                          {busy === c.id + 'SIMULADO' ? 'Generando…' : 'Simular recibo'}
                        </button>
                        <button className="btn-primary text-xs py-1.5" disabled={!!busy} onClick={() => void generar(c, 'REAL')}>
                          {busy === c.id + 'REAL' ? 'Generando…' : 'Recibo real'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {detalle && (
        <div className="card p-5 space-y-4 animate-in">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="section-title">{Ic.shield('w-3.5 h-3.5')} Recibo de {mesLabel(detalle.cierre.periodo)}</p>
              <p className="text-xs text-slate-500 mt-1">
                Póliza <span className="font-mono font-semibold text-slate-700">{detalle.cierre.cnpoliza}</span> · {detalle.cierre.desde} al {detalle.cierre.hasta} · un solo recibo por el total del mes
              </p>
            </div>
            <div className="text-right">
              <span className={ESTADO_CIERRE[detalle.cierre.estado]?.cls}>{ESTADO_CIERRE[detalle.cierre.estado]?.label}</span>
              {detalle.cierre.cnrecibo && <p className="font-mono text-xs text-slate-600 mt-1">{detalle.cierre.cnrecibo}</p>}
              {detalle.cierre.generadoEn && <p className="text-[11px] text-slate-500">{fecha(detalle.cierre.generadoEn)}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="stat-card"><p className="stat-label">Viajes</p><p className="stat-value text-2xl">{fmt(detalle.cierre.totalViajes)}</p></div>
            <div className="stat-card"><p className="stat-label">Km</p><p className="stat-value text-2xl">{fmt(detalle.cierre.totalKm, 1)}</p></div>
            <div className="stat-card"><p className="stat-label">Tiempo</p><p className="stat-value text-2xl">{dur(n(detalle.cierre.totalMinutos))}</p></div>
            <div className="stat-card gradient-brand text-white border-0"><p className="stat-label text-white/80">Total del recibo</p><p className="stat-value text-2xl text-white">{money(detalle.cierre.monto, detalle.cierre.moneda)}</p></div>
          </div>
          {detalle.cierre.error && <div className="alert-error text-xs text-red-700">{detalle.cierre.error}</div>}
          <div>
            <p className="text-xs font-extrabold text-slate-600 uppercase tracking-wide mb-2">Prorrateo por conductor <span className="font-medium normal-case text-slate-400">(detalle interno, no va al recibo)</span></p>
            <table className="data-table">
              <thead><tr><th>Conductor</th><th className="text-right">Viajes</th><th className="text-right">Monto</th><th className="w-56">Participación</th></tr></thead>
              <tbody>
                {detalle.resumen.conductores.map((c) => (
                  <tr key={(c.conductorDoc ?? '') + c.conductorNombre}>
                    <td className="font-semibold text-slate-800">{c.conductorNombre} <span className="text-[11px] text-slate-500 font-normal">{c.conductorDoc ?? ''}</span></td>
                    <td className="text-right">{fmt(c.viajes)}</td>
                    <td className="text-right font-bold tabular-nums">{money(c.costo, detalle.resumen.moneda)}</td>
                    <td><div className="flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden"><div className="h-2 gradient-brand rounded-full" style={{ width: `${Math.min(c.participacion, 100)}%` }} /></div><span className="text-xs font-bold text-brand-700 w-12 text-right">{c.participacion}%</span></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detalle.cierre.respuesta && (
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-600 font-semibold">Datos enviados para el recibo</summary>
              <pre className="code-block mt-2">{JSON.stringify(detalle.cierre.respuesta, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Stepper({ paso, simulado }: { paso: 1 | 2 | 3; simulado: boolean }) {
  const pasos = ['Viajes del mes', 'Cierre calculado', simulado ? 'Recibo simulado' : 'Recibo generado'];
  return (
    <ol className="flex items-center gap-2 ml-auto text-[11px] font-bold">
      {pasos.map((p, i) => {
        const done = i + 1 < paso, cur = i + 1 === paso;
        return (
          <li key={p} className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${done ? 'bg-emerald-500 text-white' : cur ? 'bg-brand-700 text-white' : 'bg-slate-200 text-slate-500'}`}>
              {done ? Ic.check('w-3 h-3') : i + 1}
            </span>
            <span className={done || cur ? 'text-slate-700' : 'text-slate-400'}>{p}</span>
            {i < 2 && <span className="w-6 h-px bg-slate-200" />}
          </li>
        );
      })}
    </ol>
  );
}

// ── Configuración de cobro ──────────────────────────────────────────────────
function ConfigTab({ pushNotif }: { pushNotif: PushNotif }) {
  const [cfg, setCfg] = useState<FlotaConfig | null>(null);
  const [hist, setHist] = useState<FlotaConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [ej, setEj] = useState({ min: 23, km: 9.4 });

  const load = useCallback(async () => {
    try {
      const [{ data }, h] = await Promise.all([flotaApi.config(), flotaApi.historialConfig()]);
      setCfg(data); setHist(h.data);
    } catch (e) {
      pushNotif('error', 'No se pudo cargar la configuración', errMsg(e));
    }
  }, [pushNotif]);

  useEffect(() => { void load(); }, [load]);

  if (!cfg) return <div className="card p-10 flex justify-center"><Spinner size="lg" /></div>;
  const set = (patch: Partial<FlotaConfig>) => setCfg({ ...cfg, ...patch });
  const unidad = cfg.modalidad === 'KM' ? 'km' : 'minuto';

  const guardar = async () => {
    setSaving(true);
    try {
      await flotaApi.guardarConfig({
        cnpoliza: cfg.cnpoliza, cplan: cfg.cplan || null, modalidad: cfg.modalidad, tarifa: n(cfg.tarifa), moneda: cfg.moneda,
        minimoPorViaje: n(cfg.minimoPorViaje), redondearUnidad: cfg.redondearUnidad, modoCierre: cfg.modoCierre, diaCierre: n(cfg.diaCierre) || 1,
      });
      pushNotif('success', 'Configuración guardada', 'Los viajes que terminen desde ahora usan esta tarifa.');
      await load();
    } catch (e) {
      pushNotif('error', 'No se pudo guardar', errMsg(e));
    } finally { setSaving(false); }
  };

  const unidades = cfg.modalidad === 'KM' ? ej.km : ej.min;
  const unidadesCobradas = cfg.redondearUnidad ? Math.ceil(unidades) : unidades;
  const bruto = unidadesCobradas * n(cfg.tarifa);
  const costo = Math.max(bruto, n(cfg.minimoPorViaje));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card p-5 xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <p className="md:col-span-2 section-title">{Ic.gear('w-3.5 h-3.5')} Cómo se cobra la flota</p>
          <label className="label">Póliza de flota<input className="input mt-1 normal-case tracking-normal font-medium" value={cfg.cnpoliza} onChange={(e) => set({ cnpoliza: e.target.value })} /></label>
          <label className="label">Plan<input className="input mt-1 normal-case tracking-normal font-medium" value={cfg.cplan ?? ''} onChange={(e) => set({ cplan: e.target.value })} /></label>
          <label className="label">Cobrar por
            <select className="input mt-1 normal-case tracking-normal font-medium" value={cfg.modalidad} onChange={(e) => set({ modalidad: e.target.value as FlotaConfig['modalidad'] })}>
              <option value="TIEMPO">Tiempo del viaje (minutos)</option><option value="KM">Kilómetros recorridos</option>
            </select>
          </label>
          <label className="label">Tarifa por {unidad}
            <input type="number" step="0.0001" min="0" className="input mt-1 normal-case tracking-normal font-medium" value={cfg.tarifa} onChange={(e) => set({ tarifa: e.target.value })} />
          </label>
          <label className="label">Moneda
            <select className="input mt-1 normal-case tracking-normal font-medium" value={cfg.moneda} onChange={(e) => set({ moneda: e.target.value })}>
              <option value="USD">USD</option><option value="EUR">EUR</option><option value="VES">VES</option>
            </select>
          </label>
          <label className="label">Mínimo por viaje
            <input type="number" step="0.01" min="0" className="input mt-1 normal-case tracking-normal font-medium" value={cfg.minimoPorViaje} onChange={(e) => set({ minimoPorViaje: e.target.value })} />
          </label>
          <label className="md:col-span-2 flex items-center gap-2 text-xs text-slate-700 font-medium">
            <input type="checkbox" checked={cfg.redondearUnidad} onChange={(e) => set({ redondearUnidad: e.target.checked })} />
            Cobrar el {unidad} iniciado (redondeo hacia arriba)
          </label>
          <label className="label">Cierre del mes
            <select className="input mt-1 normal-case tracking-normal font-medium" value={cfg.modoCierre} onChange={(e) => set({ modoCierre: e.target.value as FlotaConfig['modoCierre'] })}>
              <option value="MANUAL">Manual (se revisa y se genera desde Cierres)</option><option value="AUTO">Automático</option>
            </select>
          </label>
          <label className="label">Día del cierre automático
            <input type="number" min={1} max={28} className="input mt-1 normal-case tracking-normal font-medium" value={cfg.diaCierre} disabled={cfg.modoCierre !== 'AUTO'} onChange={(e) => set({ diaCierre: Number(e.target.value) })} />
            <span className="block text-[10.5px] font-medium normal-case tracking-normal text-slate-500 mt-1">Ese día se cierra el mes anterior y queda listo para el recibo.</span>
          </label>
          <div className="md:col-span-2 flex items-center gap-3 pt-1">
            <button className="btn-primary" disabled={saving} onClick={() => void guardar()}>{saving ? <Spinner size="sm" /> : Ic.check()} Guardar configuración</button>
            <span className="text-xs text-slate-500">Cada cambio queda registrado; los viajes ya finalizados no se recalculan.</span>
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <p className="section-title">{Ic.sparkle('w-3.5 h-3.5')} Calculadora</p>
          <p className="text-xs text-slate-500">Prueba cuánto costaría un viaje con esta configuración.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="label">Minutos<input type="number" min={0} className="input mt-1 normal-case tracking-normal font-medium" value={ej.min} onChange={(e) => setEj({ ...ej, min: n(e.target.value) })} /></label>
            <label className="label">Km<input type="number" min={0} step="0.1" className="input mt-1 normal-case tracking-normal font-medium" value={ej.km} onChange={(e) => setEj({ ...ej, km: n(e.target.value) })} /></label>
          </div>
          <div className="card-inset text-xs space-y-1.5">
            <Row k={`${cfg.modalidad === 'KM' ? 'Km' : 'Minutos'} del viaje`} v={fmt(unidades, 1)} />
            {cfg.redondearUnidad && <Row k="Redondeo hacia arriba" v={fmt(unidadesCobradas)} />}
            <Row k={`× tarifa ${fmt(cfg.tarifa, 4)}`} v={money(bruto, cfg.moneda)} />
            {n(cfg.minimoPorViaje) > bruto && <Row k="Aplica el mínimo" v={money(cfg.minimoPorViaje, cfg.moneda)} />}
          </div>
          <div className="gradient-brand text-white rounded-xl p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">Costo del viaje</p>
            <p className="text-2xl font-extrabold tabular-nums">{money(costo, cfg.moneda)}</p>
          </div>
        </div>
      </div>

      {hist.length > 0 && (
        <div className="card p-0 overflow-x-auto">
          <table className="data-table text-xs">
            <thead><tr><th>Fecha</th><th>Cobro</th><th className="text-right">Tarifa</th><th className="text-right">Mínimo</th><th>Redondeo</th><th>Cierre</th><th>Por</th><th>Vigente</th></tr></thead>
            <tbody>
              {hist.map((h) => (
                <tr key={h.id}>
                  <td>{fecha(h.creadoEn)}</td>
                  <td>{h.modalidad === 'KM' ? 'Por km' : 'Por minuto'}</td>
                  <td className="text-right">{fmt(h.tarifa, 4)} {h.moneda}</td>
                  <td className="text-right">{money(h.minimoPorViaje, h.moneda)}</td>
                  <td>{h.redondearUnidad ? 'Sí' : 'No'}</td>
                  <td>{h.modoCierre === 'AUTO' ? `Automático (día ${h.diaCierre})` : 'Manual'}</td>
                  <td>{h.creadoPor ?? '—'}</td>
                  <td>{h.id === cfg.id ? <span className="badge badge-green">Actual</span> : <span className="text-slate-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Simulador ───────────────────────────────────────────────────────────────
function SimuladorTab({ periodo, pushNotif, onDone }: { periodo: string; pushNotif: PushNotif; onDone: () => void }) {
  const [form, setForm] = useState({ cantidad: 120, periodo, conductores: 8, enCurso: 3 });
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<{ t: string; m: string; ok: boolean }[]>([]);
  const add = (m: string, ok = true) => setLog((l) => [{ t: new Date().toLocaleTimeString('es-VE'), m, ok }, ...l].slice(0, 20));

  useEffect(() => { setForm((f) => ({ ...f, periodo })); }, [periodo]);

  const simular = async () => {
    setBusy('simular');
    try {
      const { data } = await flotaApi.simular(form);
      add(`${data.finalizados} viajes finalizados y ${data.enCurso} en curso (${data.conductores} conductores) en ${mesLabel(data.periodo)}.`);
      pushNotif('success', 'Viajes simulados', `${data.finalizados} finalizados · ${data.enCurso} en curso`);
    } catch (e) {
      add(errMsg(e), false); pushNotif('error', 'No se pudo simular', errMsg(e));
    } finally { setBusy(null); }
  };

  /** Flujo completo: viajes del mes → cierre → recibo simulado. */
  const flujoCompleto = async () => {
    setBusy('completo');
    try {
      const sim = await flotaApi.simular(form);
      add(`1/3 · ${sim.data.finalizados} viajes simulados en ${mesLabel(sim.data.periodo)}.`);
      const cierre = await flotaApi.calcularCierre(form.periodo);
      add(`2/3 · Cierre calculado: ${cierre.data.totalViajes} viajes · ${money(cierre.data.monto, cierre.data.moneda)}.`);
      const recibo = await flotaApi.generarRecibo(cierre.data.id, 'SIMULADO');
      add(`3/3 · Recibo simulado ${recibo.data.cnrecibo} por ${money(recibo.data.monto, recibo.data.moneda)}.`);
      pushNotif('success', 'Simulación completa', `Recibo ${recibo.data.cnrecibo}`);
      onDone();
    } catch (e) {
      add(errMsg(e), false); pushNotif('error', 'La simulación se detuvo', errMsg(e));
    } finally { setBusy(null); }
  };

  const borrar = async () => {
    if (!window.confirm('¿Borrar los viajes simulados que no tienen recibo?')) return;
    setBusy('borrar');
    try { const { data } = await flotaApi.borrarSimulados(); add(`Borrados ${data.borrados} viajes simulados.`); }
    catch (e) { add(errMsg(e), false); pushNotif('error', 'No se pudo borrar', errMsg(e)); }
    finally { setBusy(null); }
  };

  const num = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: k === 'periodo' ? e.target.value : Number(e.target.value) });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="card p-5 xl:col-span-2 space-y-4">
        <div>
          <p className="section-title">{Ic.sparkle('w-3.5 h-3.5')} Simular la carga de un mes</p>
          <p className="text-xs text-slate-500 mt-1">Genera viajes de prueba (marcados "sim") con la tarifa vigente, calcula el cierre y genera un recibo simulado. <b>No llama a Sis2000.</b></p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="label">Viajes<input type="number" min={1} max={2000} className="input mt-1 normal-case tracking-normal font-medium" value={form.cantidad} onChange={num('cantidad')} /></label>
          <label className="label">Mes<input type="month" className="input mt-1 normal-case tracking-normal font-medium" value={form.periodo} onChange={num('periodo')} /></label>
          <label className="label">Conductores<input type="number" min={1} max={200} className="input mt-1 normal-case tracking-normal font-medium" value={form.conductores} onChange={num('conductores')} /></label>
          <label className="label">Quedan en curso<input type="number" min={0} max={200} className="input mt-1 normal-case tracking-normal font-medium" value={form.enCurso} onChange={num('enCurso')} /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!!busy} onClick={() => void flujoCompleto()}>{busy === 'completo' ? <Spinner size="sm" /> : Ic.play()} Simular mes completo y recibo</button>
          <button className="btn-secondary" disabled={!!busy} onClick={() => void simular()}>{busy === 'simular' ? <Spinner size="sm" /> : Ic.car()} Solo generar viajes</button>
          <button className="btn-ghost" disabled={!!busy} onClick={() => void borrar()}>{Ic.close('w-3 h-3')} Borrar simulados</button>
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          {['Viajes de varios conductores con inicio, fin, km y costo', 'Cierre del mes: un total para la póliza', 'Recibo simulado SIM-AAAA-MM-NNNN'].map((s, i) => (
            <li key={s} className="card-inset flex gap-2 items-start"><span className="step-num w-5 h-5 text-[10px]">{i + 1}</span><span className="text-slate-600">{s}</span></li>
          ))}
        </ol>
      </div>
      <div className="card p-5">
        <p className="section-title mb-3">{Ic.rows('w-3.5 h-3.5')} Registro</p>
        {log.length === 0 ? <p className="text-xs text-slate-400">Aquí verás cada paso de la simulación.</p> : (
          <ul className="space-y-2 text-xs">
            {log.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${l.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <div><p className="text-slate-700">{l.m}</p><p className="text-[10px] text-slate-400">{l.t}</p></div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
