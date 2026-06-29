import React, { FormEvent } from 'react';
import type { ReqStatus } from '../types';
import { CAMPOS_SEGURO, SeguroConfig, FRECUENCIAS, CampoSeguro } from '../api';
import { Ic } from '../components/ui/Icons';
import { Spinner } from '../components/ui/Spinner';
import { PageHeader } from '../components/ui/PageHeader';
import { SectionCard } from '../components/ui/SectionCard';
import { CopyButton } from '../components/ui/CopyButton';
import { JsonBox } from '../components/ui/JsonBox';
import { StatusPill } from '../components/ui/StatusPill';
import { TIPO_BADGE, GRUPO_META } from '../constants';

function FieldRow({
  campo, mappedVal, defVal, onMap, onClear,
}: {
  campo: CampoSeguro;
  mappedVal: string;
  defVal: string;
  onMap: (v: string) => void;
  onClear: () => void;
}) {
  const isMapped = mappedVal.trim() !== '';
  return (
    <div className={[
      'grid items-center gap-2 sm:gap-3 px-2.5 sm:px-3 py-2.5 rounded-xl border transition-all duration-150',
      'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_60px] sm:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_72px]',
      isMapped  ? 'bg-brand-50/60 border-brand-200/70'
        : defVal ? 'bg-emerald-50/50 border-emerald-100'
        : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/40',
    ].join(' ')}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <code className="text-[11px] font-mono font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md truncate max-w-[130px] block">
            {campo.key}
          </code>
          {campo.requerido && <span className="text-red-400 text-[10px] font-bold leading-none shrink-0">REQ</span>}
        </div>
        <p className="text-[11px] text-slate-600 truncate">{campo.descripcion}</p>
      </div>
      <span className="text-slate-200 font-bold text-center select-none hidden sm:block">←</span>
      <div className="flex items-center gap-1 min-w-0">
        <input
          type="text" value={mappedVal}
          onChange={e => onMap(e.target.value)}
          placeholder={defVal ? `default: ${defVal}` : campo.key}
          className={['input-sm flex-1 min-w-0', isMapped ? 'border-brand-300/80 bg-white font-medium text-brand-800' : ''].join(' ')}
        />
        {isMapped && (
          <button type="button" onClick={onClear}
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded-md text-slate-500 hover:text-red-400 hover:bg-red-50 transition-all">
            {Ic.close()}
          </button>
        )}
      </div>
      <span className={TIPO_BADGE[campo.tipo]}>{campo.tipo}</span>
    </div>
  );
}

export interface MapeoPanelProps {
  seguroConfig: SeguroConfig;
  setSeguroConfig: (fn: (prev: SeguroConfig) => SeguroConfig) => void;
  fieldMappings: Record<string, string>;
  defaultValues: Record<string, string>;
  grupoActivo: 'vehiculo' | 'tomador' | 'interno';
  setGrupoActivo: (g: 'vehiculo' | 'tomador' | 'interno') => void;
  mapeoLoading: boolean;
  mapeoSaved: boolean;
  reqStatus: ReqStatus;
  exampleBody: Record<string, string | number>;
  mappedCount: number;
  defaultCount: number;
  handleGuardarMapeo: (e: FormEvent) => void;
  setMapping: (k: string, v: string) => void;
  clearMapping: (k: string) => void;
  setDefaultVal: (k: string, v: string) => void;
  clearDefault: (k: string) => void;
}

export function MapeoPanel({
  seguroConfig, setSeguroConfig,
  fieldMappings, defaultValues,
  grupoActivo, setGrupoActivo,
  mapeoLoading, mapeoSaved, reqStatus,
  exampleBody, mappedCount, defaultCount,
  handleGuardarMapeo,
  setMapping, clearMapping, setDefaultVal, clearDefault,
}: MapeoPanelProps) {
  const camposGrupo = CAMPOS_SEGURO.filter(c => c.grupo === grupoActivo);

  return (
    <div className="animate-in">
      <PageHeader
        title="Configuración del Cliente"
        subtitle="Conexión al servicio, mapeo de campos y valores por defecto"
        action={
          <div className="flex items-center gap-2">
            {mappedCount  > 0 && <span className="badge badge-blue">{mappedCount} mapeados</span>}
            {defaultCount > 0 && <span className="badge badge-green">{defaultCount} con default</span>}
          </div>
        }
      />
      {mapeoLoading ? (
        <div className="card p-16 flex items-center justify-center gap-3 text-slate-600">
          <Spinner size="lg" /><span className="text-sm font-medium">Cargando configuración…</span>
        </div>
      ) : (
        <form onSubmit={handleGuardarMapeo} className="space-y-5">
          <SectionCard num={1} title="Conexión al servicio">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">URL del servicio <span className="text-red-400">*</span></label>
                <input className="input" value={seguroConfig.baseUrl}
                  onChange={e => setSeguroConfig(p => ({ ...p, baseUrl: e.target.value }))}
                  placeholder="https://api.tu-aseguradora.com" required />
              </div>
              <div>
                <label className="label">Token de autenticación</label>
                <input className="input" type="password" value={seguroConfig.authToken ?? ''}
                  onChange={e => setSeguroConfig(p => ({ ...p, authToken: e.target.value }))}
                  placeholder="Bearer token (si aplica)" />
              </div>
              <div>
                <label className="label">Frecuencia de pago</label>
                <select className="input" value={seguroConfig.frecuencia}
                  onChange={e => setSeguroConfig(p => ({ ...p, frecuencia: e.target.value }))}>
                  {FRECUENCIAS.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Plan <span className="text-red-400">*</span></label>
                <input className="input" value={seguroConfig.plan}
                  onChange={e => setSeguroConfig(p => ({ ...p, plan: e.target.value }))}
                  placeholder="Ej: RCVBAS" required />
              </div>
              <div>
                <label className="label">Código de ramo <span className="text-red-400">*</span></label>
                <input className="input" type="number" value={seguroConfig.cramo}
                  onChange={e => setSeguroConfig(p => ({ ...p, cramo: parseInt(e.target.value) }))}
                  placeholder="18" required />
              </div>
              <div>
                <label className="label">Código de productor</label>
                <input className="input" type="number" value={seguroConfig.productor ?? ''}
                  onChange={e => setSeguroConfig(p => ({ ...p, productor: parseInt(e.target.value) || undefined }))}
                  placeholder="Ej: 80080" />
              </div>
              <div>
                <label className="label">Usuario del sistema</label>
                <input className="input" value={seguroConfig.cusuario ?? ''}
                  onChange={e => setSeguroConfig(p => ({ ...p, cusuario: e.target.value || undefined }))}
                  placeholder="Usuario (si aplica)" />
              </div>
            </div>
          </SectionCard>

          <SectionCard num={2} title="Mapeo de campos">
            <p className="text-xs text-slate-600 -mt-2 mb-4 ml-7">
              Izquierda: nombre interno. Derecha: nombre que usa <strong className="text-slate-600">tu empresa</strong>. Vacío = usa el mismo nombre.
            </p>
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit mb-4">
              {(Object.keys(GRUPO_META) as Array<keyof typeof GRUPO_META>)
                .filter(g => g !== 'interno')
                .map(g => {
                  const cnt   = CAMPOS_SEGURO.filter(c => c.grupo === g && fieldMappings[c.key]?.trim()).length;
                  const total = CAMPOS_SEGURO.filter(c => c.grupo === g).length;
                  return (
                    <button key={g} type="button" onClick={() => setGrupoActivo(g)}
                      className={['flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all',
                        grupoActivo === g ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                      ].join(' ')}>
                      <span>{GRUPO_META[g].icon}</span>
                      <span>{GRUPO_META[g].label}</span>
                      <span className={`text-[10px] font-extrabold ${grupoActivo === g ? 'text-brand-500' : 'text-slate-600'}`}>
                        {cnt}/{total}
                      </span>
                    </button>
                  );
              })}
            </div>
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_72px] gap-3 px-3 py-1 mb-1 text-[10px] font-extrabold text-slate-500 uppercase tracking-[0.1em]">
              <span>Campo interno</span><span /><span>Nombre en tu empresa</span><span>Tipo</span>
            </div>
            <div className="space-y-1.5">
              {camposGrupo.map((campo: CampoSeguro) => (
                <FieldRow key={campo.key} campo={campo}
                  mappedVal={fieldMappings[campo.key] ?? ''}
                  defVal={(defaultValues[campo.key] ?? '').trim()}
                  onMap={v => setMapping(campo.key, v)}
                  onClear={() => clearMapping(campo.key)}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard num={3} title="Valores por defecto">
            <p className="text-xs text-slate-600 -mt-2 mb-4 ml-7">
              Campos que tu empresa <strong className="text-slate-600">no envía</strong> por viaje. El sistema los aplica automáticamente.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {CAMPOS_SEGURO.filter(c => c.grupo !== 'interno').map(campo => {
                const val = defaultValues[campo.key] ?? '';
                return (
                  <div key={campo.key}>
                    <label className="label flex items-center gap-1">
                      <code className="font-mono normal-case font-semibold tracking-normal text-slate-500">{campo.key}</code>
                      {campo.requerido && <span className="text-red-400 text-[10px]">REQ</span>}
                    </label>
                    <div className="flex items-center gap-1">
                      <input value={val} onChange={e => setDefaultVal(campo.key, e.target.value)}
                        placeholder={campo.ejemplo || campo.key}
                        className={['input-sm flex-1', val ? 'border-emerald-300/80 bg-emerald-50/40 font-medium text-emerald-800' : ''].join(' ')} />
                      {val && (
                        <button type="button" onClick={() => clearDefault(campo.key)}
                          className="w-5 h-5 flex items-center justify-center rounded-md text-slate-500 hover:text-red-400 hover:bg-red-50 transition-all shrink-0">
                          {Ic.close()}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <div className="flex items-center gap-3 pb-1">
            <button type="submit" className="btn-success" disabled={reqStatus === 'loading'}>
              {reqStatus === 'loading' ? <><Spinner size="sm" />Guardando…</> : <>{Ic.check()} Guardar configuración</>}
            </button>
            {mapeoSaved && <span className="badge badge-green animate-in">{Ic.check('w-3 h-3')} Guardado</span>}
            {reqStatus !== 'loading' && <StatusPill status={reqStatus} />}
          </div>

          <div className="card border-dashed border-2 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-bold text-slate-600">JSON de ejemplo para tu empresa</p>
                <p className="text-[11px] text-slate-600 mt-0.5">POST /api/viaje/iniciar · según tu mapeo actual</p>
              </div>
              <CopyButton text={JSON.stringify(exampleBody, null, 2)} />
            </div>
            <JsonBox data={exampleBody} />
          </div>
        </form>
      )}
    </div>
  );
}
