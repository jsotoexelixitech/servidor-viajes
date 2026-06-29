import React, { FormEvent } from 'react';
import type { ReqStatus } from '../types';
import { Ic } from '../components/ui/Icons';
import { Spinner } from '../components/ui/Spinner';
import { PageHeader } from '../components/ui/PageHeader';
import { ResponsePanel } from '../components/ui/ResponsePanel';

export interface FinalizarPanelProps {
  idViaje: string;
  setIdViaje: (v: string) => void;
  reqStatus: ReqStatus;
  response: unknown;
  hasResponse: boolean;
  handleFinalizar: (e: FormEvent) => void;
}

export function FinalizarPanel({
  idViaje, setIdViaje, reqStatus, response, hasResponse, handleFinalizar,
}: FinalizarPanelProps) {
  return (
    <div className="animate-in">
      <PageHeader title="Finalizar Viaje" subtitle="Cierra el viaje activo y marca la póliza como finalizada" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-6">
          <p className="section-title mb-4 flex items-center gap-1.5">{Ic.stop()} POST /api/viaje/finalizar</p>
          <form onSubmit={handleFinalizar} className="space-y-4">
            <div>
              <label className="label">ID del Viaje (UUID) <span className="text-red-400">*</span></label>
              <input className="input font-mono text-sm" value={idViaje}
                onChange={e => setIdViaje(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required />
              <p className="text-xs text-slate-600 mt-1.5 flex items-center gap-1">
                {Ic.info('w-3 h-3')} Cópialo de la respuesta de "Iniciar Viaje" o de la tabla Viajes
              </p>
            </div>
            <button type="submit" className="btn-danger w-full" disabled={reqStatus === 'loading'}>
              {reqStatus === 'loading' ? <><Spinner size="sm" />Procesando…</> : <>{Ic.stop()} Finalizar Viaje</>}
            </button>
          </form>
        </div>
        <div className="alert-warn h-fit">
          <p className="text-sm font-bold text-amber-800 flex items-center gap-2 mb-2">{Ic.warn()} Acción irreversible</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Finalizar marca la póliza como <strong>FINALIZADA</strong> y elimina datos temporales.
            Esta acción <strong>no puede deshacerse</strong>.
          </p>
        </div>
      </div>
      <ResponsePanel status={reqStatus} data={hasResponse ? response : null} />
    </div>
  );
}
