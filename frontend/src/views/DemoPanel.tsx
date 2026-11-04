import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, flotaApi, flotaPresentacionApi, linkPublicoPoliza } from '../api';
import type { FlotaCertificado, FlotaPolizaItem, FlotaTarifaDistancia, FlotaTarifaDistanciaInput } from '../api';
import type { Notif } from '../types';
import { Ic } from '../components/ui/Icons';
import { CrearFlotaTab, descargarPlantilla } from './FlotaCrearFlotaTab';

/**
 * Demo en vivo (presentación Ridery): mismo flujo que scripts/demo-presentacion.sh pero desde la pantalla.
 * 1) Crear póliza nueva (plantilla Excel + asistente "Crear flota")  2) Cargar tarifas demo
 * 3) Simular viajes (INICIO → FIN → PAGO/recibo con log en vivo)     4) Link/QR público de la póliza activa.
 * Aditivo: no toca nada del resto de la pantalla.
 */

type PushNotif = (tipo: Notif['tipo'], titulo: string, msg: string) => void;

const errMsg = (e: unknown): string => {
  const r = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(r)) return r.join(', ');
  return r || (e as Error)?.message || 'Error desconocido';
};

/** Tarifas de demo: idénticas a scripts/demo-presentacion.sh (PUT /api/flota/tarifas-distancia). */
export const TARIFAS_DEMO: FlotaTarifaDistanciaInput[] = [
  { clasificacion: 'URBANO',       nombre: 'Urbano',       kmDesde: 0,  kmHasta: 20,   tarifaKm: 0.10, minimo: 1, redondeo: 'KM_ARRIBA', moneda: 'USD', activa: true },
  { clasificacion: 'EXTRA_URBANO', nombre: 'Extra urbano', kmDesde: 20, kmHasta: 80,   tarifaKm: 0.08, minimo: 3, redondeo: 'KM_ARRIBA', moneda: 'USD', activa: true },
  { clasificacion: 'INTERURBANO',  nombre: 'Interurbano',  kmDesde: 80, kmHasta: null, tarifaKm: 0.06, minimo: 6, redondeo: 'KM_ARRIBA', moneda: 'USD', activa: true },
];

/** Plan de viajes del script: índice de conductor, km, clasificación explícita y si se paga. Se repite cíclicamente. */
const PLAN_VIAJES: { km: number; clas?: 'URBANO' | 'EXTRA_URBANO' | 'INTERURBANO'; pagar: boolean }[] = [
  { km: 9,   pagar: true },                       // urbano por rango
  { km: 35,  pagar: true },                       // extra urbano por rango
  { km: 120, clas: 'INTERURBANO', pagar: true },  // interurbano explícito
  { km: 6,   clas: 'URBANO', pagar: true },       // urbano explícito
  { km: 45,  pagar: false },                      // extra urbano que queda POR COBRAR
  { km: 14,  pagar: true },
  { km: 60,  pagar: true },
  { km: 95,  pagar: true },
  { km: 3,   pagar: true },
  { km: 28,  pagar: false },
];

interface LogViaje {
  id: string; conductor: string; placa: string; cert: number; km: number;
  clasificacion?: string; monto?: number; recibo?: string; estadoRecibo?: string;
  estado: 'INICIO' | 'FIN' | 'PAGADO' | 'POR_COBRAR' | 'ERROR'; error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function DemoPanel({ pushNotif }: { pushNotif: PushNotif }) {
  // ── Póliza activa + link público ─────────────────────────────────────────
  const [polizas, setPolizas] = useState<FlotaPolizaItem[] | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [mostrarAsistente, setMostrarAsistente] = useState(false);
  const cargarPolizas = useCallback(async () => {
    try { const { data } = await flotaPresentacionApi.polizas(); setPolizas(data.polizas); }
    catch (e) { pushNotif('error', 'No se pudieron cargar las pólizas', errMsg(e)); setPolizas([]); }
  }, [pushNotif]);
  useEffect(() => { void cargarPolizas(); }, [cargarPolizas]);
  const activa = polizas?.find((p) => p.activa && p.enConfiguracion) ?? polizas?.find((p) => p.activa) ?? null;
  const link = activa?.tokenPublico ? linkPublicoPoliza(activa.tokenPublico) : null;
  useEffect(() => {
    setQr(null);
    if (link) QRCode.toDataURL(link, { margin: 1, width: 168, color: { dark: '#0F1A5A' } }).then(setQr).catch(() => setQr(null));
  }, [link]);

  // ── Tarifas ──────────────────────────────────────────────────────────────
  const [tarifas, setTarifas] = useState<FlotaTarifaDistancia[] | null>(null);
  const [cargandoTarifas, setCargandoTarifas] = useState(false);
  const cargarTarifas = useCallback(async () => {
    try { const { data } = await flotaApi.tarifasDistancia(); setTarifas(data); } catch { setTarifas([]); }
  }, []);
  useEffect(() => { void cargarTarifas(); }, [cargarTarifas]);
  const cargarTarifasDemo = async () => {
    setCargandoTarifas(true);
    try {
      const { data } = await flotaApi.guardarTarifasDistancia(TARIFAS_DEMO);
      setTarifas(data);
      pushNotif('success', 'Tarifas demo cargadas', 'Urbano 0,10 · Extra urbano 0,08 · Interurbano 0,06 USD/km');
    } catch (e) { pushNotif('error', 'No se pudieron cargar las tarifas', errMsg(e)); }
    finally { setCargandoTarifas(false); }
  };

  // ── Simulación de viajes ─────────────────────────────────────────────────
  const [cantidad, setCantidad] = useState(5);
  const [pausa, setPausa] = useState(3);
  const [corriendo, setCorriendo] = useState(false);
  const [log, setLog] = useState<LogViaje[]>([]);
  const cancelar = useRef(false);
  const actualizar = (id: string, patch: Partial<LogViaje>) =>
    setLog((l) => l.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const simular = async () => {
    cancelar.current = false;
    setCorriendo(true);
    setLog([]);
    try {
      // 1. Póliza activa y sus conductores (igual que el script).
      const { data: pol } = await flotaApi.poliza();
      if (!pol.registro?.activa) {
        pushNotif('error', 'Sin póliza activa', 'Cree la flota en "Crear póliza nueva" (o active una anterior).');
        return;
      }
      const { data: certs } = await api.get<FlotaCertificado[]>('/flota/certificados', { params: { cnpoliza: pol.cnpoliza } });
      const conds = certs.filter((c) => c.activo && c.placa && c.conductorDoc);
      if (!conds.length) {
        pushNotif('error', 'Sin conductores', `La póliza ${pol.cnpoliza} no tiene conductores activos con placa y cédula.`);
        return;
      }
      const pref = `PRES-${new Date().toISOString().slice(5, 19).replace(/[-T:]/g, '')}`;
      pushNotif('info', 'Simulación iniciada', `Póliza ${pol.cnpoliza} · ${conds.length} conductores · ${cantidad} viajes`);

      for (let n = 0; n < cantidad; n++) {
        if (cancelar.current) break;
        const plan = PLAN_VIAJES[n % PLAN_VIAJES.length];
        const c = conds[n % conds.length];
        const id = `${pref}-${n + 1}`;
        const clasJson = plan.clas ? { clasificacion: plan.clas } : {};
        const entrada: LogViaje = { id, conductor: c.conductorNombre || '', placa: c.placa!, cert: c.ccerti, km: plan.km, estado: 'INICIO' };
        setLog((l) => [entrada, ...l]);
        try {
          const ini = new Date(Date.now() - (Math.floor(plan.km / 2) + 5) * 60000).toISOString();
          await api.post('/flota/viajes/evento', {
            idViaje: id, tipo: 'INICIO', fecha: ini, placa: c.placa, conductorDoc: c.conductorDoc,
            conductorNombre: c.conductorNombre || '', kmEstimados: plan.km, ...clasJson,
          });
          await sleep(pausa * 1000);
          const { data: fin } = await api.post<{ monto?: number | string; clasificacion?: string }>('/flota/viajes/evento', {
            idViaje: id, tipo: 'FIN', fecha: new Date().toISOString(), km: plan.km, ...clasJson,
          });
          const monto = fin?.monto != null ? Number(fin.monto) : undefined;
          actualizar(id, { estado: 'FIN', clasificacion: fin?.clasificacion, monto });
          if (monto == null) { actualizar(id, { estado: 'ERROR', error: 'FIN sin monto' }); continue; }
          await sleep(pausa * 1000);
          if (plan.pagar) {
            const { data: r } = await api.post<{ pago?: { recibo?: { cnrecibo?: string; numero?: string; estado?: string; error?: string } } }>('/flota/viajes/pago', {
              idViaje: id, monto, moneda: 'USD', referencia: `PAY-${id}`, metodo: 'WALLET',
            });
            const rec = r?.pago?.recibo;
            actualizar(id, { estado: 'PAGADO', recibo: rec?.cnrecibo || rec?.numero || '—', estadoRecibo: rec?.estado, error: rec?.error || undefined });
            await sleep(pausa * 1000);
          } else {
            actualizar(id, { estado: 'POR_COBRAR' });
          }
        } catch (e) {
          actualizar(id, { estado: 'ERROR', error: errMsg(e) });
        }
      }
      pushNotif('success', 'Simulación terminada', 'Revise "Póliza en vivo" y los recibos.');
    } catch (e) {
      pushNotif('error', 'Error en la simulación', errMsg(e));
    } finally {
      setCorriendo(false);
      void cargarPolizas();
    }
  };

  const copiar = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); pushNotif('success', 'Link copiado', link); }
    catch { window.prompt('Copie el link:', link); }
  };

  const fmt = (v: unknown) => Number(v ?? 0).toFixed(2);
  const Paso = ({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) => (
    <section className="card p-5 animate-in">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-7 h-7 rounded-full gradient-brand text-white text-xs font-extrabold flex items-center justify-center shrink-0">{n}</span>
        <h3 className="text-sm font-extrabold text-slate-800">{titulo}</h3>
      </div>
      {children}
    </section>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl gradient-brand text-white flex items-center justify-center">{Ic.sparkle('w-4 h-4')}</div>
        <div>
          <h2 className="text-base font-extrabold text-slate-800">Demo en vivo</h2>
          <p className="text-xs text-slate-500">Póliza activa: <b>{activa?.cnpoliza ?? '— (ninguna)'}</b>{activa?.tomadorNombre ? ` · ${activa.tomadorNombre}` : ''}</p>
        </div>
      </div>

      <Paso n={1} titulo="Crear póliza nueva">
        <p className="text-xs text-slate-600 mb-3">Descargue la plantilla Excel, llénela con los conductores y cárguela en el asistente para crear la póliza de flota en vivo.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={descargarPlantilla}>{Ic.rows('w-3.5 h-3.5')} Descargar plantilla Excel</button>
          <button className="btn-primary" onClick={() => setMostrarAsistente((v) => !v)}>
            {Ic.plus('w-3.5 h-3.5')} {mostrarAsistente ? 'Ocultar asistente' : 'Abrir asistente "Crear flota"'}
          </button>
        </div>
        {mostrarAsistente && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <CrearFlotaTab pushNotif={pushNotif} />
          </div>
        )}
      </Paso>

      <Paso n={2} titulo="Cargar tarifas demo">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button className="btn-primary" onClick={cargarTarifasDemo} disabled={cargandoTarifas}>
            {Ic.cash('w-3.5 h-3.5')} {cargandoTarifas ? 'Cargando…' : 'Cargar tarifas demo'}
          </button>
          <button className="btn-secondary" onClick={cargarTarifas}>{Ic.refresh('w-3.5 h-3.5')} Refrescar</button>
          <span className="text-xs text-slate-500">Urbano 0–20 km 0,10/km (mín 1) · Extra urbano 20–80 km 0,08/km (mín 3) · Interurbano 80+ km 0,06/km (mín 6) USD</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="py-1.5 pr-3">Clasificación</th><th className="pr-3">Nombre</th><th className="pr-3">Km</th><th className="pr-3">USD/km</th><th className="pr-3">Mínimo</th><th className="pr-3">Redondeo</th><th>Activa</th>
            </tr></thead>
            <tbody>
              {(tarifas ?? []).map((t) => (
                <tr key={t.id ?? t.clasificacion} className="border-b border-slate-50">
                  <td className="py-1.5 pr-3 font-bold text-slate-700">{t.clasificacion}</td>
                  <td className="pr-3">{t.nombre}</td>
                  <td className="pr-3">{Number(t.kmDesde)}–{t.kmHasta == null ? '∞' : Number(t.kmHasta)}</td>
                  <td className="pr-3">{fmt(t.tarifaKm)}</td>
                  <td className="pr-3">{fmt(t.minimo)}</td>
                  <td className="pr-3">{t.redondeo}</td>
                  <td>{t.activa ? 'Sí' : 'No'}</td>
                </tr>
              ))}
              {tarifas && !tarifas.length && <tr><td colSpan={7} className="py-3 text-slate-400">Sin tarifas configuradas.</td></tr>}
            </tbody>
          </table>
        </div>
      </Paso>

      <Paso n={3} titulo="Simular viajes">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <label className="text-xs text-slate-600 flex items-center gap-1.5">Viajes
            <select className="input !py-1 !w-auto" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} disabled={corriendo}>
              {[1, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600 flex items-center gap-1.5">Pausa (s)
            <select className="input !py-1 !w-auto" value={pausa} onChange={(e) => setPausa(Number(e.target.value))} disabled={corriendo}>
              {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {!corriendo
            ? <button className="btn-primary" onClick={simular}>{Ic.play('w-3.5 h-3.5')} Simular viajes</button>
            : <button className="btn-secondary" onClick={() => { cancelar.current = true; }}>{Ic.stop('w-3.5 h-3.5')} Detener</button>}
          <span className="text-xs text-slate-500">INICIO → FIN (cotiza por km) → PAGO (recibo). El 5.º viaje queda POR COBRAR. Mire "Póliza en vivo".</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="py-1.5 pr-3">Viaje</th><th className="pr-3">Conductor</th><th className="pr-3">Placa</th><th className="pr-3">Cert</th><th className="pr-3">Km</th><th className="pr-3">Clasificación</th><th className="pr-3">Monto</th><th className="pr-3">Recibo</th><th>Estado</th>
            </tr></thead>
            <tbody>
              {log.map((v) => (
                <tr key={v.id} className="border-b border-slate-50">
                  <td className="py-1.5 pr-3 font-mono text-[11px]">{v.id}</td>
                  <td className="pr-3 font-bold text-slate-700">{v.conductor}</td>
                  <td className="pr-3">{v.placa}</td>
                  <td className="pr-3">{v.cert}</td>
                  <td className="pr-3">{v.km}</td>
                  <td className="pr-3">{v.clasificacion ?? '…'}</td>
                  <td className="pr-3">{v.monto != null ? `${fmt(v.monto)} USD` : '…'}</td>
                  <td className="pr-3 font-mono text-[11px]">{v.recibo ?? ''}{v.estadoRecibo ? ` (${v.estadoRecibo})` : ''}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full font-bold ${
                      v.estado === 'PAGADO' ? 'bg-emerald-50 text-emerald-700'
                      : v.estado === 'POR_COBRAR' ? 'bg-amber-50 text-amber-700'
                      : v.estado === 'ERROR' ? 'bg-red-50 text-red-700'
                      : 'bg-brand-50 text-brand-700'}`}>
                      {v.estado === 'INICIO' ? 'EN CURSO' : v.estado.replace('_', ' ')}
                    </span>
                    {v.error && <span className="ml-1 text-red-600">{v.error}</span>}
                  </td>
                </tr>
              ))}
              {!log.length && <tr><td colSpan={9} className="py-3 text-slate-400">Aún no hay viajes simulados.</td></tr>}
            </tbody>
          </table>
        </div>
      </Paso>

      <Paso n={4} titulo="Vista web pública de la póliza">
        {link ? (
          <div className="flex flex-wrap items-center gap-4">
            {qr && <img src={qr} alt="QR" className="w-[168px] h-[168px] rounded-lg border border-slate-100" />}
            <div className="min-w-0">
              <p className="text-xs text-slate-500 mb-1">Póliza {activa?.cnpoliza} · solo lectura, sin login</p>
              <a href={link} target="_blank" rel="noreferrer" className="text-sm font-bold text-brand-700 break-all underline">{link}</a>
              <div className="flex gap-2 mt-2">
                <button className="btn-secondary" onClick={copiar}>{Ic.copy('w-3.5 h-3.5')} Copiar link</button>
                <a className="btn-primary" href={link} target="_blank" rel="noreferrer">{Ic.link('w-3.5 h-3.5')} Abrir</a>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">No hay póliza activa con link público. Cree la flota en el paso 1.</p>
        )}
      </Paso>
    </div>
  );
}
