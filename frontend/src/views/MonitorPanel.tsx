import React from 'react';
import { Ic } from '../components/ui/Icons';
import { Spinner } from '../components/ui/Spinner';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { POLIZA_BADGE } from '../constants';

export interface MonitorPanelProps {
  monitorData: Record<string, unknown> | null;
  monitorLoading: boolean;
  loadMonitor: () => void;
}

export function MonitorPanel({ monitorData, monitorLoading, loadMonitor }: MonitorPanelProps) {
  return (
    <div className="animate-in">
      <PageHeader title="Monitor de Pólizas" subtitle="Supervisión en tiempo real de pólizas pendientes o con error"
        action={
          <button onClick={loadMonitor} className="btn-secondary" disabled={monitorLoading}>
            {monitorLoading ? <><Spinner size="sm" />Actualizando</> : <>{Ic.refresh()} Actualizar</>}
          </button>
        }
      />

      {monitorLoading && !monitorData ? (
        <div className="card p-16 flex items-center justify-center gap-3 text-slate-600">
          <Spinner size="lg" /><span className="text-sm font-medium">Cargando monitor…</span>
        </div>
      ) : monitorData ? (() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = monitorData as any;
        return (
          <div className="space-y-5 stagger">
            <div className={`rounded-[var(--radius)] border p-5 flex items-center gap-4 ${d.alerta ? 'border-red-200/70 bg-red-50/60' : 'border-emerald-200/70 bg-emerald-50/60'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${d.alerta ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                {d.alerta ? Ic.warn('w-5 h-5') : Ic.check('w-5 h-5')}
              </div>
              <div>
                <p className={`font-bold text-sm ${d.alerta ? 'text-red-800' : 'text-emerald-800'}`}>{d.mensaje}</p>
                {d.alerta && <p className="text-xs text-red-600 mt-0.5">El sistema está reintentando automáticamente.</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total pendientes', val: d.resumen?.total    ?? 0, color: d.resumen?.total > 0 ? 'text-red-600' : 'text-emerald-600' },
                { label: 'Críticos',          val: d.resumen?.criticos ?? 0, color: 'text-red-500' },
                { label: 'Con error',         val: d.resumen?.errores  ?? 0, color: 'text-amber-600' },
                { label: 'Atascados',         val: d.resumen?.atascados ?? 0, color: 'text-slate-500' },
              ].map(s => (
                <div key={s.label} className="stat-card">
                  <span className={`stat-value ${s.color}`}>{s.val}</span>
                  <span className="stat-label">{s.label}</span>
                </div>
              ))}
            </div>

            {d.viajes?.length > 0 && (
              <div className="card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-50 bg-[#fafbfd] flex items-center justify-between">
                  <p className="section-title">Viajes que requieren atención</p>
                  <span className="badge badge-red">{d.viajes.length} pendientes</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead><tr>{['ID', 'Placa', 'Estado', 'Intentos', 'Último intento', 'Error'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {d.viajes.map((v: Record<string, unknown>) => (
                        <tr key={v.id as string}>
                          <td><code className="text-[11px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md">{(v.id as string)?.substring(0, 8)}…</code></td>
                          <td><span className="font-mono font-extrabold text-slate-800">{(v.numeroPlaca as string) || '—'}</span></td>
                          <td><span className={POLIZA_BADGE[(v.estadoPoliza as string) ?? ''] ?? 'badge badge-gray'}>{v.estadoPoliza as string}</span></td>
                          <td><span className="font-bold text-slate-600 tabular-nums">{(v.polizaIntentos as number) ?? 0}</span></td>
                          <td className="text-xs text-slate-600 whitespace-nowrap font-medium">
                            {v.polizaUltimoIntento ? new Date(v.polizaUltimoIntento as string).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                          </td>
                          <td className="text-xs text-red-500 max-w-xs truncate font-medium">{(v.polizaError as string) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })() : (
        <EmptyState icon={Ic.pulse('w-6 h-6')} title="Sin datos" sub="Haz clic en Actualizar para cargar el monitor" />
      )}
    </div>
  );
}
