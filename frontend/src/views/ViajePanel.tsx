import React, { FormEvent } from 'react';
import type { ReqStatus } from '../types';
import { Ic } from '../components/ui/Icons';
import { Spinner } from '../components/ui/Spinner';
import { PageHeader } from '../components/ui/PageHeader';
import { JsonBox } from '../components/ui/JsonBox';
import { CopyButton } from '../components/ui/CopyButton';
import { ResponsePanel } from '../components/ui/ResponsePanel';
import { VehicleSelector, VehicleSelection } from '../components/ui/VehicleSelector';

export interface ViajePanelProps {
  viajeRaw: string;
  setViajeRaw: (v: string) => void;
  exampleBody: Record<string, string | number>;
  reqStatus: ReqStatus;
  response: unknown;
  hasResponse: boolean;
  handleIniciar: (e: FormEvent) => void;
  /** Plan del tenant (para cotización) */
  cplan?: string;
  /** true cuando hay session token activo */
  hasSession: boolean;
}

export function ViajePanel({
  viajeRaw, setViajeRaw, exampleBody, reqStatus, response, hasResponse, handleIniciar,
  cplan = 'RCVBAS', hasSession,
}: ViajePanelProps) {

  /** Cuando el usuario selecciona un vehículo en el asistente, inyectamos los
   *  códigos INMA (cmarca, cmodelo, cversion, fano) en el JSON del textarea. */
  function handleVehicleApply(sel: VehicleSelection) {
    let base: Record<string, unknown> = {};
    try { base = JSON.parse(viajeRaw || JSON.stringify(exampleBody)); } catch { base = { ...exampleBody }; }

    const updated = {
      ...base,
      fano:     sel.fano,
      cmarca:   sel.cmarca,
      cmodelo:  sel.cmodelo,
      cversion: sel.cversion,
    };
    setViajeRaw(JSON.stringify(updated, null, 2));
  }

  return (
    <div className="animate-in">
      <PageHeader title="Iniciar Viaje" subtitle="Registra el inicio de un viaje — la póliza se emite automáticamente" />

      {/* ── Asistente de vehículo ─────────────────────────────────────────── */}
      <div className="mb-5">
        <VehicleSelector
          cplan={cplan}
          ccategoriaUso={1}
          hasSession={hasSession}
          onApply={handleVehicleApply}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="section-title flex items-center gap-1.5">{Ic.play()} POST /api/viaje/iniciar</p>
            {viajeRaw && (
              <button type="button" onClick={() => setViajeRaw('')}
                className="btn-ghost text-xs py-1 px-2 h-auto">
                {Ic.close()} Limpiar
              </button>
            )}
          </div>
          <form onSubmit={handleIniciar} className="space-y-4">
            <div>
              <label className="label">Body JSON</label>
              <textarea value={viajeRaw} onChange={e => setViajeRaw(e.target.value)}
                placeholder={JSON.stringify(exampleBody, null, 2)}
                className="input font-mono text-xs resize-none h-80 leading-relaxed"
                spellCheck={false} />
            </div>
            <button type="submit" className="btn-success w-full" disabled={reqStatus === 'loading'}>
              {reqStatus === 'loading' ? <><Spinner size="sm" />Procesando…</> : <>{Ic.play()} Iniciar Viaje y Emitir Póliza</>}
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-slate-600">Referencia (según tu mapeo)</p>
              <div className="flex items-center gap-2">
                <CopyButton text={JSON.stringify(exampleBody, null, 2)} />
                <button onClick={() => setViajeRaw(JSON.stringify(exampleBody, null, 2))}
                  className="btn-secondary text-xs py-1 px-2.5 h-auto rounded-lg">
                  Usar JSON
                </button>
              </div>
            </div>
            <JsonBox data={exampleBody} />
          </div>

          <div className="alert-info">
            <p className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">{Ic.info()} Flujo de emisión</p>
            <ol className="text-xs text-blue-700 space-y-1.5 leading-relaxed">
              {['Viaje registrado en base de datos', 'Póliza emitida de forma sincrónica',
                'Si falla → reintentos exponenciales (hasta 3h)',
                'estadoPoliza refleja el estado en tiempo real']
                .map((s, i) => (
                  <li key={i} className="flex gap-2"><span className="font-extrabold shrink-0">{i + 1}.</span>{s}</li>
              ))}
            </ol>
          </div>

          <div className="card p-4 border-amber-200/60 bg-amber-50/40">
            <p className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1.5">
              {Ic.info('w-3.5 h-3.5')} Códigos INMA obligatorios
            </p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Los campos <code className="bg-amber-100 px-1 rounded">cmarca</code>, <code className="bg-amber-100 px-1 rounded">cmodelo</code> y <code className="bg-amber-100 px-1 rounded">cversion</code> deben ser
              los <strong>códigos exactos del catálogo INMA</strong>, no nombres descriptivos.
              Usa el asistente de arriba para seleccionarlos y obtener la prima antes de emitir.
            </p>
          </div>
        </div>
      </div>
      <ResponsePanel status={reqStatus} data={hasResponse ? response : null} />
    </div>
  );
}
