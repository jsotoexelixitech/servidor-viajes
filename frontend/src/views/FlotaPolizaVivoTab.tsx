import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Notif } from '../types';
import { flotaApi, CertificadoVivo, CoberturaVivo, EstadoReciboVivo, PolizaVivo, ReciboVivo } from '../api';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Ic } from '../components/ui/Icons';

/**
 * Póliza en vivo: el MISMO modelo del PDF "CUADRO - RECIBO DE PÓLIZA AUTOMOVIL" de La Mundial
 * (nest-api template_advhplantilla.html: cabecera SUDEASEG, DATOS DEL TOMADOR - ASEGURADO, DATOS DE LA PÓLIZA,
 * DATOS DEL VEHÍCULO, COBERTURAS CONTRATADAS, nota IGTF, RECIBOS DE PRIMAS, firmas), pero armado con datos vivos:
 * un sub-cuadro por certificado (conductor + vehículo) con un recibo por viaje, que se actualiza solo
 * cuando entra un evento de viaje o un pago. "Descargar PDF" imprime el mismo layout.
 */

type PushNotif = (tipo: Notif['tipo'], titulo: string, msg: string) => void;

const POLL_MS = 3000;
const FULL_MS = 30000;
const MAX_FILAS = 50;

const n = (v: unknown) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
const ve = (v: unknown, d = 2) => n(v).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });
const fCorta = (v?: string | null) => {
  if (!v) return '—';
  const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const fHora = (v?: string | null) => v
  ? new Date(v).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';
const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mesDesde = () => { const d = new Date(); return isoDia(new Date(d.getFullYear(), d.getMonth(), 1)); };
const mesHasta = () => { const d = new Date(); return isoDia(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
const sym = (m?: string | null) => (String(m ?? '').toUpperCase() === 'USD' || m === '$' ? '$' : 'Bs');
const errMsg = (e: unknown) => {
  const err = e as { response?: { data?: { message?: unknown } }; message?: string };
  const m = err.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : String(m ?? err.message ?? 'Error');
};
const claveRecibo = (r: ReciboVivo) => `${r.idViaje}|${r.estado}|${r.nRecibo ?? ''}`;

const ESTADO: Record<EstadoReciboVivo, { label: string; cls: string }> = {
  PAGADO:    { label: 'PAGADO',    cls: 'cr-badge cr-ok' },
  PENDIENTE: { label: 'POR COBRAR', cls: 'cr-badge cr-warn' },
  EN_CURSO:  { label: 'EN CURSO',  cls: 'cr-badge cr-info' },
  ERROR:     { label: 'PAGADO · RECIBO CON ERROR', cls: 'cr-badge cr-err' },
  ANULADO:   { label: 'ANULADO',   cls: 'cr-badge cr-err' },
};
const CLASIF: Record<string, string> = { URBANO: 'URBANO', EXTRA_URBANO: 'EXTRA URBANO' };

/** Estilos del cuadro: los del PDF (style.css de nest-api: Arial, barras grises centradas, tablas 8–10 px) escalados a pantalla. */
const CSS = `
.cuadro { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11.5px; background: #fff; }
.cuadro table { width: 100%; border-collapse: collapse; }
.cuadro .cr-title { text-align: center; font-weight: bold; font-size: 14px; margin: 6px 0 2px; letter-spacing: .02em; }
.cuadro .cr-sub { background: #ccc; text-align: center; font-weight: bold; font-size: 11px; line-height: 2; margin: 6px 0 3px; text-transform: uppercase; }
.cuadro .cr-sub-navy { background: var(--lm-navy, #0F1A5A); color: #fff; }
.cuadro .cr-sec td, .cuadro .cr-sec th { padding: 2px 5px; vertical-align: top; text-align: left; }
.cuadro .cr-sec .b { font-weight: bold; white-space: nowrap; }
.cuadro .cr-grid th { font-weight: bold; font-size: 10.5px; border-bottom: 1px solid #999; padding: 3px 5px; text-align: left; white-space: nowrap; }
.cuadro .cr-grid td { padding: 3px 5px; border-bottom: 1px solid #eee; vertical-align: top; }
.cuadro .cr-grid .r { text-align: right; font-variant-numeric: tabular-nums; }
.cuadro .cr-grid tfoot td { font-weight: bold; border-top: 1px solid #999; border-bottom: 0; }
.cuadro .cr-note { text-align: center; font-weight: bold; font-size: 10px; margin: 6px 0; }
.cuadro .cr-legal { text-align: justify; font-weight: bold; font-size: 9.5px; line-height: 1.35; }
.cuadro .cr-badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9.5px; font-weight: bold; white-space: nowrap; }
.cuadro .cr-ok { background: #e6f4ea; color: #1e6b34; }
.cuadro .cr-warn { background: #fff4e0; color: #7a4b00; }
.cuadro .cr-info { background: #e4ecf9; color: #0F1A5A; }
.cuadro .cr-err { background: #fdecec; color: #8f2a2d; }
.cuadro .cr-cert { border: 1px solid #d5d7de; margin-top: 10px; break-inside: avoid-page; }
.cuadro .cr-cert-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; cursor: pointer; background: #f4f5f8; }
.cuadro .cr-cert-body { padding: 4px 8px 8px; }
.cuadro .cr-row-click { cursor: pointer; }
.cuadro .cr-row-click:hover td { background: #f4f5f8; }
@keyframes crflash { from { background: #fff3c4; } to { background: transparent; } }
.cuadro .cr-flash td { animation: crflash 4s ease-out; }
.cuadro .cr-firma td { height: 54px; border-bottom: 1px solid #333; }
@media print {
  @page { size: letter; margin: 10mm; }
  body * { visibility: hidden !important; }
  .cuadro-print, .cuadro-print * { visibility: visible !important; }
  .cuadro-print { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border: 0 !important; padding: 0 !important; }
  .cuadro { font-size: 9px; }
  .cuadro .cr-sub { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cuadro .no-print { display: none !important; }
  .cuadro .cr-flash td { animation: none; }
}
`;

export function PolizaVivoTab({ pushNotif }: { pushNotif: PushNotif }) {
  const [data, setData] = useState<PolizaVivo | null>(null);
  const [cargando, setCargando] = useState(false);
  const [desde, setDesde] = useState(mesDesde());
  const [hasta, setHasta] = useState(mesHasta());
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState<'' | EstadoReciboVivo>('');
  const [vivo, setVivo] = useState(true);
  const [ultima, setUltima] = useState<Date | null>(null);
  const [latido, setLatido] = useState(false);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [todas, setTodas] = useState<Record<string, boolean>>({});
  const [imprimiendo, setImprimiendo] = useState(false);
  const [nuevos, setNuevos] = useState<Set<string>>(new Set());
  const [errorConexion, setErrorConexion] = useState<string | null>(null);

  const revRef = useRef<string | undefined>(undefined);
  const ultFull = useRef(0);
  const vistos = useRef<Set<string> | null>(null);
  const enVuelo = useRef(false);

  const cargar = useCallback(async (forzar = false) => {
    if (enVuelo.current) return;
    enVuelo.current = true;
    const full = forzar || Date.now() - ultFull.current > FULL_MS;
    try {
      const { data: r } = await flotaApi.polizaEnVivo({ rev: full ? undefined : revRef.current, desde, hasta });
      setUltima(new Date());
      setErrorConexion(null);
      revRef.current = r.rev;
      if (r.sinCambios) return;
      ultFull.current = Date.now();
      // Resalta los recibos nuevos o que cambiaron de estado (no en la primera carga).
      const claves = new Set(r.certificados.flatMap((c) => c.recibos.map(claveRecibo)));
      if (vistos.current) {
        const cambios = new Set([...claves].filter((k) => !vistos.current!.has(k)));
        if (cambios.size) {
          setNuevos(cambios);
          setLatido(true);
          window.setTimeout(() => setLatido(false), 1500);
        }
      }
      vistos.current = claves;
      setData(r);
    } catch (e) {
      setErrorConexion(errMsg(e));
      if (forzar) pushNotif('error', 'No se pudo cargar la póliza en vivo', errMsg(e));
    } finally {
      enVuelo.current = false;
      setCargando(false);
    }
  }, [desde, hasta, pushNotif]);

  // Cambio de rango → recarga completa (y no resalta lo que ya estaba).
  useEffect(() => {
    vistos.current = null;
    revRef.current = undefined;
    setCargando(true);
    void cargar(true);
  }, [cargar]);

  useEffect(() => {
    if (!vivo) return;
    const t = window.setInterval(() => { if (!document.hidden) void cargar(); }, POLL_MS);
    return () => window.clearInterval(t);
  }, [vivo, cargar]);

  const certs = useMemo(() => {
    if (!data) return [] as CertificadoVivo[];
    const q = buscar.trim().toUpperCase().replace(/[.\-\s]/g, '');
    return data.certificados
      .map((c) => ({ ...c, recibos: estado ? c.recibos.filter((r) => r.estado === estado) : c.recibos }))
      .filter((c) => {
        if (!q) return true;
        const campos = [c.placa, c.conductorDoc, c.conductorNombre, c.ccerti != null ? String(c.ccerti) : '']
          .map((x) => String(x ?? '').toUpperCase().replace(/[.\-\s]/g, ''));
        return campos.some((x) => x.includes(q));
      })
      .filter((c) => !estado || c.recibos.length > 0);
  }, [data, buscar, estado]);

  const imprimir = () => {
    setImprimiendo(true);
    window.setTimeout(() => { window.print(); setImprimiendo(false); }, 150);
  };

  const keyCert = (c: CertificadoVivo) => String(c.ccerti ?? 'sin');
  const estaAbierto = (c: CertificadoVivo) => imprimiendo || (abiertos[keyCert(c)] ?? c.recibos.length > 0);
  const abrir = (c: CertificadoVivo) => {
    const k = keyCert(c);
    setAbiertos((a) => ({ ...a, [k]: true }));
    window.setTimeout(() => document.getElementById(`cert-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  if (!data) {
    return cargando || !errorConexion
      ? <div className="card p-10 flex justify-center"><Spinner size="lg" /></div>
      : <EmptyState title="No se pudo cargar la póliza" sub={errorConexion} />;
  }

  const p = data.poliza;
  const t = data.totales;
  const mon = sym(data.moneda);
  const hoy = new Date();

  return (
    <div className="space-y-4">
      <style>{CSS}</style>

      {/* ── Barra: en vivo + filtros (no se imprime) ── */}
      <div className="card p-3 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 pr-2 mr-1 border-r border-[#E3E5EC] self-center">
          <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${vivo && !errorConexion ? 'bg-emerald-500' : errorConexion ? 'bg-red-500' : 'bg-slate-300'}`}>
            {vivo && !errorConexion && <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping" />}
          </span>
          <div className="leading-tight">
            <p className={`text-xs font-bold ${latido ? 'text-emerald-600' : 'text-slate-800'}`}>
              {errorConexion ? 'Sin conexión' : vivo ? (latido ? 'Nuevo movimiento' : 'En vivo') : 'En pausa'}
            </p>
            <p className="text-[10.5px] text-slate-500">{ultima ? `Actualizado ${ultima.toLocaleTimeString('es-VE')}` : '—'}</p>
          </div>
          <button className="btn-ghost text-xs py-1 px-2" onClick={() => setVivo(!vivo)}>{vivo ? 'Pausar' : 'Reanudar'}</button>
        </div>
        <label className="label mb-0">Conductor / placa / cédula
          <input className="input mt-1 h-9 text-sm w-56 normal-case tracking-normal font-medium" placeholder="Buscar…"
            value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </label>
        <label className="label mb-0">Desde
          <input type="date" className="input mt-1 h-9 text-sm w-40 normal-case tracking-normal font-medium" value={desde}
            onChange={(e) => e.target.value && setDesde(e.target.value)} />
        </label>
        <label className="label mb-0">Hasta
          <input type="date" className="input mt-1 h-9 text-sm w-40 normal-case tracking-normal font-medium" value={hasta}
            onChange={(e) => e.target.value && setHasta(e.target.value)} />
        </label>
        <label className="label mb-0">Estatus del recibo
          <select className="input mt-1 h-9 text-sm w-44 normal-case tracking-normal font-medium" value={estado}
            onChange={(e) => setEstado(e.target.value as '' | EstadoReciboVivo)}>
            <option value="">Todos</option>
            <option value="PAGADO">Pagado</option>
            <option value="PENDIENTE">Por cobrar</option>
            <option value="EN_CURSO">En curso</option>
            <option value="ERROR">Con error</option>
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-secondary text-xs" onClick={() => void cargar(true)}>{Ic.refresh('w-3.5 h-3.5')} Actualizar</button>
          <button className="btn-navy text-xs" onClick={imprimir}>{Ic.rows('w-3.5 h-3.5')} Descargar PDF</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className={`badge ${data.fuente === 'SIS2000' ? 'badge-green' : 'badge-yellow'}`}>
          Póliza: {data.fuente === 'SIS2000' ? 'Sis2000 (nest-api)' : 'datos locales'}
        </span>
        <span className={`badge ${data.reciboReal ? 'badge-green' : 'badge-blue'}`}>
          Recibos: {data.reciboReal ? 'reales (Sis2000)' : 'Nexus (pendiente de sincronizar con Sis2000)'}
        </span>
        {data.fuente === 'LOCAL' && data.sis2000.error && (
          <span className="text-slate-500 self-center" title={data.sis2000.error}>Sis2000 no respondió: se muestran los datos locales.</span>
        )}
        {data.truncado && <span className="badge badge-red">Rango con más de 3000 viajes: acórtelo</span>}
      </div>

      {/* ── KPIs de la póliza ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Certificados" value={ve(t.certificados, 0)} sub={`${t.conductoresConViajes} con viajes`} />
        <Kpi label="Viajes finalizados" value={ve(t.viajes, 0)} sub={`${t.enCurso} en curso · ${t.cancelados} cancelados`} />
        <Kpi label="Km recorridos" value={ve(t.km, 1)} />
        <Kpi label="Primas cobradas" value={`${mon} ${ve(t.primasCobradas)}`} sub={`${t.pagados} recibos pagados`} tone="ok" />
        <Kpi label="Por cobrar" value={`${mon} ${ve(t.primasPendientes)}`} sub={t.recibosError ? `${t.recibosError} recibos con error` : 'viajes sin pago'} tone={t.recibosError ? 'err' : 'warn'} />
      </div>

      {/* ── El cuadro (mismo modelo del PDF) ── */}
      <div className="card p-6 md:p-8 cuadro-print overflow-x-auto">
        <div className="cuadro min-w-[760px]">
          <Cabecera data={data} />
          <div className="cr-title">{data.titulo}</div>
          <div className="text-center text-[10.5px] font-bold text-[var(--lm-navy,#0F1A5A)] mb-1">
            FLOTA POR USO · EN VIVO al {hoy.toLocaleString('es-VE')} · Viajes del {fCorta(data.rango.desde)} al {fCorta(data.rango.hasta)}
          </div>

          <div className="cr-sub">DATOS DEL TOMADOR - ASEGURADO</div>
          <table className="cr-sec"><tbody>
            <tr>
              <td className="b">TOMADOR:</td><td>{data.tomador.nombre}</td>
              <td className="b">C.I./R.I.F.:</td><td>{data.tomador.rif ?? '—'}</td>
              <td className="b">RAMO PÓLIZA:</td><td>{p.ramo}</td>
              <td className="b">PÓLIZA:</td><td>{p.cnpoliza}</td>
              <td className="b">PÓLIZA REL:</td><td>{p.polizaRel ?? '—'}</td>
            </tr>
            <tr>
              <td className="b">ASEGURADO:</td><td>{data.tomador.asegurado}</td>
              <td className="b">C.I./R.I.F.:</td><td>{data.tomador.rifAsegurado ?? '—'}</td>
              <td className="b">CERTIFICADOS:</td><td>{t.certificados}</td>
              <td className="b">ESTATUS:</td><td colSpan={3}>{p.estatus}</td>
            </tr>
          </tbody></table>

          <div className="cr-sub">DATOS DE LA PÓLIZA</div>
          <table className="cr-sec"><tbody>
            <tr>
              <td className="b">FECHA EMISIÓN:</td><td>{fCorta(p.fechaEmision)}</td>
              <td className="b">VIGENCIA:</td><td>{fCorta(p.vigenciaDesde)} - {fCorta(p.vigenciaHasta)}</td>
              <td className="b">MONEDA:</td><td>{p.moneda}</td>
            </tr>
            <tr>
              <td className="b">SUCURSAL:</td><td>{p.sucursal ?? '—'}</td>
              <td className="b">CANAL DE VENTA:</td><td>{p.canal ?? '—'}</td>
              <td className="b">FRECUENCIA DE PAGO:</td><td>{p.frecuencia}</td>
            </tr>
            <tr>
              <td className="b">INTERMEDIARIO:</td><td>{p.intermediario ?? '—'}</td>
              <td className="b">PLAN CONTRATADO:</td><td>{p.plan ?? '—'}</td>
              <td className="b">TIPO PRODUCTO:</td><td>{p.tipoProducto}</td>
            </tr>
            <tr>
              <td className="b">TIPO PÓLIZA:</td><td>{p.tipoPoliza}</td>
              <td className="b">PERÍODO:</td><td>{p.periodo ?? '—'}</td>
              <td className="b">ACTUALIZADO:</td><td>{fHora(data.generadoEn)}</td>
            </tr>
          </tbody></table>

          <div className="cr-sub">CERTIFICADOS (VEHÍCULO - CONDUCTOR)</div>
          {certs.length === 0 ? (
            <p className="text-center text-[11px] text-slate-500 py-3">
              {data.certificados.length ? 'Ningún certificado coincide con el filtro.' : 'La póliza no tiene certificados asociados. Agréguelos en la pestaña "Certificados".'}
            </p>
          ) : (
            <table className="cr-grid">
              <thead><tr>
                <th>CERT.</th><th>PLACA</th><th>CONDUCTOR</th><th>C.I.</th><th>ESTATUS</th>
                <th className="r">VIAJES</th><th className="r">KM</th><th className="r">COBRADO</th><th className="r">POR COBRAR</th><th>ÚLTIMO MOVIMIENTO</th>
              </tr></thead>
              <tbody>
                {certs.map((c) => (
                  <tr key={keyCert(c)} className="cr-row-click" onClick={() => abrir(c)}>
                    <td className="font-bold">{c.ccerti ?? '—'}</td>
                    <td className="font-mono">{c.placa ?? '—'}</td>
                    <td>{c.conductorNombre ?? '—'}</td>
                    <td>{c.conductorDoc ?? '—'}</td>
                    <td>{c.estatus}{c.totales.enCurso > 0 && <span className="cr-badge cr-info ml-1">EN VIAJE</span>}</td>
                    <td className="r">{c.totales.viajes}</td>
                    <td className="r">{ve(c.totales.km, 1)}</td>
                    <td className="r">{ve(c.totales.primasCobradas)}</td>
                    <td className="r">{ve(c.totales.primasPendientes)}</td>
                    <td>{fHora(c.ultimoMovimiento)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td colSpan={5}>TOTAL PÓLIZA ({mon})</td>
                <td className="r">{t.viajes}</td><td className="r">{ve(t.km, 1)}</td>
                <td className="r">{ve(t.primasCobradas)}</td><td className="r">{ve(t.primasPendientes)}</td><td />
              </tr></tfoot>
            </table>
          )}

          <div className="cr-sub">COBERTURAS CONTRATADAS</div>
          <Coberturas coberturas={data.coberturas} />
          <div className="cr-note">La prima no incluye el Impuesto del 3% del IGTF, el cual debe pagar en caso que su moneda de pago sea diferente de Bolívares</div>

          {/* ── Un sub-cuadro por conductor (certificado) ── */}
          {certs.map((c) => {
            const k = keyCert(c);
            const abierto = estaAbierto(c);
            const verTodas = imprimiendo || todas[k];
            const filas = verTodas ? c.recibos : c.recibos.slice(0, MAX_FILAS);
            return (
              <div key={k} id={`cert-${k}`} className="cr-cert">
                <div className="cr-cert-head" onClick={() => setAbiertos((a) => ({ ...a, [k]: !abierto }))}>
                  <div className="font-bold text-[12px]">
                    {c.ccerti != null ? `CERTIFICADO N° ${c.ccerti}` : 'VIAJES SIN CERTIFICADO'} · {c.conductorNombre ?? '—'}
                    <span className="font-normal text-slate-600"> · {c.placa ?? '—'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span>{c.totales.viajes} viajes · {ve(c.totales.km, 1)} km</span>
                    <span className="cr-badge cr-ok">COBRADO {mon} {ve(c.totales.primasCobradas)}</span>
                    {c.totales.primasPendientes > 0 && <span className="cr-badge cr-warn">POR COBRAR {mon} {ve(c.totales.primasPendientes)}</span>}
                    <span className="no-print">{abierto ? '▾' : '▸'}</span>
                  </div>
                </div>
                {abierto && (
                  <div className="cr-cert-body">
                    <div className="cr-sub">DATOS DEL VEHÍCULO</div>
                    <table className="cr-sec"><tbody>
                      <tr>
                        <td className="b">PLACA:</td><td className="font-mono">{c.placa ?? '—'}</td>
                        <td className="b">CONDUCTOR:</td><td>{c.conductorNombre ?? '—'}</td>
                        <td className="b">C.I.:</td><td>{c.conductorDoc ?? '—'}</td>
                        <td className="b">CERTIFICADO:</td><td>{c.ccerti ?? '—'}</td>
                      </tr>
                      <tr>
                        <td className="b">USO:</td><td>TRANSPORTE POR APLICACIÓN</td>
                        <td className="b">PLAN:</td><td>{c.plan ?? p.plan ?? '—'}</td>
                        <td className="b">VIGENCIA:</td><td>{c.vigenciaDesde ? `${fCorta(c.vigenciaDesde)} - ${fCorta(c.vigenciaHasta)}` : `${fCorta(p.vigenciaDesde)} - ${fCorta(p.vigenciaHasta)}`}</td>
                        <td className="b">ESTATUS:</td><td>{c.estatus}</td>
                      </tr>
                      <tr>
                        <td className="b">ORIGEN:</td><td>{c.origen === 'SIS2000' ? 'SIS2000 (vhcerti)' : c.origen === 'MANUAL' ? 'ASOCIADO EN PANTALLA' : c.origen}</td>
                        <td className="b">RECIBOS SIS2000:</td><td>{c.recibosSis2000 ?? '—'}</td>
                        <td className="b">EN CURSO:</td><td>{c.totales.enCurso}</td>
                        <td className="b">CANCELADOS:</td><td>{c.totales.cancelados}</td>
                      </tr>
                    </tbody></table>

                    <div className="cr-sub">COBERTURAS</div>
                    <Coberturas coberturas={c.coberturas} />

                    <div className="cr-sub">RECIBOS DE PRIMAS - POR VIAJE</div>
                    {c.recibos.length === 0 ? (
                      <p className="text-center text-[11px] text-slate-500 py-2">Sin viajes en el rango.</p>
                    ) : (
                      <table className="cr-grid">
                        <thead><tr>
                          <th>NO. RECIBO</th><th>TIPO DE RECIBO</th><th>VIAJE</th><th>CLASIF.</th><th className="r">KM</th>
                          <th>FECHA DESDE</th><th>FECHA HASTA</th><th>FECHA COBRO</th><th>MONEDA</th><th className="r">PRIMA</th>
                          <th>ESTATUS</th><th>REF. PAGO</th>
                        </tr></thead>
                        <tbody>
                          {filas.map((r) => (
                            <tr key={r.idViaje} className={nuevos.has(claveRecibo(r)) ? 'cr-flash' : ''}>
                              <td className="font-mono">{r.nRecibo ?? '—'}{r.modo === 'SIMULADO' && r.nRecibo && <span className="text-slate-400"> (sim.)</span>}{r.syncSis2000 && r.modo !== 'REAL' && <span className="block text-[9.5px] text-slate-500">Sis2000: {r.syncSis2000 === 'OK' ? (r.cnreciboSis2000 ?? 'OK') : r.syncSis2000 === 'ERROR' ? 'error al subir' : 'por sincronizar'}</span>}</td>
                              <td>{r.tipo}</td>
                              <td className="font-mono">{r.idViaje}</td>
                              <td>{r.clasificacion ? (CLASIF[r.clasificacion] ?? r.clasificacion) : '—'}</td>
                              <td className="r">{r.km != null ? ve(r.km, 1) : '—'}</td>
                              <td>{fHora(r.desde)}</td>
                              <td>{fHora(r.hasta)}</td>
                              <td>{fHora(r.fechaCobro)}</td>
                              <td>{r.moneda === 'USD' ? 'DÓLAR ($)' : r.moneda}</td>
                              <td className="r">{ve(r.prima)}</td>
                              <td>
                                <span className={ESTADO[r.estado].cls}>{ESTADO[r.estado].label}</span>
                                {r.estadoSis2000 && <span className="block text-[9.5px] text-slate-500">Sis2000: {r.estadoSis2000}</span>}
                                {r.error && <span className="block text-[9.5px] text-red-700 max-w-[220px]">{r.error}</span>}
                              </td>
                              <td>{r.referencia ?? '—'}{r.metodo && <span className="text-slate-400"> · {r.metodo}</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot><tr>
                          <td colSpan={4}>TOTAL CERTIFICADO</td>
                          <td className="r">{ve(c.totales.km, 1)}</td>
                          <td colSpan={4}>COBRADO {mon} {ve(c.totales.primasCobradas)} · POR COBRAR {mon} {ve(c.totales.primasPendientes)}</td>
                          <td className="r">{ve(c.totales.primasCobradas + c.totales.primasPendientes)}</td>
                          <td colSpan={2} />
                        </tr></tfoot>
                      </table>
                    )}
                    {c.recibos.length > MAX_FILAS && !imprimiendo && (
                      <button className="btn-ghost text-xs mt-1 no-print" onClick={() => setTodas((x) => ({ ...x, [k]: !verTodas }))}>
                        {verTodas ? 'Ver solo los últimos' : `Ver los ${c.recibos.length} recibos`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <table className="mt-4"><thead><tr>
            <th className="cr-sub" style={{ width: '50%' }}>POR EL TOMADOR</th>
            <th className="cr-sub" style={{ width: '50%' }}>POR LA MUNDIAL DE SEGUROS</th>
          </tr></thead><tbody className="cr-firma"><tr><td /><td /></tr></tbody></table>
          <div className="cr-note">
            En Caracas a los {hoy.getDate()} días del mes de {hoy.toLocaleDateString('es-VE', { month: 'long' })} del {hoy.getFullYear()}
          </div>
          <div className="cr-legal">
            El Asegurador entregará al Tomador este Cuadro Póliza, junto con las Condiciones Generales y Particulares, los anexos,
            si los hubiere, y demás documentos que formen parte del contrato de seguros, accediendo a nuestra página web
            www.lamundialdeseguros.com. Cada viaje informado por la plataforma genera su recibo de prima sobre el certificado
            del conductor. La Mundial de Seguros, C.A, Inscrita en la Superintendencia de la Actividad Aseguradora Bajo El No.{data.empresa.sudeaseg}.
            {!data.reciboReal && ' Los recibos RDY-… están registrados en Nexus y pendientes de sincronizar con Sis2000.'}
          </div>
        </div>
      </div>
    </div>
  );
}

function Cabecera({ data }: { data: PolizaVivo }) {
  return (
    <table><tbody><tr>
      <td style={{ width: '45%', verticalAlign: 'top' }}>
        <img src="/brand/mundial-lockup.png" alt={data.empresa.nombre} style={{ height: 58, objectFit: 'contain' }} draggable={false} />
      </td>
      <td style={{ width: '55%', verticalAlign: 'top', fontSize: 10, textAlign: 'right' }}>
        <table style={{ marginLeft: 'auto', width: 'auto' }}><tbody>
          <tr><td style={{ paddingRight: 8 }}>Inscrita en la Superintendencia de la Actividad Aseguradora bajo el Nro.</td><td style={{ whiteSpace: 'nowrap' }}>{data.empresa.sudeaseg}</td></tr>
          <tr><td style={{ paddingRight: 8 }}>Capital Suscrito Bs.</td><td style={{ whiteSpace: 'nowrap' }}>{data.empresa.capitalSuscrito}</td></tr>
          <tr><td style={{ paddingRight: 8 }}>Capital Pagado Bs.</td><td style={{ whiteSpace: 'nowrap' }}>{data.empresa.capitalPagado}</td></tr>
        </tbody></table>
      </td>
    </tr></tbody></table>
  );
}

function Coberturas({ coberturas }: { coberturas: CoberturaVivo[] }) {
  const total = coberturas.reduce((a, c) => a + n(c.prima), 0);
  return (
    <table className="cr-grid">
      <thead><tr><th style={{ width: '55%' }}>COBERTURAS</th><th className="r">SUMA ASEGURADA</th><th className="r">PRIMA</th></tr></thead>
      <tbody>
        {coberturas.map((c) => (
          <tr key={c.nombre}><td className="font-bold">{c.nombre}</td><td className="r">{c.suma != null ? ve(c.suma) : 'SEGÚN PLAN'}</td><td className="r">{ve(c.prima)}</td></tr>
        ))}
      </tbody>
      <tfoot><tr><td colSpan={2}>TOTAL (primas de los viajes pagados):</td><td className="r">{ve(total)}</td></tr></tfoot>
    </table>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'err' }) {
  const color = tone === 'ok' ? 'text-emerald-700' : tone === 'warn' ? 'text-[#7A4B00]' : tone === 'err' ? 'text-red-700' : 'text-slate-900';
  return (
    <div className="card p-4">
      <p className="stat-label">{label}</p>
      <p className={`text-xl font-extrabold tabular-nums leading-tight mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-[10.5px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default PolizaVivoTab;

