import { useCallback, useEffect, useState } from 'react';
import type { Notif } from '../types';
import {
  flotaApi, Clasificacion, FlotaCertificado, FlotaCotizacion, FlotaPagoViaje, FlotaTarifaDistancia, RedondeoKm,
} from '../api';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Ic } from '../components/ui/Icons';

/**
 * Cobro POR VIAJE de la póliza de flota (Ridery): clasificación de distancia (urbano / extra urbano),
 * conductor → certificado de la póliza y recibos por viaje. Misma identidad visual que FlotaPanel.
 */

type PushNotif = (tipo: Notif['tipo'], titulo: string, msg: string) => void;

const n = (v: unknown) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
const fmt = (v: unknown, d = 2) => n(v).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (v: unknown, moneda = 'USD') => `${fmt(v, 2)} ${moneda}`;
const fecha = (v?: string | null) => v ? new Date(v).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const errMsg = (e: unknown) => {
  const err = e as { response?: { data?: { message?: unknown } }; message?: string };
  const m = err.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : String(m ?? err.message ?? 'Error');
};
const inputCls = 'input mt-1 normal-case tracking-normal font-medium';

const REDONDEO: Record<RedondeoKm, string> = {
  KM_ARRIBA: 'Se cobra el km iniciado',
  KM_CERCANO: 'Km entero más cercano',
  NINGUNO: 'Km exactos',
};

// ── Clasificación de distancia y tarifas ─────────────────────────────────────
export function DistanciaTab({ pushNotif }: { pushNotif: PushNotif }) {
  const [rows, setRows] = useState<FlotaTarifaDistancia[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [km, setKm] = useState(9.1);
  const [clasifCot, setClasifCot] = useState<'' | Clasificacion>('');
  const [cot, setCot] = useState<FlotaCotizacion | null>(null);

  const load = useCallback(async () => {
    try { const { data } = await flotaApi.tarifasDistancia(); setRows(data); }
    catch (e) { pushNotif('error', 'No se pudo cargar la clasificación', errMsg(e)); }
  }, [pushNotif]);
  useEffect(() => { void load(); }, [load]);

  if (!rows) return <div className="card p-10 flex justify-center"><Spinner size="lg" /></div>;
  const set = (i: number, patch: Partial<FlotaTarifaDistancia>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const moneda = rows[0]?.moneda || 'USD';

  const guardar = async () => {
    setSaving(true);
    try {
      const { data } = await flotaApi.guardarTarifasDistancia(rows.map((r) => ({
        clasificacion: r.clasificacion, nombre: r.nombre, kmDesde: n(r.kmDesde),
        kmHasta: r.kmHasta === null || r.kmHasta === '' ? null : n(r.kmHasta),
        tarifaKm: n(r.tarifaKm), minimo: n(r.minimo), redondeo: r.redondeo, moneda, activa: r.activa,
      })));
      setRows(data);
      pushNotif('success', 'Clasificación guardada', 'Los viajes que terminen desde ahora usan estas tarifas.');
    } catch (e) {
      pushNotif('error', 'No se pudo guardar', errMsg(e));
    } finally { setSaving(false); }
  };

  const cotizar = async () => {
    try { const { data } = await flotaApi.cotizarDistancia(km, clasifCot || undefined); setCot(data); }
    catch (e) { setCot(null); pushNotif('error', 'No se pudo calcular', errMsg(e)); }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="card p-5 xl:col-span-2 space-y-4">
        <p className="section-title">{Ic.car('w-3.5 h-3.5')} Clasificación de distancia y tarifa por km</p>
        <p className="text-xs text-slate-500">
          Ridery informa el viaje y devolvemos el monto: km × tarifa de su clasificación (o el mínimo). Si Ridery no manda
          la clasificación (URBANO, EXTRA_URBANO o INTERURBANO), se decide por el rango de km. La tarifa se aplica al viaje completo.
          Para usar Interurbano: actívelo y ajuste el "km hasta" de Extra urbano para que los rangos no se solapen.
        </p>
        {rows.map((r, i) => (
          <div key={r.clasificacion} className="card-inset grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="label md:col-span-2">Clasificación
              <input className={inputCls} value={r.nombre} onChange={(e) => set(i, { nombre: e.target.value })} />
              <span className="block text-[10.5px] font-medium normal-case tracking-normal text-slate-500 mt-1">{r.clasificacion}</span>
            </label>
            <label className="label">Km desde
              <input type="number" min={0} step="0.1" className={inputCls} value={r.kmDesde} onChange={(e) => set(i, { kmDesde: e.target.value })} />
            </label>
            <label className="label">Km hasta
              <input type="number" min={0} step="0.1" className={inputCls} placeholder="Sin tope" value={r.kmHasta ?? ''}
                onChange={(e) => set(i, { kmHasta: e.target.value === '' ? null : e.target.value })} />
            </label>
            <label className="label">Tarifa por km
              <input type="number" min={0} step="0.0001" className={inputCls} value={r.tarifaKm} onChange={(e) => set(i, { tarifaKm: e.target.value })} />
            </label>
            <label className="label">Mínimo por viaje
              <input type="number" min={0} step="0.01" className={inputCls} value={r.minimo} onChange={(e) => set(i, { minimo: e.target.value })} />
            </label>
            <label className="label">Redondeo
              <select className={inputCls} value={r.redondeo} onChange={(e) => set(i, { redondeo: e.target.value as RedondeoKm })}>
                {(Object.keys(REDONDEO) as RedondeoKm[]).map((k) => <option key={k} value={k}>{REDONDEO[k]}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 font-medium self-end pb-2">
              <input type="checkbox" checked={r.activa} onChange={(e) => set(i, { activa: e.target.checked })} /> Activa
            </label>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-3">
          <label className="label mb-0">Moneda
            <select className={`${inputCls} w-32`} value={moneda} onChange={(e) => setRows(rows.map((r) => ({ ...r, moneda: e.target.value })))}>
              <option value="USD">USD</option><option value="VES">VES</option>
            </select>
          </label>
          <button className="btn-primary" disabled={saving} onClick={() => void guardar()}>
            {saving ? <Spinner size="sm" /> : Ic.check()} Guardar clasificación
          </button>
          {rows[0]?.actualizadoEn && <span className="text-xs text-slate-500">Última modificación: {fecha(rows[0].actualizadoEn)}</span>}
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <p className="section-title">{Ic.sparkle('w-3.5 h-3.5')} Calculadora</p>
        <p className="text-xs text-slate-500">Lo que devolvería la API a Ridery para un viaje de estos km (con lo guardado).</p>
        <div className="flex items-end gap-2">
          <label className="label mb-0 flex-1">Km del viaje
            <input type="number" min={0} step="0.1" className={inputCls} value={km} onChange={(e) => setKm(n(e.target.value))} />
          </label>
          <button className="btn-secondary" onClick={() => void cotizar()}>Calcular</button>
        </div>
        <label className="label mb-0">Clasificación
          <select className={inputCls} value={clasifCot} onChange={(e) => setClasifCot(e.target.value as '' | Clasificacion)}>
            <option value="">Automática por rango de km</option>
            {rows.filter((r) => r.activa).map((r) => <option key={r.clasificacion} value={r.clasificacion}>{r.nombre}</option>)}
          </select>
        </label>
        {cot && (
          <>
            <div className="card-inset text-xs space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-500">Clasificación</span><b>{cot.nombre}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Km cobrados</span><b>{fmt(cot.kmCobrados, 1)}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">× tarifa</span><b>{fmt(cot.tarifaKm, 4)} {cot.moneda}</b></div>
              {cot.minimoAplicado && <div className="flex justify-between"><span className="text-slate-500">Aplica el mínimo</span><b>{money(cot.minimo, cot.moneda)}</b></div>}
            </div>
            <div className="gradient-brand text-white rounded-xl p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">Monto del viaje</p>
              <p className="text-2xl font-extrabold tabular-nums">{money(cot.monto, cot.moneda)}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Certificados (conductor → certificado de la póliza) ──────────────────────
export function CertificadosTab({ pushNotif }: { pushNotif: PushNotif }) {
  const [list, setList] = useState<FlotaCertificado[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ ccerti: '', placa: '', conductorDoc: '', conductorNombre: '' });

  const load = useCallback(async () => {
    try { const { data } = await flotaApi.certificados(); setList(data); }
    catch (e) { pushNotif('error', 'No se pudieron cargar los certificados', errMsg(e)); }
  }, [pushNotif]);
  useEffect(() => { void load(); }, [load]);

  const guardar = async () => {
    // Sin número: Nexus asigna el siguiente certificado de la póliza.
    setBusy('guardar');
    try {
      await flotaApi.guardarCertificado({
        ccerti: form.ccerti === '' ? undefined : Number(form.ccerti), placa: form.placa, conductorDoc: form.conductorDoc, conductorNombre: form.conductorNombre, activo: true,
      });
      pushNotif('success', 'Certificado guardado', `Certificado ${form.ccerti || 'nuevo (número automático)'}`);
      setForm({ ccerti: '', placa: '', conductorDoc: '', conductorNombre: '' });
      await load();
    } catch (e) { pushNotif('error', 'No se pudo guardar', errMsg(e)); } finally { setBusy(null); }
  };

  const sincronizar = async () => {
    setBusy('sync');
    try {
      const { data } = await flotaApi.sincronizarCertificados();
      pushNotif('success', 'Certificados sincronizados', `${data.leidos} leídos de ${data.cnpoliza}: ${data.nuevos} nuevos, ${data.actualizados} actualizados.`);
      await load();
    } catch (e) { pushNotif('error', 'No se pudo sincronizar con Sis2000', errMsg(e)); } finally { setBusy(null); }
  };

  const desactivar = async (c: FlotaCertificado) => {
    setBusy(c.id);
    try { await flotaApi.desactivarCertificado(c.id); await load(); }
    catch (e) { pushNotif('error', 'No se pudo desactivar', errMsg(e)); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="section-title">{Ic.shield('w-3.5 h-3.5')} Conductor → certificado de la póliza</p>
          <button className="btn-secondary" disabled={busy === 'sync'} onClick={() => void sincronizar()}>
            {busy === 'sync' ? <Spinner size="sm" /> : Ic.refresh()} Traer de Sis2000
          </button>
        </div>
        <p className="text-xs text-slate-500">
          El recibo de cada viaje se genera sobre el certificado del conductor. Se busca primero por cédula y, si no, por placa.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <label className="label">Certificado<input type="number" min={0} className={inputCls} placeholder="auto" value={form.ccerti} onChange={(e) => setForm({ ...form, ccerti: e.target.value })} /></label>
          <label className="label">Placa<input className={inputCls} value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value })} /></label>
          <label className="label">Cédula del conductor<input className={inputCls} value={form.conductorDoc} onChange={(e) => setForm({ ...form, conductorDoc: e.target.value })} /></label>
          <label className="label">Nombre<input className={inputCls} value={form.conductorNombre} onChange={(e) => setForm({ ...form, conductorNombre: e.target.value })} /></label>
          <button className="btn-primary" disabled={busy === 'guardar'} onClick={() => void guardar()}>
            {busy === 'guardar' ? <Spinner size="sm" /> : Ic.plus()} Guardar
          </button>
        </div>
      </div>

      {!list ? <div className="card p-10 flex justify-center"><Spinner size="lg" /></div>
        : list.length === 0 ? <EmptyState title="Sin certificados asociados" sub="Tráigalos de Sis2000 o agréguelos a mano." />
        : (
          <div className="card p-0 overflow-x-auto">
            <table className="data-table text-xs">
              <thead><tr><th>Póliza</th><th className="text-right">Cert.</th><th>Placa</th><th>Cédula</th><th>Conductor</th><th>Sis2000</th><th>Origen</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>{c.cnpoliza}</td>
                    <td className="text-right font-bold">{c.ccerti}</td>
                    <td>{c.placa ?? '—'}</td>
                    <td>{c.conductorDoc ?? '—'}</td>
                    <td>{c.conductorNombre ?? '—'}</td>
                    <td>{c.istatcer ?? '—'}</td>
                    <td>{c.origen === 'SIS2000' ? 'Sis2000' : 'Manual'}</td>
                    <td>{c.activo ? <span className="badge badge-green">Activo</span> : <span className="badge badge-gray">Inactivo</span>}</td>
                    <td>{c.activo && (
                      <button className="btn-ghost text-xs" disabled={busy === c.id} onClick={() => void desactivar(c)}>Desactivar</button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

// ── Recibos por viaje ────────────────────────────────────────────────────────
const ESTADO_RECIBO: Record<FlotaPagoViaje['estado'], { cls: string; label: string }> = {
  RECIBO_SIMULADO: { cls: 'badge badge-blue', label: 'Simulado' },
  RECIBO_GENERADO: { cls: 'badge badge-green', label: 'Generado' },
  RECIBO_NEXUS: { cls: 'badge badge-blue', label: 'Nexus · por sincronizar' },
  ERROR: { cls: 'badge badge-red', label: 'Error' },
};

export function RecibosViajeTab({ pushNotif }: { pushNotif: PushNotif }) {
  const [list, setList] = useState<FlotaPagoViaje[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const { data } = await flotaApi.pagos(200); setList(data); }
    catch (e) { pushNotif('error', 'No se pudieron cargar los recibos', errMsg(e)); }
  }, [pushNotif]);
  useEffect(() => { void load(); }, [load]);

  const reintentar = async (p: FlotaPagoViaje) => {
    setBusy(p.id);
    try { await flotaApi.reintentarRecibo(p.id); pushNotif('success', 'Recibo reintentado', p.idExterno); await load(); }
    catch (e) { pushNotif('error', 'No se pudo reintentar', errMsg(e)); await load(); } finally { setBusy(null); }
  };

  if (!list) return <div className="card p-10 flex justify-center"><Spinner size="lg" /></div>;
  if (list.length === 0) {
    return <EmptyState title="Aún no hay pagos de viajes" sub="Cuando Ridery informe el pago de un viaje, aquí aparece su recibo sobre el certificado del conductor." />;
  }
  const total = list.reduce((a, p) => a + n(p.monto), 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{list.length} pagos · {money(total, list[0]?.moneda)}</p>
        <button className="btn-ghost text-xs" onClick={() => void load()}>{Ic.refresh('w-3.5 h-3.5')} Actualizar</button>
      </div>
      <div className="card p-0 overflow-x-auto">
        <table className="data-table text-xs">
          <thead><tr><th>Pago</th><th>Viaje</th><th className="text-right">Monto</th><th>Referencia</th><th>Póliza / cert.</th><th>Recibo</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>{fecha(p.fechaPago)}</td>
                <td className="font-mono">{p.idExterno}</td>
                <td className="text-right font-bold">{money(p.monto, p.moneda)}</td>
                <td>{p.referencia}</td>
                <td>{p.cnpoliza ?? '—'}{p.ccerti != null ? ` · ${p.ccerti}` : ''}</td>
                <td className="font-mono">{p.cnrecibo ?? '—'}</td>
                <td>
                  <span className={ESTADO_RECIBO[p.estado].cls}>{ESTADO_RECIBO[p.estado].label}</span>
                  {p.error && <span className="block text-[10.5px] text-red-600 mt-1 max-w-xs">{p.error}</span>}
                </td>
                <td>{p.estado === 'ERROR' && (
                  <button className="btn-secondary text-xs" disabled={busy === p.id} onClick={() => void reintentar(p)}>
                    {busy === p.id ? <Spinner size="sm" /> : Ic.refresh('w-3.5 h-3.5')} Reintentar
                  </button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

