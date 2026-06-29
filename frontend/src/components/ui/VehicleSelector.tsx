import React, { useState, useEffect, useCallback } from 'react';
import {
  seguroCatalogoApi,
  CatalogoMarca, CatalogoModelo, CatalogoVersion, CotizacionResult,
} from '../../api';
import { Spinner } from './Spinner';
import { Ic } from './Icons';

export interface VehicleSelection {
  fano: number;
  cmarca: string; xmarca: string;
  cmodelo: string; xmodelo: string;
  cversion: string; xversion: string;
  cotizacion?: CotizacionResult;
}

interface Props {
  /** Plan activo del tenant (ej: "RCVBAS") para la cotización */
  cplan?: string;
  /** Categoría de uso por defecto (1 = particular) */
  ccategoriaUso?: number;
  /** Callback al hacer click en "Autocompletar" */
  onApply: (sel: VehicleSelection) => void;
  /** Si hay sesión activa — sin sesión no podemos llamar a la API */
  hasSession: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();

export function VehicleSelector({ cplan = 'RCVBAS', ccategoriaUso = 1, onApply, hasSession }: Props) {
  const [open, setOpen]               = useState(false);
  const [fano, setFano]               = useState<number>(CURRENT_YEAR);
  const [marcas,  setMarcas]          = useState<CatalogoMarca[]>([]);
  const [modelos, setModelos]         = useState<CatalogoModelo[]>([]);
  const [versiones, setVersiones]     = useState<CatalogoVersion[]>([]);

  const [cmarca,   setCmarca]   = useState('');
  const [cmodelo,  setCmodelo]  = useState('');
  const [cversion, setCversion] = useState('');

  const [loadingMarcas,   setLoadingMarcas]   = useState(false);
  const [loadingModelos,  setLoadingModelos]  = useState(false);
  const [loadingVersiones,setLoadingVersiones]= useState(false);
  const [cotizacion,      setCotizacion]      = useState<CotizacionResult | null>(null);
  const [cotizando,       setCotizando]       = useState(false);
  const [cotError,        setCotError]        = useState('');

  // ── Cargar marcas cuando se abre o cambia año ──────────────────────────────
  const cargarMarcas = useCallback(async (y: number) => {
    if (!hasSession) return;
    setLoadingMarcas(true);
    setCmarca(''); setCmodelo(''); setCversion('');
    setModelos([]); setVersiones([]); setCotizacion(null);
    try {
      const { data } = await seguroCatalogoApi.marcas(y);
      setMarcas(data);
    } catch { setMarcas([]); }
    finally { setLoadingMarcas(false); }
  }, [hasSession]);

  useEffect(() => { if (open) cargarMarcas(fano); }, [open, fano, cargarMarcas]);

  // ── Cargar modelos cuando cambia marca ─────────────────────────────────────
  useEffect(() => {
    if (!cmarca || !hasSession) return;
    setCmodelo(''); setCversion(''); setVersiones([]); setCotizacion(null);
    setLoadingModelos(true);
    seguroCatalogoApi.modelos(fano, cmarca)
      .then(r => setModelos(r.data))
      .catch(() => setModelos([]))
      .finally(() => setLoadingModelos(false));
  }, [cmarca, fano, hasSession]);

  // ── Cargar versiones cuando cambia modelo ──────────────────────────────────
  useEffect(() => {
    if (!cmodelo || !hasSession) return;
    setCversion(''); setCotizacion(null);
    setLoadingVersiones(true);
    seguroCatalogoApi.versiones(fano, cmarca, cmodelo)
      .then(r => setVersiones(r.data))
      .catch(() => setVersiones([]))
      .finally(() => setLoadingVersiones(false));
  }, [cmodelo, cmarca, fano, hasSession]);

  // ── Cotizar automáticamente cuando cversion queda seleccionado ────────────
  useEffect(() => {
    if (!cversion || !hasSession) return;
    setCotizando(true); setCotError(''); setCotizacion(null);
    seguroCatalogoApi.cotizar({ cmarca, cmodelo, cversion, fano, cplan, ccategoria_uso: ccategoriaUso })
      .then(r => {
        setCotizacion(r.data);
        if (r.data.mprima === '0.00') {
          setCotError('Prima devuelta como 0.00 — posiblemente este plan no tiene tarifa activa.');
        }
      })
      .catch(e => setCotError(e?.response?.data?.message ?? 'Error al cotizar'))
      .finally(() => setCotizando(false));
  }, [cversion, cmarca, cmodelo, fano, cplan, ccategoriaUso, hasSession]);

  const xmarca   = marcas.find(m => m.cmarca === cmarca)?.xmarca ?? '';
  const xmodelo  = modelos.find(m => m.cmodelo === cmodelo)?.xmodelo ?? '';
  const xversion = versiones.find(v => v.cversion === cversion)?.xversion ?? '';

  const canApply = !!(cmarca && cmodelo && cversion && cotizacion && cotizacion.mprima !== '0.00');

  function handleApply() {
    if (!canApply) return;
    onApply({ fano, cmarca, xmarca, cmodelo, xmodelo, cversion, xversion, cotizacion: cotizacion! });
    setOpen(false);
  }

  if (!hasSession) return null;

  return (
    <div className="rounded-xl border border-brand-200/60 bg-brand-50/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-brand-700 hover:bg-brand-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          {Ic.car?.() ?? '🚗'}
          Asistente de Vehículo — selecciona marca/modelo/versión y obtén prima al instante
        </span>
        <span className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-brand-100">
          {/* Año */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
            <div>
              <label className="label">Año</label>
              <input
                type="number"
                min={2000} max={CURRENT_YEAR + 1}
                value={fano}
                onChange={e => { setFano(+e.target.value); setCmarca(''); }}
                className="input-sm w-full"
              />
            </div>

            {/* Marca */}
            <div>
              <label className="label flex items-center gap-1">
                Marca {loadingMarcas && <Spinner size="sm" />}
              </label>
              <select
                value={cmarca}
                onChange={e => setCmarca(e.target.value)}
                className="input-sm w-full"
                disabled={loadingMarcas || marcas.length === 0}
              >
                <option value="">— Selecciona —</option>
                {marcas.map(m => (
                  <option key={m.cmarca} value={m.cmarca}>{m.xmarca}</option>
                ))}
              </select>
            </div>

            {/* Modelo */}
            <div>
              <label className="label flex items-center gap-1">
                Modelo {loadingModelos && <Spinner size="sm" />}
              </label>
              <select
                value={cmodelo}
                onChange={e => setCmodelo(e.target.value)}
                className="input-sm w-full"
                disabled={!cmarca || loadingModelos || modelos.length === 0}
              >
                <option value="">— Selecciona —</option>
                {modelos.map(m => (
                  <option key={m.cmodelo} value={m.cmodelo}>{m.xmodelo}</option>
                ))}
              </select>
            </div>

            {/* Versión */}
            <div>
              <label className="label flex items-center gap-1">
                Versión {loadingVersiones && <Spinner size="sm" />}
              </label>
              <select
                value={cversion}
                onChange={e => setCversion(e.target.value)}
                className="input-sm w-full"
                disabled={!cmodelo || loadingVersiones || versiones.length === 0}
              >
                <option value="">— Selecciona —</option>
                {versiones.map(v => (
                  <option key={v.cversion} value={v.cversion}>{v.xversion}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Resultado cotización */}
          {(cotizando || cotizacion || cotError) && (
            <div className={[
              'rounded-xl p-3 text-xs border',
              cotError && !cotizacion ? 'bg-amber-50 border-amber-200 text-amber-700'
                : cotizacion?.mprima !== '0.00' ? 'bg-emerald-50 border-emerald-200'
                : 'bg-amber-50 border-amber-200 text-amber-700',
            ].join(' ')}>
              {cotizando ? (
                <span className="flex items-center gap-2 text-slate-600"><Spinner size="sm" /> Calculando prima…</span>
              ) : cotizacion ? (
                <div className="space-y-1">
                  <p className="font-extrabold text-slate-700 mb-2 flex items-center gap-1.5">
                    {cotizacion.mprima !== '0.00' ? '✓' : '⚠'} Cotización — Plan {cplan}
                  </p>
                  {cotizacion.mprima !== '0.00' ? (
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-white/80 rounded-lg p-2 border border-emerald-100">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide">Prima (Bs)</p>
                        <p className="font-extrabold text-emerald-700 text-sm mt-0.5">
                          {Number(cotizacion.mprima).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="bg-white/80 rounded-lg p-2 border border-emerald-100">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide">Prima (USD)</p>
                        <p className="font-extrabold text-emerald-700 text-sm mt-0.5">
                          ${Number(cotizacion.mprimaext).toFixed(2)}
                        </p>
                      </div>
                      <div className="bg-white/80 rounded-lg p-2 border border-slate-100">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide">Tasa BCV</p>
                        <p className="font-extrabold text-slate-700 text-sm mt-0.5">
                          {cotizacion.ptasa.toLocaleString('es-VE', { minimumFractionDigits: 4 })}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p>{cotError || 'Prima 0.00 — plan sin tarifa activa para este vehículo'}</p>
                  )}
                </div>
              ) : cotError ? (
                <p>{cotError}</p>
              ) : null}
            </div>
          )}

          {/* Botón aplicar */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleApply}
              disabled={!canApply}
              className="btn-success text-xs py-1.5 px-4 h-auto disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {Ic.check()} Autocompletar JSON con estos códigos
            </button>
            {cmarca && (
              <span className="text-xs text-slate-500">
                {xmarca} · {xmodelo || '…'} · {xversion || '…'} · {fano}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
