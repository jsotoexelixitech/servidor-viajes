import React, { useEffect } from 'react';
import type { Viaje } from '../../api';
import { Ic } from './Icons';

export function PolizaModal({ viaje, onClose }: { viaje: Viaje; onClose: () => void }) {
  const print = () => window.print();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const fechaEmision = new Date(viaje.creadoEn);
  const fechaVigencia = new Date(fechaEmision.getTime() + 365 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in poliza-modal-overlay"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-3xl max-h-[96vh] sm:max-h-[92vh] overflow-hidden flex flex-col poliza-modal-content"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50 no-print">
          <div className="flex items-center gap-3">
            <span className="badge bg-amber-100 text-amber-800 ring-1 ring-amber-200">DEMO</span>
            <span className="text-sm font-bold text-slate-700">Vista previa · Póliza {viaje.cnpoliza}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={print} className="btn-secondary text-xs h-8 py-0 px-3">
              Imprimir / Guardar PDF
            </button>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-all">
              {Ic.close()}
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-5 sm:p-8 poliza-doc">
          <div className="flex items-start justify-between gap-3 border-b-4 border-brand-600 pb-4 sm:pb-5 mb-5 sm:mb-6">
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-xl font-extrabold text-brand-700 tracking-tight leading-tight">PÓLIZA DE RESPONSABILIDAD CIVIL VEHICULAR</h1>
              <p className="text-[11px] sm:text-xs text-slate-700 mt-1.5 font-medium">Plan RCV Básico · Ramo 18 · Cobertura Anual</p>
            </div>
            <div className="text-right shrink-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white ring-1 ring-slate-200 flex items-center justify-center ml-auto p-1"
                style={{ boxShadow: '0 3px 8px -1px rgb(15 26 90 / .15)' }}>
                <img src="/logo-isotipo-transparente.png" alt="La Mundial" className="w-full h-full object-contain" />
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5 font-bold uppercase tracking-wider hidden sm:block">Documento Oficial</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 sm:gap-x-8 gap-y-3 mb-5 sm:mb-6 text-sm">
            <div><p className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider mb-0.5">N° de Póliza</p><p className="font-mono font-extrabold text-slate-900 text-base">{viaje.cnpoliza}</p></div>
            <div><p className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider mb-0.5">N° de Recibo</p><p className="font-mono font-extrabold text-slate-900 text-base">{viaje.cnrecibo}</p></div>
            <div><p className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider mb-0.5">Fecha de Emisión</p><p className="font-bold text-slate-900">{fmt(fechaEmision)}</p></div>
            <div><p className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider mb-0.5">Vigencia hasta</p><p className="font-bold text-slate-900">{fmt(fechaVigencia)}</p></div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 sm:p-5 mb-4 sm:mb-5 border border-slate-200">
            <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-3">Datos del Tomador</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
              <div><p className="text-[11px] text-slate-700 font-semibold mb-0.5">Nombre completo</p><p className="font-bold text-slate-900">{viaje.nombreConductor}</p></div>
              <div className="min-w-0"><p className="text-[11px] text-slate-700 font-semibold mb-0.5">Tenant ID</p><p className="font-mono text-xs text-slate-700 truncate">{viaje.tenantId}</p></div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 sm:p-5 mb-4 sm:mb-5 border border-slate-200">
            <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-3">Vehículo asegurado</p>
            <div className="grid grid-cols-3 gap-3 sm:gap-4 text-sm">
              <div><p className="text-[11px] text-slate-700 font-semibold mb-0.5">Placa</p><p className="font-mono font-extrabold text-slate-900">{viaje.numeroPlaca}</p></div>
              <div><p className="text-[11px] text-slate-700 font-semibold mb-0.5">Modelo</p><p className="font-bold text-slate-900">{viaje.modeloVehiculo}</p></div>
              <div><p className="text-[11px] text-slate-700 font-semibold mb-0.5">Año</p><p className="font-bold text-slate-900">{viaje.anioVehiculo}</p></div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl mb-5 overflow-hidden">
            <div className="bg-brand-50 px-5 py-2.5 border-b border-slate-200">
              <p className="text-[11px] font-extrabold text-brand-700 uppercase tracking-wider">Coberturas Incluidas</p>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {[['Daños a personas', 'Bs. 500.000,00'], ['Daños a cosas', 'Bs. 500.000,00'], ['Defensa Penal', 'Bs. 50.000,00'], ['Asistencia en carretera', 'Incluido']].map(([label, val]) => (
                  <tr key={label} className="border-t border-slate-100 first:border-t-0">
                    <td className="px-5 py-2.5 text-slate-700">{label}</td>
                    <td className="px-5 py-2.5 text-right font-mono font-bold text-slate-900">{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 mb-5 text-xs">
            <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-2">Trayecto registrado</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div><p className="text-slate-700 font-semibold mb-0.5">Origen</p><p className="font-mono text-slate-800">{viaje.latInicio.toFixed(4)}, {viaje.lngInicio.toFixed(4)}</p></div>
              <div><p className="text-slate-700 font-semibold mb-0.5">Destino</p><p className="font-mono text-slate-800">{viaje.latDestino.toFixed(4)}, {viaje.lngDestino.toFixed(4)}</p></div>
            </div>
          </div>

          <div className="text-center text-[10px] text-slate-700 mt-8 pt-5 border-t border-slate-200 leading-relaxed">
            <p className="font-bold text-slate-700">Documento generado por La Mundial de Seguros · ExelixiTech</p>
            <p className="mt-1">Este es un documento de demostración generado automáticamente. No tiene validez legal.</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .poliza-doc, .poliza-doc * { visibility: visible; }
          .poliza-modal-overlay { position: static !important; background: white !important; backdrop-filter: none !important; padding: 0 !important; }
          .poliza-modal-content { box-shadow: none !important; border-radius: 0 !important; max-height: none !important; max-width: none !important; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
    </div>
  );
}
