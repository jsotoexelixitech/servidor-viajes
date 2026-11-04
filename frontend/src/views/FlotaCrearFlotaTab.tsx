import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import type { Notif } from '../types';
import {
  flotaPresentacionApi, linkPublicoPoliza, FilaLote, FlotaPolizaItem, ResultadoFilaLote,
} from '../api';
import { Spinner } from '../components/ui/Spinner';
import { Ic } from '../components/ui/Icons';

/**
 * Crear flota (presentación Ridery): asistente para crear la póliza de flota en Sis2000 cargando un Excel
 * con los conductores, ver su link público y desasociarla (solo de nuestro lado) para repetir la prueba.
 */

type PushNotif = (tipo: Notif['tipo'], titulo: string, msg: string) => void;

const TOMADOR_RIF = 'J-500969210';
const TOMADOR_NOMBRE = 'Desarrollos Tecnologicos Ridery, C.A';
const PLANES = ['RIDERY', 'RIDER1', 'RIDER2'];
const COLUMNAS = ['placa', 'cedula_conductor', 'nombre_conductor', 'serial_carroceria', 'serial_motor', 'anio', 'marca', 'modelo', 'color'];
const inputCls = 'input mt-1 normal-case tracking-normal font-medium';

const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const masUnAnio = (s: string) => { const d = new Date(`${s}T12:00:00`); d.setFullYear(d.getFullYear() + 1); return isoDia(d); };
const fecha = (v?: string | null) => v ? new Date(v).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const errMsg = (e: unknown) => {
  const err = e as { response?: { data?: { message?: unknown } }; message?: string };
  const m = err.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : typeof m === 'string' ? m : m ? JSON.stringify(m) : String(err.message ?? 'Error');
};

// ── Lectura y validación del Excel ──────────────────────────────────────────
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = (k: string) => sinAcentos(String(k)).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const ALIAS: Record<string, keyof FilaLote> = {
  placa: 'placa',
  cedula_conductor: 'cedulaConductor', cedula: 'cedulaConductor', documento: 'cedulaConductor', ci: 'cedulaConductor',
  nombre_conductor: 'nombreConductor', nombre: 'nombreConductor', conductor: 'nombreConductor',
  serial_carroceria: 'serialCarroceria', serial_motor: 'serialMotor',
  anio: 'anio', ano: 'anio', year: 'anio', marca: 'marca', modelo: 'modelo', color: 'color',
};
const limpiarPlaca = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '');
const docNorm = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
const formatearCedula = (c: string) => { const s = docNorm(c); return s ? `${s[0]}-${s.slice(1)}` : ''; };

interface FilaVista {
  n: number;
  fila: FilaLote;
  errores: string[];
  estado: 'pendiente' | 'enviando' | 'ok' | 'error';
  resultado?: ResultadoFilaLote;
}

function leerFilas(rows: Record<string, unknown>[]): FilaVista[] {
  const filas: FilaVista[] = rows.map((raw, i) => {
    const f: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      const campo = ALIAS[clave(k)];
      if (campo) f[campo] = String(v ?? '').trim();
    }
    const anio = f.anio ? Number(f.anio) : undefined;
    const fila: FilaLote = {
      placa: limpiarPlaca(f.placa ?? ''),
      cedulaConductor: formatearCedula(f.cedulaConductor ?? ''),
      nombreConductor: (f.nombreConductor ?? '').toUpperCase(),
      serialCarroceria: f.serialCarroceria || undefined,
      serialMotor: f.serialMotor || undefined,
      anio: anio && Number.isFinite(anio) ? Math.trunc(anio) : undefined,
      marca: f.marca || undefined,
      modelo: f.modelo || undefined,
      color: f.color || undefined,
    };
    const errores: string[] = [];
    if (!/^[A-Z0-9]{6,8}$/.test(fila.placa)) errores.push('Placa: 6 a 8 letras/números');
    if (!/^[VEJ]\d{5,10}$/.test(docNorm(fila.cedulaConductor))) errores.push('Cédula: V/E/J + dígitos');
    if (!fila.nombreConductor) errores.push('Falta el nombre');
    if (f.anio && (!anio || anio < 1950 || anio > new Date().getFullYear() + 1)) errores.push('Año inválido');
    return { n: i + 2, fila, errores, estado: 'pendiente' as const };
  }).filter((f) => f.fila.placa || f.fila.cedulaConductor || f.fila.nombreConductor);
  // Duplicados dentro del archivo (una placa y un conductor por certificado).
  const porPlaca = new Map<string, number>();
  const porDoc = new Map<string, number>();
  for (const f of filas) {
    if (f.fila.placa) porPlaca.set(f.fila.placa, (porPlaca.get(f.fila.placa) ?? 0) + 1);
    const d = docNorm(f.fila.cedulaConductor);
    if (d) porDoc.set(d, (porDoc.get(d) ?? 0) + 1);
  }
  for (const f of filas) {
    if ((porPlaca.get(f.fila.placa) ?? 0) > 1) f.errores.push('Placa duplicada en el archivo');
    if ((porDoc.get(docNorm(f.fila.cedulaConductor)) ?? 0) > 1) f.errores.push('Cédula duplicada en el archivo');
  }
  return filas;
}

export function descargarPlantilla() {
  const ejemplo = [
    { placa: 'RD101AA', cedula_conductor: 'V-31234567', nombre_conductor: 'JOSE PEREZ', serial_carroceria: '8XA53ZEC5K1000001', serial_motor: 'K1000001', anio: 2020, marca: 'TOYOTA', modelo: 'COROLLA', color: 'BLANCO' },
    { placa: 'RD102AA', cedula_conductor: 'V-32345678', nombre_conductor: 'MARIA GONZALEZ', serial_carroceria: '', serial_motor: '', anio: 2019, marca: 'CHEVROLET', modelo: 'AVEO', color: 'GRIS' },
  ];
  const ws = XLSX.utils.json_to_sheet(ejemplo, { header: COLUMNAS });
  ws['!cols'] = COLUMNAS.map((c) => ({ wch: Math.max(12, c.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'conductores');
  XLSX.writeFile(wb, 'plantilla-flota-ridery.xlsx');
}

// ── Póliza activa: link público, QR, desasociar y selector ─────────────────
export function PolizaActivaCard({ pushNotif, recargar }: { pushNotif: PushNotif; recargar?: number }) {
  const [lista, setLista] = useState<FlotaPolizaItem[] | null>(null);
  const [cfgPol, setCfgPol] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<FlotaPolizaItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await flotaPresentacionApi.polizas();
      setLista(data.polizas);
      setCfgPol(data.cnpolizaConfiguracion);
    } catch (e) { pushNotif('error', 'No se pudieron cargar las pólizas', errMsg(e)); setLista([]); }
  }, [pushNotif]);
  useEffect(() => { void load(); }, [load, recargar]);

  const activa = lista?.find((p) => p.activa && p.enConfiguracion) ?? null;
  const link = activa?.tokenPublico ? linkPublicoPoliza(activa.tokenPublico) : null;
  useEffect(() => {
    setQr(null);
    if (link) QRCode.toDataURL(link, { margin: 1, width: 168, color: { dark: '#0F1A5A' } }).then(setQr).catch(() => setQr(null));
  }, [link]);

  const copiar = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); pushNotif('success', 'Link copiado', link); }
    catch { window.prompt('Copie el link:', link); }
  };
  const desasociar = async (p: FlotaPolizaItem) => {
    setBusy(p.id);
    try {
      const { data } = await flotaPresentacionApi.desasociar(p.id);
      pushNotif('success', 'Póliza desasociada', data.mensaje);
      setConfirmar(null);
      await load();
    } catch (e) { pushNotif('error', 'No se pudo desasociar', errMsg(e)); }
    finally { setBusy(null); }
  };
  const activar = async (p: FlotaPolizaItem) => {
    setBusy(p.id);
    try {
      await flotaPresentacionApi.activar(p.id);
      pushNotif('success', 'Póliza activa', `${p.cnpoliza} vuelve a ser la póliza de la flota.`);
      await load();
    } catch (e) { pushNotif('error', 'No se pudo activar', errMsg(e)); }
    finally { setBusy(null); }
  };

  if (!lista) return <div className="card p-6 flex justify-center"><Spinner /></div>;
  const anteriores = lista.filter((p) => p !== activa);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="section-title">{Ic.shield('w-3.5 h-3.5')} Póliza activa de la flota</p>
          {activa ? (
            <>
              <p className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1">{activa.cnpoliza}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {activa.tomadorNombre ?? '—'} · {activa.tomadorRif ?? '—'} · plan <b>{activa.cplan ?? '—'}</b> ·{' '}
                {activa.certificadosActivos} conductores activos · {activa.recibos} recibos · {activa.origen === 'CREADA' ? 'creada desde Nexus' : 'registrada'}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-600 mt-1">
              Sin póliza activa registrada (la configuración apunta a <b>{cfgPol || '—'}</b>). Cree una con el asistente de abajo.
            </p>
          )}
        </div>
        {activa && (
          <button className="btn-danger" disabled={busy === activa.id} onClick={() => setConfirmar(activa)}>
            {Ic.close('w-3.5 h-3.5')} Desasociar póliza (solo Nexus · no toca Sis2000)
          </button>
        )}
      </div>

      {activa && link && (
        <div className="card-inset flex flex-wrap items-center gap-4">
          {qr && <img src={qr} alt="QR del link público" className="w-28 h-28 rounded-lg bg-white p-1 border border-slate-200" />}
          <div className="flex-1 min-w-[240px] space-y-2">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Vista web de la póliza (solo lectura, sin login, se actualiza sola)</p>
            <code className="block text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 break-all">{link}</code>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => void copiar()}>{Ic.copy('w-3.5 h-3.5')} Copiar link</button>
              <a className="btn-primary" href={link} target="_blank" rel="noreferrer">{Ic.link('w-3.5 h-3.5')} Abrir</a>
            </div>
          </div>
        </div>
      )}

      {anteriores.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-bold text-slate-600">Pólizas anteriores ({anteriores.length}) — volver a una</summary>
          <table className="data-table mt-2">
            <thead><tr><th>Póliza</th><th>Plan</th><th>Estado</th><th className="text-right">Conductores</th><th className="text-right">Recibos</th><th>Creada</th><th /></tr></thead>
            <tbody>
              {anteriores.map((p) => (
                <tr key={p.id}>
                  <td className="font-bold tabular-nums">{p.cnpoliza}</td>
                  <td>{p.cplan ?? '—'}</td>
                  <td>{p.activa ? <span className="badge badge-yellow">Activa (fuera de config.)</span> : <span className="badge badge-gray">Desasociada {p.desasociadaEn ? fecha(p.desasociadaEn) : ''}</span>}</td>
                  <td className="text-right tabular-nums">{p.certificadosActivos}/{p.certificados}</td>
                  <td className="text-right tabular-nums">{p.recibos}</td>
                  <td>{fecha(p.creadoEn)}</td>
                  <td className="text-right whitespace-nowrap">
                    {p.tokenPublico && <a className="btn-ghost" href={linkPublicoPoliza(p.tokenPublico)} target="_blank" rel="noreferrer">Ver</a>}
                    <button className="btn-secondary ml-1" disabled={busy === p.id} onClick={() => void activar(p)}>
                      {busy === p.id ? <Spinner size="sm" /> : Ic.refresh('w-3.5 h-3.5')} Activar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {confirmar && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" onClick={() => setConfirmar(null)}>
          <div className="card p-6 max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-extrabold text-slate-900">Desasociar la póliza {confirmar.cnpoliza}</p>
            <p className="text-sm text-slate-600">
              Solo en <b>Nexus</b>: la póliza queda inactiva, sale de la configuración de la flota y se puede crear otra.
              Sus certificados y recibos locales quedan como historial y puede volver a activarla.
            </p>
            <p className="text-sm font-bold text-[#8f2a2d] bg-[#fdecec] rounded-lg px-3 py-2">
              En Sis2000 NO se borra ni se anula nada (póliza, certificados y recibos siguen allá).
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-secondary" onClick={() => setConfirmar(null)}>Cancelar</button>
              <button className="btn-danger" disabled={busy === confirmar.id} onClick={() => void desasociar(confirmar)}>
                {busy === confirmar.id ? <Spinner size="sm" /> : Ic.check('w-3.5 h-3.5')} Desasociar solo en Nexus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Asistente ───────────────────────────────────────────────────────────────
export function CrearFlotaTab({ pushNotif }: { pushNotif: PushNotif }) {
  const hoy = isoDia(new Date());
  const [paso, setPaso] = useState(1);
  const [datos, setDatos] = useState({ tomadorRif: TOMADOR_RIF, tomadorNombre: TOMADOR_NOMBRE, cplan: 'RIDER1', fdesde: hoy, fhasta: masUnAnio(hoy) });
  const [usarActiva, setUsarActiva] = useState(false);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaVista[]>([]);
  const [cnpoliza, setCnpoliza] = useState<string | null>(null);
  const [emitiendo, setEmitiendo] = useState(false);
  const [errorPoliza, setErrorPoliza] = useState<string | null>(null);
  const [recargar, setRecargar] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validas = useMemo(() => filas.filter((f) => !f.errores.length), [filas]);
  const conError = filas.length - validas.length;
  const ok = filas.filter((f) => f.estado === 'ok').length;
  const fallidas = filas.filter((f) => f.estado === 'error').length;
  const procesadas = ok + fallidas;
  const totalEnvio = validas.length;

  const cargarArchivo = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
      const leidas = leerFilas(rows);
      if (!leidas.length) { pushNotif('warning', 'Archivo vacío', 'No se encontraron filas con placa / cédula / nombre.'); return; }
      setArchivo(file.name);
      setFilas(leidas);
      setPaso(3);
    } catch (e) { pushNotif('error', 'No se pudo leer el archivo', errMsg(e)); }
  };

  const emitirFilas = async (pol: string, lista: FilaVista[]) => {
    for (const f of lista) {
      setFilas((prev) => prev.map((x) => (x.n === f.n ? { ...x, estado: 'enviando' } : x)));
      let resultado: ResultadoFilaLote;
      try {
        const { data } = await flotaPresentacionApi.emitirLote({ cnpoliza: pol, filas: [f.fila] });
        resultado = data.resultados[0];
      } catch (e) {
        resultado = { fila: f.n, placa: f.fila.placa, cedula: f.fila.cedulaConductor, nombre: f.fila.nombreConductor, ok: false, ccerti: null, yaExistia: false, origen: null, error: errMsg(e) };
      }
      setFilas((prev) => prev.map((x) => (x.n === f.n ? { ...x, estado: resultado.ok ? 'ok' : 'error', resultado } : x)));
    }
  };

  const emitir = async () => {
    setEmitiendo(true);
    setErrorPoliza(null);
    setPaso(4);
    try {
      let pol = cnpoliza;
      if (!pol) {
        if (usarActiva) {
          const { data } = await flotaPresentacionApi.polizas();
          const act = data.polizas.find((p) => p.activa && p.enConfiguracion);
          if (!act) throw new Error('No hay póliza activa: desmarque "Agregar a la póliza activa" para crear una.');
          pol = act.cnpoliza;
        } else {
          const { data } = await flotaPresentacionApi.crearPoliza(datos);
          pol = data.poliza.cnpoliza;
          pushNotif('success', 'Póliza creada en Sis2000', pol);
        }
        setCnpoliza(pol);
        setRecargar((x) => x + 1);
      }
      await emitirFilas(pol, validas.filter((f) => f.estado !== 'ok'));
      setPaso(5);
      setRecargar((x) => x + 1);
    } catch (e) {
      setErrorPoliza(errMsg(e));
      pushNotif('error', 'No se pudo crear la póliza', errMsg(e));
    } finally { setEmitiendo(false); }
  };

  const reintentar = async () => {
    if (!cnpoliza) return;
    setEmitiendo(true);
    try { await emitirFilas(cnpoliza, validas.filter((f) => f.estado === 'error')); }
    finally { setEmitiendo(false); setRecargar((x) => x + 1); }
  };

  const reiniciar = () => {
    setPaso(1); setFilas([]); setArchivo(null); setCnpoliza(null); setErrorPoliza(null);
    const h = isoDia(new Date());
    setDatos((d) => ({ ...d, fdesde: h, fhasta: masUnAnio(h) }));
  };

  const PASOS = ['Datos de la póliza', 'Excel de conductores', 'Vista previa', 'Emisión', 'Resumen'];

  return (
    <div className="space-y-4">
      <PolizaActivaCard pushNotif={pushNotif} recargar={recargar} />

      <div className="card p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="section-title">{Ic.plus('w-3.5 h-3.5')} Crear flota desde Excel</p>
          {paso > 1 && !emitiendo && <button className="btn-ghost text-xs" onClick={reiniciar}>{Ic.refresh('w-3.5 h-3.5')} Empezar de nuevo</button>}
        </div>

        <ol className="grid grid-cols-5 gap-2">
          {PASOS.map((t, i) => {
            const k = i + 1;
            const cls = k < paso ? 'bg-brand-700 text-white' : k === paso ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-600' : 'bg-slate-100 text-slate-400';
            return (
              <li key={t} className={`rounded-xl px-2 py-2 text-center text-[11px] font-bold ${cls}`}>
                <span className="block text-base leading-none mb-0.5">{k < paso ? '✓' : k}</span>{t}
              </li>
            );
          })}
        </ol>

        {paso === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
              <label className="label">Tomador (RIF)
                <input className={inputCls} value={datos.tomadorRif} disabled={usarActiva} onChange={(e) => setDatos({ ...datos, tomadorRif: e.target.value })} />
              </label>
              <label className="label xl:col-span-2">Nombre del tomador
                <input className={inputCls} value={datos.tomadorNombre} disabled={usarActiva} onChange={(e) => setDatos({ ...datos, tomadorNombre: e.target.value })} />
              </label>
              <label className="label">Plan
                <select className={inputCls} value={datos.cplan} disabled={usarActiva} onChange={(e) => setDatos({ ...datos, cplan: e.target.value })}>
                  {PLANES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="label">Desde
                  <input type="date" className={inputCls} value={datos.fdesde} disabled={usarActiva}
                    onChange={(e) => e.target.value && setDatos({ ...datos, fdesde: e.target.value, fhasta: masUnAnio(e.target.value) })} />
                </label>
                <label className="label">Hasta
                  <input type="date" className={inputCls} value={datos.fhasta} disabled={usarActiva} onChange={(e) => setDatos({ ...datos, fhasta: e.target.value })} />
                </label>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700 font-medium">
              <input type="checkbox" checked={usarActiva} onChange={(e) => setUsarActiva(e.target.checked)} />
              Agregar los conductores a la póliza activa (no crear otra póliza)
            </label>
            <p className="text-xs text-slate-500">
              La póliza se crea en Sis2000 sin recibos (ramo 18, {datos.cplan}). Cada viaje pagado genera luego su recibo sobre el certificado del conductor.
            </p>
            <div className="flex justify-end">
              <button className="btn-primary" disabled={!usarActiva && (!datos.tomadorRif.trim() || !datos.fdesde || !datos.fhasta)} onClick={() => setPaso(2)}>
                Siguiente {Ic.arrow('w-3.5 h-3.5')}
              </button>
            </div>
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-secondary" onClick={descargarPlantilla}>{Ic.rows('w-3.5 h-3.5')} Descargar plantilla Excel</button>
              <span className="text-xs text-slate-500">
                Columnas: <code>placa</code>, <code>cedula_conductor</code>, <code>nombre_conductor</code> y opcionales{' '}
                <code>serial_carroceria</code>, <code>serial_motor</code>, <code>anio</code>, <code>marca</code>, <code>modelo</code>, <code>color</code>.
              </span>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click(); }}
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastrando(false); const f = e.dataTransfer.files?.[0]; if (f) void cargarArchivo(f); }}
              className={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${arrastrando ? 'border-brand-600 bg-brand-50' : 'border-slate-300 hover:border-brand-500 hover:bg-slate-50'}`}
            >
              <p className="text-sm font-bold text-slate-800">Arrastre aquí el Excel de conductores o haga clic para elegirlo</p>
              <p className="text-xs text-slate-500 mt-1">.xlsx o .csv · primera hoja · una fila por conductor</p>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void cargarArchivo(f); e.target.value = ''; }} />
            </div>
            <div className="flex justify-between">
              <button className="btn-ghost" onClick={() => setPaso(1)}>Atrás</button>
            </div>
          </div>
        )}

        {paso >= 3 && filas.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="badge badge-blue">{archivo}</span>
              <span className="badge badge-green">{validas.length} válidas</span>
              {conError > 0 && <span className="badge badge-red">{conError} con errores (no se envían)</span>}
              {cnpoliza && <span className="badge badge-purple">Póliza {cnpoliza}</span>}
            </div>

            {paso >= 4 && totalEnvio > 0 && (
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                  <span>{emitiendo ? (cnpoliza ? 'Incluyendo conductores en Sis2000…' : 'Creando la póliza en Sis2000…') : 'Emisión terminada'}</span>
                  <span className="tabular-nums">{procesadas}/{totalEnvio}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden flex">
                  <div className="bg-emerald-500 transition-all" style={{ width: `${(ok / totalEnvio) * 100}%` }} />
                  <div className="bg-red-500 transition-all" style={{ width: `${(fallidas / totalEnvio) * 100}%` }} />
                </div>
              </div>
            )}
            {errorPoliza && <p className="text-sm font-bold text-[#8f2a2d] bg-[#fdecec] rounded-lg px-3 py-2">{errorPoliza}</p>}

            <div className="overflow-x-auto">
              <table className="data-table text-xs">
                <thead>
                  <tr><th>Fila</th><th>Placa</th><th>Cédula</th><th>Conductor</th><th>Vehículo</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.n} className={f.errores.length ? 'bg-[#fdecec]' : f.estado === 'ok' ? 'bg-[#e6f4ea]' : f.estado === 'error' ? 'bg-[#fff4e0]' : ''}>
                      <td className="tabular-nums">{f.n}</td>
                      <td className="font-bold">{f.fila.placa || '—'}</td>
                      <td>{f.fila.cedulaConductor || '—'}</td>
                      <td>{f.fila.nombreConductor || '—'}</td>
                      <td className="text-slate-500">{[f.fila.marca, f.fila.modelo, f.fila.anio, f.fila.color].filter(Boolean).join(' · ') || '—'}</td>
                      <td>
                        {f.errores.length > 0 && <span className="text-[#8f2a2d] font-bold">{f.errores.join(' · ')}</span>}
                        {!f.errores.length && f.estado === 'pendiente' && <span className="badge badge-gray">Lista</span>}
                        {f.estado === 'enviando' && <span className="inline-flex items-center gap-1 text-brand-700 font-bold"><Spinner size="sm" /> Incluyendo…</span>}
                        {f.estado === 'ok' && (
                          <span className="badge badge-green">
                            Certificado {f.resultado?.ccerti}{f.resultado?.yaExistia ? ' (ya estaba)' : ''}{f.resultado?.origen === 'NEXUS' ? ' · Nexus' : ''}
                          </span>
                        )}
                        {f.estado === 'error' && <span className="text-[#8f2a2d] font-bold break-all">{f.resultado?.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {paso === 3 && (
              <div className="flex flex-wrap justify-between gap-2">
                <button className="btn-ghost" onClick={() => setPaso(2)}>Cambiar archivo</button>
                <button className="btn-primary" disabled={!validas.length || emitiendo} onClick={() => void emitir()}>
                  {Ic.shield('w-3.5 h-3.5')} Emitir póliza de flota ({validas.length} conductores)
                </button>
              </div>
            )}
            {paso === 4 && !emitiendo && errorPoliza && (
              <div className="flex justify-end"><button className="btn-primary" onClick={() => void emitir()}>{Ic.refresh('w-3.5 h-3.5')} Reintentar</button></div>
            )}
          </div>
        )}

        {paso === 5 && cnpoliza && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="gradient-brand text-white rounded-xl p-4 md:col-span-2">
              <p className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">Póliza de flota</p>
              <p className="text-2xl font-extrabold tabular-nums">{cnpoliza}</p>
              <p className="text-xs opacity-80 mt-1">{usarActiva ? 'Conductores agregados a la póliza activa' : `${datos.tomadorNombre} · ${datos.cplan} · ${datos.fdesde} → ${datos.fhasta}`}</p>
            </div>
            <div className="card-inset">
              <p className="stat-label">Certificados OK</p>
              <p className="text-2xl font-extrabold text-emerald-700 tabular-nums">{ok}</p>
            </div>
            <div className="card-inset">
              <p className="stat-label">Fallidos</p>
              <p className={`text-2xl font-extrabold tabular-nums ${fallidas ? 'text-[#8f2a2d]' : 'text-slate-400'}`}>{fallidas}</p>
            </div>
            <div className="md:col-span-4 flex flex-wrap gap-2 justify-end">
              {fallidas > 0 && (
                <button className="btn-secondary" disabled={emitiendo} onClick={() => void reintentar()}>
                  {emitiendo ? <Spinner size="sm" /> : Ic.refresh('w-3.5 h-3.5')} Reintentar fallidos ({fallidas})
                </button>
              )}
              <span className="text-xs text-slate-500 self-center">El link web de la póliza está arriba, en "Póliza activa de la flota".</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CrearFlotaTab;
