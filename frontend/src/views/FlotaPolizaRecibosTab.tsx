import { useCallback, useEffect, useState } from 'react';
import type { Notif } from '../types';
import {
  EstadoReciboNexus, flotaApi, FlotaPolizaActual, FlotaRecibo, FlotaRecibosRespuesta,
} from '../api';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Ic } from '../components/ui/Icons';

/**
 * Fase 1 Ridery: registrar la póliza (ya emitida por La Mundial, validada con nest-api) y
 * consultar / exportar los recibos por viaje propios de Nexus (RDY-…), pendientes de sincronizar con Sis2000.
 */

type PushNotif = (tipo: Notif['tipo'], titulo: string, msg: string) => void;

const n = (v: unknown) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
const money = (v: unknown, moneda = 'USD') =>
  `${n(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`;
const fecha = (v?: string | null) => v ? new Date(v).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const errMsg = (e: unknown) => {
  const err = e as { response?: { data?: { message?: unknown } }; message?: string };
  const m = err.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : String(m ?? err.message ?? 'Error');
};
const inputCls = 'input mt-1 normal-case tracking-normal font-medium';

const ESTADO_NEXUS: Record<EstadoReciboNexus, { cls: string; label: string }> = {
  PENDIENTE: { cls: 'badge badge-yellow', label: 'Pendiente' },
  COBRADO: { cls: 'badge badge-green', label: 'Cobrado' },
  ANULADO: { cls: 'badge badge-gray', label: 'Anulado' },
};
const SYNC_LABEL: Record<FlotaRecibo['syncSis2000'], string> = {
  PENDIENTE: 'Por sincronizar', OK: 'En Sis2000', ERROR: 'Error al subir',
};

export function PolizaRecibosTab({ pushNotif }: { pushNotif: PushNotif }) {
  const [pol, setPol] = useState<FlotaPolizaActual | null>(null);
  const [form, setForm] = useState({ cnpoliza: '', tomadorNombre: '', tomadorRif: '', forzar: false });
  const [nueva, setNueva] = useState(() => {
    const d = new Date();
    const h = new Date(d);
    h.setFullYear(d.getFullYear() + 1);
    return { cplan: '', fdesde: d.toISOString().slice(0, 10), fhasta: h.toISOString().slice(0, 10) };
  });
  const [filtro, setFiltro] = useState({ ccerti: '', desde: '', hasta: '', estado: '' });
  const [data, setData] = useState<FlotaRecibosRespuesta | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const cargarPoliza = useCallback(async () => {
    try {
      const { data: p } = await flotaApi.poliza();
      setPol(p);
      setForm((f) => ({
        ...f,
        cnpoliza: f.cnpoliza || p.cnpoliza,
        tomadorNombre: f.tomadorNombre || p.registro?.tomadorNombre || '',
        tomadorRif: f.tomadorRif || p.registro?.tomadorRif || '',
      }));
    } catch (e) { pushNotif('error', 'Póliza', errMsg(e)); }
  }, [pushNotif]);

  const cargarRecibos = useCallback(async () => {
    try {
      const { data: r } = await flotaApi.recibos({ ...filtro, limit: 500 });
      setData(r);
    } catch (e) { pushNotif('error', 'Recibos', errMsg(e)); }
  }, [filtro, pushNotif]);

  useEffect(() => { void cargarPoliza(); }, [cargarPoliza]);
  useEffect(() => { void cargarRecibos(); }, [cargarRecibos]);

  const registrar = async () => {
    setBusy('registrar');
    try {
      const { data: r } = await flotaApi.registrarPoliza({
        cnpoliza: form.cnpoliza.trim(), tomadorNombre: form.tomadorNombre, tomadorRif: form.tomadorRif, forzar: form.forzar,
      });
      pushNotif(r.validada ? 'success' : 'warning', 'Póliza registrada',
        r.validada ? `${r.poliza.cnpoliza} validada en Sis2000.` : `${r.poliza.cnpoliza} registrada SIN validar en Sis2000.`);
      await cargarPoliza();
      await cargarRecibos();
    } catch (e) { pushNotif('error', 'No se pudo registrar', errMsg(e)); } finally { setBusy(null); }
  };

  const crear = async () => {
    if (!window.confirm('Se creará la póliza de flota en Sis2000 (sin recibos) y quedará como póliza de la flota. ¿Continuar?')) return;
    setBusy('crear');
    try {
      const { data: r } = await flotaApi.crearPoliza({
        tomadorRif: form.tomadorRif.trim(), tomadorNombre: form.tomadorNombre, cplan: nueva.cplan.trim(),
        fdesde: nueva.fdesde, fhasta: nueva.fhasta,
      });
      pushNotif('success', 'Póliza creada en Sis2000', r.creada.cnpoliza);
      setForm((f) => ({ ...f, cnpoliza: r.creada.cnpoliza }));
      await cargarPoliza();
      await cargarRecibos();
    } catch (e) { pushNotif('error', 'No se pudo crear la póliza', errMsg(e)); } finally { setBusy(null); }
  };

  const sincronizar = async () => {
    setBusy('sync');
    try {
      const { data: r } = await flotaApi.sincronizarRecibos();
      const conError = r.error ? ` · ${r.error} con error` : '';
      pushNotif(r.error ? 'warning' : 'success', 'Sincronizar pendientes',
        r.intentados ? `${r.ok} de ${r.intentados} recibos subidos a Sis2000${conError}.` : 'No hay recibos pendientes.');
      await cargarRecibos();
    } catch (e) { pushNotif('error', 'Sincronizar pendientes', errMsg(e)); } finally { setBusy(null); }
  };

  const csv = async () => {
    setBusy('csv');
    try {
      const { data: blob } = await flotaApi.recibosCsv(filtro);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recibos_${pol?.cnpoliza ?? 'flota'}${filtro.ccerti ? `_cert${filtro.ccerti}` : ''}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { pushNotif('error', 'CSV', errMsg(e)); } finally { setBusy(null); }
  };

  const anular = async (r: FlotaRecibo) => {
    const motivo = window.prompt(`Motivo para anular ${r.numero}:`);
    if (!motivo?.trim()) return;
    setBusy(r.id);
    try {
      await flotaApi.anularRecibo(r.id, motivo.trim());
      pushNotif('success', 'Recibo anulado', r.numero);
      await cargarRecibos();
    } catch (e) { pushNotif('error', 'No se pudo anular', errMsg(e)); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div>
          <h3 className="font-bold text-slate-900">Póliza de la flota</h3>
          <p className="text-xs text-slate-500 mt-1">
            Registre la póliza que La Mundial ya emitió en Sis2000: se valida con nest-api y no se escribe nada en Sis2000.
            Certificados y recibos por viaje se llevan en Nexus.
          </p>
        </div>
        {pol && (
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="badge badge-blue">Actual: {pol.cnpoliza}</span>
            <span className={`badge ${pol.registro?.validada ? 'badge-green' : pol.registrada ? 'badge-yellow' : 'badge-gray'}`}>
              {pol.registro?.validada ? 'Validada en Sis2000' : pol.registrada ? 'Registrada sin validar' : 'Sin registrar'}
            </span>
            <span className="badge badge-gray">{pol.certificados} certificados</span>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <label className="label">N° de póliza
            <input className={inputCls} value={form.cnpoliza} onChange={(e) => setForm({ ...form, cnpoliza: e.target.value })} />
          </label>
          <label className="label">Tomador
            <input className={inputCls} value={form.tomadorNombre} onChange={(e) => setForm({ ...form, tomadorNombre: e.target.value })} />
          </label>
          <label className="label">RIF
            <input className={inputCls} value={form.tomadorRif} onChange={(e) => setForm({ ...form, tomadorRif: e.target.value })} />
          </label>
          <button className="btn-primary" disabled={busy === 'registrar' || !form.cnpoliza.trim()} onClick={() => void registrar()}>
            {busy === 'registrar' ? <Spinner size="sm" /> : Ic.shield()} Registrar póliza
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={form.forzar} onChange={(e) => setForm({ ...form, forzar: e.target.checked })} />
          Registrar aunque nest-api no pueda validarla (solo pruebas)
        </label>
        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500 mb-2">
            O cree la póliza en Sis2000 sin recibos, con el tomador y el RIF de arriba. Los certificados se incluyen desde
            Certificados y cada viaje pagado genera su recibo.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <label className="label">Plan
              <input className={inputCls} value={nueva.cplan} onChange={(e) => setNueva({ ...nueva, cplan: e.target.value })} />
            </label>
            <label className="label">Vigencia desde
              <input type="date" className={inputCls} value={nueva.fdesde} onChange={(e) => setNueva({ ...nueva, fdesde: e.target.value })} />
            </label>
            <label className="label">Hasta
              <input type="date" className={inputCls} value={nueva.fhasta} onChange={(e) => setNueva({ ...nueva, fhasta: e.target.value })} />
            </label>
            <button
              className="btn-secondary"
              disabled={busy === 'crear' || !nueva.cplan.trim() || !form.tomadorRif.trim()}
              onClick={() => void crear()}
            >
              {busy === 'crear' ? <Spinner size="sm" /> : Ic.shield()} Crear póliza en Sis2000
            </button>
          </div>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <h3 className="font-bold text-slate-900">Recibos por viaje (Nexus)</h3>
            <p className="text-xs text-slate-500 mt-1">Numeración propia por certificado, pendientes de sincronizar con Sis2000.</p>
          </div>
          <label className="label">Certificado
            <input type="number" min={0} className={inputCls} value={filtro.ccerti} onChange={(e) => setFiltro({ ...filtro, ccerti: e.target.value })} />
          </label>
          <label className="label">Desde
            <input type="date" className={inputCls} value={filtro.desde} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })} />
          </label>
          <label className="label">Hasta
            <input type="date" className={inputCls} value={filtro.hasta} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })} />
          </label>
          <label className="label">Estado
            <select className={inputCls} value={filtro.estado} onChange={(e) => setFiltro({ ...filtro, estado: e.target.value })}>
              <option value="">Todos</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="COBRADO">Cobrado</option>
              <option value="ANULADO">Anulado</option>
            </select>
          </label>
          <button
            className="btn-secondary"
            disabled={busy === 'sync'}
            onClick={() => void sincronizar()}
            title="Reintenta en Sis2000 los recibos cobrados por sincronizar o con error (FLOTA_RECIBO_REAL=1)"
          >
            {busy === 'sync' ? <Spinner size="sm" /> : Ic.shield()} Sincronizar pendientes
          </button>
          <button className="btn-secondary" disabled={busy === 'csv'} onClick={() => void csv()}>
            {busy === 'csv' ? <Spinner size="sm" /> : Ic.rows()} Exportar CSV
          </button>
        </div>
        {data && (
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="badge badge-green">Cobrados {data.totales.COBRADO} · {money(data.totales.montoCobrado)}</span>
            <span className="badge badge-yellow">Pendientes {data.totales.PENDIENTE} · {money(data.totales.montoPendiente)}</span>
            <span className="badge badge-gray">Anulados {data.totales.ANULADO}</span>
            {data.total > data.devueltos && (
              <span className="text-slate-500 self-center">Mostrando {data.devueltos} de {data.total}; el CSV trae todos.</span>
            )}
          </div>
        )}
        {!data ? <Spinner /> : data.recibos.length === 0 ? (
          <EmptyState title="Sin recibos" sub="Los recibos nacen al finalizar un viaje con certificado y se cobran con el pago de la plataforma." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-xs">
              <thead><tr>
                <th>N° recibo</th><th>Cert.</th><th>Viaje</th><th>Desde</th><th className="text-right">Monto</th>
                <th>Estado</th><th>Cobro</th><th>Ref. pago</th><th>Sis2000</th><th />
              </tr></thead>
              <tbody>
                {data.recibos.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono">{r.numero}</td>
                    <td className="text-right">{r.ccerti}</td>
                    <td className="font-mono">{r.idExterno}</td>
                    <td>{fecha(r.fdesde)}</td>
                    <td className="text-right">{money(r.monto, r.moneda)}</td>
                    <td><span className={ESTADO_NEXUS[r.estado].cls} title={r.motivoAnulacion ?? ''}>{ESTADO_NEXUS[r.estado].label}</span></td>
                    <td>{fecha(r.fechaCobro)}</td>
                    <td className="font-mono">{r.referenciaPago ?? '—'}</td>
                    <td title={r.syncError ?? ''}>{r.syncSis2000 === 'OK' ? (r.cnreciboSis2000 ?? 'OK') : SYNC_LABEL[r.syncSis2000]}</td>
                    <td>
                      {r.estado !== 'ANULADO' && r.syncSis2000 !== 'OK' && (
                        <button className="btn-ghost text-xs" disabled={busy === r.id} onClick={() => void anular(r)}>Anular</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
