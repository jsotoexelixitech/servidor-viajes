import React from 'react';
import type { ReqStatus } from '../types';
import type { Viaje } from '../api';
import { Ic } from '../components/ui/Icons';
import { Spinner } from '../components/ui/Spinner';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { EstadoDot } from '../components/ui/EstadoDot';
import { POLIZA_BADGE } from '../constants';

export interface ViajesListPanelProps {
  viajes: Viaje[];
  totalViajes: number;
  reqStatus: ReqStatus;
  demoOn: boolean;
  handleListar: () => void;
  onViewPoliza: (v: Viaje) => void;
}

export function ViajesListPanel({
  viajes, totalViajes, reqStatus, demoOn, handleListar, onViewPoliza,
}: ViajesListPanelProps) {
  return (
    <div className="animate-in">
      <PageHeader title="Viajes Activos" subtitle="Listado de viajes del cliente conectado"
        action={
          <button onClick={handleListar} className="btn-primary" disabled={reqStatus === 'loading'}>
            {reqStatus === 'loading' ? <><Spinner size="sm" />Cargando</> : <>{Ic.refresh()} Actualizar</>}
          </button>
        }
      />

      {totalViajes > 0 && (
        <p className="text-xs text-slate-600 -mt-4 mb-4 font-medium">
          Mostrando <strong className="text-slate-600">{viajes.length}</strong> de <strong className="text-slate-600">{totalViajes}</strong> viajes
        </p>
      )}

      {viajes.length > 0 ? (
        <div className="card overflow-hidden animate-in">
          <div className="overflow-x-auto max-h-[68vh]">
            <table className="data-table">
              <thead className="sticky top-0 z-10 bg-[#f1f5f9] shadow-[inset_0_-1px_0_#e2e8f0]">
                <tr>{['ID', 'Placa', 'Conductor', 'Estado', 'Póliza', 'Estado Póliza', 'PDF', 'Creado'].map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {viajes.map(v => (
                  <tr key={v.id}>
                    <td><code className="text-[11px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md">{v.id.substring(0, 8)}…</code></td>
                    <td><span className="font-mono font-extrabold text-slate-800">{v.numeroPlaca || '—'}</span></td>
                    <td><span className="text-slate-700 font-medium">{v.nombreConductor || '—'}</span></td>
                    <td><EstadoDot estado={v.estado} /></td>
                    <td><code className="text-[11px] font-mono text-slate-500">{v.cnpoliza || '—'}</code></td>
                    <td><span className={POLIZA_BADGE[v.estadoPoliza ?? ''] ?? 'badge badge-gray'}>{v.estadoPoliza || '—'}</span></td>
                    <td>
                      {v.urlPolizaPDF
                        ? (demoOn
                            ? <button onClick={() => onViewPoliza(v)}
                                className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800 font-semibold text-xs underline underline-offset-2 transition-colors">
                                {Ic.link()} Ver PDF
                              </button>
                            : <a href={v.urlPolizaPDF} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800 font-semibold text-xs underline underline-offset-2 transition-colors">
                                {Ic.link()} Ver PDF
                              </a>
                          )
                        : <span className="text-slate-200">—</span>}
                    </td>
                    <td className="text-xs text-slate-600 whitespace-nowrap font-medium">
                      {new Date(v.creadoEn).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : reqStatus !== 'loading' ? (
        <EmptyState icon={Ic.rows('w-6 h-6')} title="No hay viajes activos" sub='Haz clic en "Actualizar" para consultar el servidor' />
      ) : null}
    </div>
  );
}
