import React, { useCallback, useEffect, useState } from 'react';
import type { Notif } from '../types';
import {
  flotaApi, FlotaCierre, FlotaConfig, FlotaResumen, FlotaViaje,
} from '../api';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Ic } from '../components/ui/Icons';

type SubTab = 'resumen' | 'feed' | 'cierres' | 'config' | 'simulador';

const SUBTABS: { id: SubTab; label: string }[] = [
  { id: 'resumen', label: 'Resumen del mes' },
  { id: 'feed', label: 'Feed de viajes' },
  { id: 'cierres', label: 'Cierres y recibo' },
  { id: 'config', label: 'Configuración de cobro' },
  { id: 'simulador', label: 'Simulador' },
];

const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

const money = (v: unknown, moneda = 'USD') =>
  `${n(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`;

const fecha = (v?: string | null) =>
  v ? new Date(v).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const errMsg = (e: unknown) => {
  const err = e as { response?: { data?: { message?: unknown } }; message?: string };
  const m = err.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : String(m ?? err.message ?? 'Error');
};

const ESTADO_VIAJE: Record<string, string> = {
  INICIADO: 'badge badge-yellow',
  FINALIZADO: 'badge badge-green',
  CANCELADO: 'badge badge-gray',
};

const ESTADO_CIERRE: Record<string, string> = {
  BORRADOR: 'badge badge-yellow',
  RECIBO_GENERADO: 'badge badge-green',
  RECIBO_SIMULADO: 'badge badge-blue',
  ERROR: 'badge badge-red',
};

const ESTADO_CIERRE_LABEL: Record<string, string> = {
  BORRADOR: 'Borrador',
  RECIBO_GENERADO: 'Recibo generado',
  RECIBO_SIMULADO: 'Recibo simulado',
  ERROR: 'Error',
};

export function FlotaPanel({
  pushNotif,
  demoOn,
}: {
  pushNotif: (tipo: Notif['tipo'], titulo: string, msg: string) => void;
  demoOn: boolean;
}) {
  const [sub, setSub] = useState<SubTab>('resumen');

  if (demoOn) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm font-bold text-slate-700 mb-2">Flota por uso funciona con datos reales</p>
        <p className="text-xs text-slate-600">
          Desactiva el modo demo y conéctate con la API key del cliente (Ridery). Para probar sin Ridery usa la pestaña Simulador.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <PageHeader
        title="Flota por uso"
        subtitle="Viajes por conductor, cobro por tiempo o km y un recibo mensual por la póliza de flota."
      />
      <div className="flex flex-wrap gap-2 mb-5">
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={sub === t.id ? 'btn-primary' : 'btn-secondary'}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'resumen' && <ResumenTab pushNotif={pushNotif} />}
      {sub === 'feed' && <FeedTab pushNotif={pushNotif} />}
      {sub === 'cierres' && <CierresTab pushNotif={pushNotif} />}
      {sub === 'config' && <ConfigTab pushNotif={pushNotif} />}
      {sub === 'simulador' && <SimuladorTab pushNotif={pushNotif} onDone={() => setSub('cierres')} />}
    </div>
  );
}

type PushNotif = (tipo: Notif['tipo'], titulo: string, msg: string) => void;

// ── Resumen del mes ─────────────────────────────────────────────────────────
function ResumenTab({ pushNotif }: { pushNotif: PushNotif }) {
  const [periodo, setPeriodo] = useState(mesActual());
  const [data, setData] = useState<FlotaResumen | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await flotaApi.resumen(periodo);
      setData(data);
    } catch (e) {
      pushNotif('error', 'No se pudo cargar el resumen', errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [periodo, pushNotif]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-600">
          Mes
          <input type="month" className="input mt-1" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
        </label>
        <button className="btn-secondary" onClick={() => void load()}>{Ic.refresh()} Actualizar</button>
        {data && <span className="text-xs text-slate-500">Póliza {data.cnpoliza} · {data.desde} al {data.hasta}</span>}
      </div>

      {loading && !data ? <Spinner /> : data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="Viajes finalizados" value={data.totalViajes.toLocaleString('es-VE')} />
            <Kpi label="Km recorridos" value={data.totalKm.toLocaleString('es-VE')} />
            <Kpi label="Minutos" value={data.totalMinutos.toLocaleString('es-VE')} />
            <Kpi label="Total a cobrar" value={money(data.totalMonto, data.moneda)} strong />
            <Kpi label="En curso ahora" value={String(data.enCurso)} />
          </div>

          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="text-left p-3">Conductor</th>
                  <th className="text-left p-3">Placa(s)</th>
                  <th className="text-right p-3">Viajes</th>
                  <th className="text-right p-3">Km</th>
                  <th className="text-right p-3">Minutos</th>
                  <th className="text-right p-3">Monto</th>
                  <th className="text-left p-3 w-48">Participación en el recibo</th>
                </tr>
              </thead>
              <tbody>
                {data.conductores.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState title="Sin viajes en el mes" sub="Usa el Simulador o espera los viajes de la plataforma." /></td></tr>
                ) : data.conductores.map((c) => (
                  <tr key={(c.conductorDoc ?? '') + c.conductorNombre} className="border-t border-slate-100">
                    <td className="p-3">
                      <div className="font-semibold text-slate-800">{c.conductorNombre}</div>
                      <div className="text-xs text-slate-500">{c.conductorDoc ?? '—'}</div>
                    </td>
                    <td className="p-3 text-xs">{c.placas.join(', ')}</td>
                    <td className="p-3 text-right">{c.viajes}</td>
                    <td className="p-3 text-right">{c.km.toLocaleString('es-VE')}</td>
                    <td className="p-3 text-right">{c.minutos.toLocaleString('es-VE')}</td>
                    <td className="p-3 text-right font-semibold">{money(c.costo, data.moneda)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded bg-slate-100 overflow-hidden">
                          <div className="h-2 bg-indigo-500" style={{ width: `${Math.min(c.participacion, 100)}%` }} />
                        </div>
                        <span className="text-xs w-12 text-right">{c.participacion}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 ${strong ? 'text-xl font-bold text-indigo-700' : 'text-lg font-semibold text-slate-800'}`}>{value}</div>
    </div>
  );
}

// ── Feed de viajes ──────────────────────────────────────────────────────────
function FeedTab({ pushNotif }: { pushNotif: PushNotif }) {
  const [list, setList] = useState<FlotaViaje[]>([]);
  const [estado, setEstado] = useState('');
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await flotaApi.feed(100, estado || undefined);
      setList(data);
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

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-600">
          Estado
          <select className="input mt-1" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="INICIADO">En curso</option>
            <option value="FINALIZADO">Finalizados</option>
            <option value="CANCELADO">Cancelados</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Actualizar cada 10 s
        </label>
        <button className="btn-secondary" onClick={() => void load()}>{Ic.refresh()} Actualizar</button>
        {loading && <Spinner />}
      </div>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-3">Estado</th>
              <th className="text-left p-3">Conductor</th>
              <th className="text-left p-3">Placa</th>
              <th className="text-left p-3">Inicio</th>
              <th className="text-left p-3">Fin</th>
              <th className="text-left p-3">Recorrido</th>
              <th className="text-right p-3">Min</th>
              <th className="text-right p-3">Km</th>
              <th className="text-right p-3">Costo</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={9}><EmptyState title="Sin viajes" sub="Todavía no llegaron viajes." /></td></tr>
            ) : list.map((v) => (
              <tr key={v.id} className="border-t border-slate-100">
                <td className="p-3">
                  <span className={ESTADO_VIAJE[v.estado]}>{v.estado === 'INICIADO' ? 'En curso' : v.estado === 'FINALIZADO' ? 'Finalizado' : 'Cancelado'}</span>
                  {v.simulado && <span className="badge badge-gray ml-1">simulado</span>}
                </td>
                <td className="p-3">{v.conductorNombre ?? '—'}</td>
                <td className="p-3 font-mono text-xs">{v.placa}</td>
                <td className="p-3 text-xs">{fecha(v.inicio)}</td>
                <td className="p-3 text-xs">{fecha(v.fin)}</td>
                <td className="p-3 text-xs">{v.origen?.direccion ?? '—'} → {v.destino?.direccion ?? '…'}</td>
                <td className="p-3 text-right">{v.minutos ? n(v.minutos).toFixed(0) : '—'}</td>
                <td className="p-3 text-right">{v.km ? n(v.km).toFixed(1) : '—'}</td>
                <td className="p-3 text-right font-semibold">{v.costo ? money(v.costo, v.moneda ?? 'USD') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Cierres y recibo ────────────────────────────────────────────────────────
function CierresTab({ pushNotif }: { pushNotif: PushNotif }) {
  const [list, setList] = useState<FlotaCierre[]>([]);
  const [periodo, setPeriodo] = useState(mesActual());
  const [busy, setBusy] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<{ cierre: FlotaCierre; resumen: FlotaResumen } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await flotaApi.cierres();
      setList(data);
    } catch (e) {
      pushNotif('error', 'No se pudieron cargar los cierres', errMsg(e));
    }
  }, [pushNotif]);

  useEffect(() => { void load(); }, [load]);

  const calcular = async () => {
    setBusy('calcular');
    try {
      const { data } = await flotaApi.calcularCierre(periodo);
      pushNotif('success', `Cierre ${data.periodo} calculado`, `${data.totalViajes} viajes · ${money(data.monto, data.moneda)}`);
      await load();
      await verDetalle(data.id);
    } catch (e) {
      pushNotif('error', 'No se pudo calcular el cierre', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const generar = async (c: FlotaCierre, modo: 'SIMULADO' | 'REAL') => {
    if (modo === 'REAL' && !window.confirm(
      `Se generará un recibo REAL en Sis2000 por ${money(c.monto, c.moneda)} a la póliza ${c.cnpoliza}. ¿Continuar?`,
    )) return;
    setBusy(c.id + modo);
    try {
      const { data } = await flotaApi.generarRecibo(c.id, modo);
      pushNotif('success', modo === 'REAL' ? 'Recibo generado en Sis2000' : 'Recibo simulado', `Recibo ${data.cnrecibo ?? ''}`);
      await load();
      await verDetalle(c.id);
    } catch (e) {
      pushNotif('error', 'No se pudo generar el recibo', errMsg(e));
      await load();
    } finally {
      setBusy(null);
    }
  };

  const verDetalle = async (id: string) => {
    try {
      const { data } = await flotaApi.detalleCierre(id);
      setDetalle(data);
    } catch (e) {
      pushNotif('error', 'No se pudo cargar el detalle', errMsg(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-600">
          Mes a cerrar
          <input type="month" className="input mt-1" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
        </label>
        <button className="btn-primary" disabled={busy === 'calcular'} onClick={() => void calcular()}>
          {busy === 'calcular' ? 'Calculando…' : 'Calcular cierre'}
        </button>
        <span className="text-xs text-slate-500">Suma los viajes finalizados del mes. Mientras esté en borrador se puede recalcular.</span>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="text-left p-3">Mes</th>
              <th className="text-left p-3">Póliza</th>
              <th className="text-right p-3">Viajes</th>
              <th className="text-right p-3">Monto</th>
              <th className="text-left p-3">Estado</th>
              <th className="text-left p-3">Recibo</th>
              <th className="text-right p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={7}><EmptyState title="Sin cierres" sub="Calcula el cierre de un mes." /></td></tr>
            ) : list.map((c) => {
              const editable = c.estado !== 'RECIBO_GENERADO';
              return (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="p-3 font-semibold">{c.periodo}</td>
                  <td className="p-3 text-xs">{c.cnpoliza}</td>
                  <td className="p-3 text-right">{c.totalViajes}</td>
                  <td className="p-3 text-right font-semibold">{money(c.monto, c.moneda)}</td>
                  <td className="p-3"><span className={ESTADO_CIERRE[c.estado]}>{ESTADO_CIERRE_LABEL[c.estado]}</span></td>
                  <td className="p-3 font-mono text-xs">{c.cnrecibo ?? '—'}</td>
                  <td className="p-3 text-right whitespace-nowrap space-x-2">
                    <button className="btn-secondary" onClick={() => void verDetalle(c.id)}>Detalle</button>
                    {editable && (
                      <>
                        <button className="btn-primary" disabled={!!busy} onClick={() => void generar(c, 'SIMULADO')}>
                          {busy === c.id + 'SIMULADO' ? 'Generando…' : 'Simular recibo'}
                        </button>
                        <button className="btn-secondary" disabled={!!busy} onClick={() => void generar(c, 'REAL')}>
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
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-slate-800">Recibo del mes {detalle.cierre.periodo}</div>
              <div className="text-xs text-slate-500">
                Póliza {detalle.cierre.cnpoliza} · {detalle.cierre.desde} al {detalle.cierre.hasta} · un solo recibo por el total
              </div>
            </div>
            <span className={ESTADO_CIERRE[detalle.cierre.estado]}>{ESTADO_CIERRE_LABEL[detalle.cierre.estado]}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Viajes" value={String(detalle.cierre.totalViajes)} />
            <Kpi label="Km" value={n(detalle.cierre.totalKm).toLocaleString('es-VE')} />
            <Kpi label="Minutos" value={n(detalle.cierre.totalMinutos).toLocaleString('es-VE')} />
            <Kpi label="Total del recibo" value={money(detalle.cierre.monto, detalle.cierre.moneda)} strong />
          </div>
          {detalle.cierre.error && (
            <div className="rounded-lg bg-red-50 text-red-700 text-xs p-3">{detalle.cierre.error}</div>
          )}
          <div>
            <div className="text-xs font-semibold text-slate-600 mb-2">Prorrateo por conductor (detalle interno, no va al recibo)</div>
            <table className="w-full text-sm">
              <tbody>
                {detalle.resumen.conductores.map((c) => (
                  <tr key={(c.conductorDoc ?? '') + c.conductorNombre} className="border-t border-slate-100">
                    <td className="p-2">{c.conductorNombre}</td>
                    <td className="p-2 text-right text-xs">{c.viajes} viajes</td>
                    <td className="p-2 text-right">{money(c.costo, detalle.resumen.moneda)}</td>
                    <td className="p-2 text-right text-xs w-16">{c.participacion}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detalle.cierre.respuesta && (
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-600">Datos enviados para el recibo</summary>
              <pre className="mt-2 p-3 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto">
                {JSON.stringify(detalle.cierre.respuesta, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ── Configuración de cobro ──────────────────────────────────────────────────
function ConfigTab({ pushNotif }: { pushNotif: PushNotif }) {
  const [cfg, setCfg] = useState<FlotaConfig | null>(null);
  const [hist, setHist] = useState<FlotaConfig[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data }, h] = await Promise.all([flotaApi.config(), flotaApi.historialConfig()]);
      setCfg(data);
      setHist(h.data);
    } catch (e) {
      pushNotif('error', 'No se pudo cargar la configuración', errMsg(e));
    }
  }, [pushNotif]);

  useEffect(() => { void load(); }, [load]);

  if (!cfg) return <Spinner />;
  const set = (patch: Partial<FlotaConfig>) => setCfg({ ...cfg, ...patch });

  const guardar = async () => {
    setSaving(true);
    try {
      await flotaApi.guardarConfig({
        cnpoliza: cfg.cnpoliza,
        cplan: cfg.cplan || null,
        modalidad: cfg.modalidad,
        tarifa: n(cfg.tarifa),
        moneda: cfg.moneda,
        minimoPorViaje: n(cfg.minimoPorViaje),
        redondearUnidad: cfg.redondearUnidad,
        modoCierre: cfg.modoCierre,
        diaCierre: n(cfg.diaCierre) || 1,
      });
      pushNotif('success', 'Configuración guardada', 'Los viajes que terminen desde ahora usan esta tarifa.');
      await load();
    } catch (e) {
      pushNotif('error', 'No se pudo guardar', errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const unidad = cfg.modalidad === 'KM' ? 'km' : 'minuto';

  return (
    <div className="space-y-5">
      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-xs font-semibold text-slate-600">
          Póliza de flota
          <input className="input mt-1" value={cfg.cnpoliza} onChange={(e) => set({ cnpoliza: e.target.value })} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Plan
          <input className="input mt-1" value={cfg.cplan ?? ''} onChange={(e) => set({ cplan: e.target.value })} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Cobrar por
          <select className="input mt-1" value={cfg.modalidad} onChange={(e) => set({ modalidad: e.target.value as FlotaConfig['modalidad'] })}>
            <option value="TIEMPO">Tiempo del viaje (minutos)</option>
            <option value="KM">Kilómetros recorridos</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Tarifa por {unidad}
          <input type="number" step="0.0001" min="0" className="input mt-1" value={cfg.tarifa}
            onChange={(e) => set({ tarifa: e.target.value })} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Moneda
          <select className="input mt-1" value={cfg.moneda} onChange={(e) => set({ moneda: e.target.value })}>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="VES">VES</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Mínimo por viaje
          <input type="number" step="0.01" min="0" className="input mt-1" value={cfg.minimoPorViaje}
            onChange={(e) => set({ minimoPorViaje: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-600 md:col-span-2">
          <input type="checkbox" checked={cfg.redondearUnidad} onChange={(e) => set({ redondearUnidad: e.target.checked })} />
          Cobrar el {unidad} iniciado (redondeo hacia arriba)
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Cierre del mes
          <select className="input mt-1" value={cfg.modoCierre} onChange={(e) => set({ modoCierre: e.target.value as FlotaConfig['modoCierre'] })}>
            <option value="MANUAL">Manual (se revisa y se genera desde Cierres)</option>
            <option value="AUTO">Automático</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Día del cierre automático (cierra el mes anterior)
          <input type="number" min={1} max={28} className="input mt-1" value={cfg.diaCierre}
            disabled={cfg.modoCierre !== 'AUTO'} onChange={(e) => set({ diaCierre: Number(e.target.value) })} />
        </label>
        <div className="md:col-span-2 flex items-center gap-3">
          <button className="btn-primary" disabled={saving} onClick={() => void guardar()}>
            {saving ? 'Guardando…' : 'Guardar configuración'}
          </button>
          <span className="text-xs text-slate-500">
            Ejemplo: un viaje de 23 min y 9,4 km cuesta {(() => {
              let u = cfg.modalidad === 'KM' ? 9.4 : 23;
              if (cfg.redondearUnidad) u = Math.ceil(u);
              return money(Math.max(u * n(cfg.tarifa), n(cfg.minimoPorViaje)), cfg.moneda);
            })()}
          </span>
        </div>
      </div>

      {hist.length > 0 && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left p-3">Fecha</th><th className="text-left p-3">Cobro</th>
                <th className="text-right p-3">Tarifa</th><th className="text-right p-3">Mínimo</th>
                <th className="text-left p-3">Cierre</th><th className="text-left p-3">Por</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((h) => (
                <tr key={h.id} className="border-t border-slate-100">
                  <td className="p-3">{fecha(h.creadoEn)}</td>
                  <td className="p-3">{h.modalidad === 'KM' ? 'Por km' : 'Por minuto'}</td>
                  <td className="p-3 text-right">{n(h.tarifa)} {h.moneda}</td>
                  <td className="p-3 text-right">{n(h.minimoPorViaje)}</td>
                  <td className="p-3">{h.modoCierre === 'AUTO' ? `Automático (día ${h.diaCierre})` : 'Manual'}</td>
                  <td className="p-3">{h.creadoPor ?? '—'}</td>
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
function SimuladorTab({ pushNotif, onDone }: { pushNotif: PushNotif; onDone: () => void }) {
  const [form, setForm] = useState({ cantidad: 120, periodo: mesActual(), conductores: 8, enCurso: 3 });
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const add = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString('es-VE')} · ${s}`, ...l].slice(0, 20));

  const simular = async () => {
    setBusy('simular');
    try {
      const { data } = await flotaApi.simular(form);
      add(`Simulados ${data.finalizados} viajes finalizados y ${data.enCurso} en curso (${data.conductores} conductores) en ${data.periodo}.`);
      pushNotif('success', 'Viajes simulados', `${data.finalizados} finalizados · ${data.enCurso} en curso`);
    } catch (e) {
      pushNotif('error', 'No se pudo simular', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  /** Flujo completo: viajes del mes → cierre → recibo simulado. */
  const flujoCompleto = async () => {
    setBusy('completo');
    try {
      const sim = await flotaApi.simular(form);
      add(`1/3 · ${sim.data.finalizados} viajes simulados en ${sim.data.periodo}.`);
      const cierre = await flotaApi.calcularCierre(form.periodo);
      add(`2/3 · Cierre calculado: ${cierre.data.totalViajes} viajes · ${money(cierre.data.monto, cierre.data.moneda)}.`);
      const recibo = await flotaApi.generarRecibo(cierre.data.id, 'SIMULADO');
      add(`3/3 · Recibo simulado ${recibo.data.cnrecibo} por ${money(recibo.data.monto, recibo.data.moneda)}.`);
      pushNotif('success', 'Simulación completa', `Recibo ${recibo.data.cnrecibo}`);
      onDone();
    } catch (e) {
      add(`Error: ${errMsg(e)}`);
      pushNotif('error', 'La simulación se detuvo', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const borrar = async () => {
    if (!window.confirm('¿Borrar los viajes simulados que no tienen recibo?')) return;
    setBusy('borrar');
    try {
      const { data } = await flotaApi.borrarSimulados();
      add(`Borrados ${data.borrados} viajes simulados.`);
    } catch (e) {
      pushNotif('error', 'No se pudo borrar', errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const num = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: k === 'periodo' ? e.target.value : Number(e.target.value) });

  return (
    <div className="space-y-5">
      <div className="card p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
        <label className="text-xs font-semibold text-slate-600">
          Viajes a generar
          <input type="number" min={1} max={2000} className="input mt-1" value={form.cantidad} onChange={num('cantidad')} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Mes
          <input type="month" className="input mt-1" value={form.periodo} onChange={num('periodo')} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Conductores
          <input type="number" min={1} max={15} className="input mt-1" value={form.conductores} onChange={num('conductores')} />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Quedan en curso
          <input type="number" min={0} max={50} className="input mt-1" value={form.enCurso} onChange={num('enCurso')} />
        </label>
        <div className="md:col-span-4 flex flex-wrap gap-3">
          <button className="btn-primary" disabled={!!busy} onClick={() => void flujoCompleto()}>
            {busy === 'completo' ? 'Simulando…' : 'Simular mes completo y recibo'}
          </button>
          <button className="btn-secondary" disabled={!!busy} onClick={() => void simular()}>
            {busy === 'simular' ? 'Generando…' : 'Solo generar viajes'}
          </button>
          <button className="btn-secondary" disabled={!!busy} onClick={() => void borrar()}>
            Borrar simulados
          </button>
        </div>
        <p className="md:col-span-4 text-xs text-slate-500">
          Genera viajes de prueba (marcados como "simulado") con la tarifa vigente, calcula el cierre del mes y genera un
          recibo simulado. No llama a Sis2000.
        </p>
      </div>
      {log.length > 0 && (
        <div className="card p-4">
          <div className="text-xs font-semibold text-slate-600 mb-2">Registro</div>
          <ul className="text-xs text-slate-700 space-y-1">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
