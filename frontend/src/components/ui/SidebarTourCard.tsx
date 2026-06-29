import React, { useState } from 'react';
import { Ic } from './Icons';

export function SidebarTourCard() {
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('lm_tour_dismissed') !== '1'; }
    catch { return true; }
  });
  if (!open) return null;

  const dismiss = () => {
    try { localStorage.setItem('lm_tour_dismissed', '1'); } catch { /* noop */ }
    setOpen(false);
  };

  const items = [
    { k: 'Dashboard',    d: 'KPIs, rankings y conductores en curso del cliente seleccionado.' },
    { k: 'Cartera',      d: 'Resumen de todos los clientes (vista admin).' },
    { k: 'Conductores',  d: 'Alta/baja de conductores y % de comisión.' },
    { k: 'Iniciar Viaje',d: 'Crea un viaje y emite la póliza al instante.' },
    { k: 'Monitor',      d: 'Pólizas con error, en reintento o atascadas.' },
  ];

  return (
    <div className="mx-1 mb-2 rounded-xl p-3 bg-gradient-to-br from-brand-700 to-brand-500 text-white shadow-md relative animate-in">
      <button onClick={dismiss} title="Cerrar guía"
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
        {Ic.close('w-2.5 h-2.5')}
      </button>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-4 h-4 rounded bg-white/20 flex items-center justify-center text-[10px] font-extrabold">i</span>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em]">Guía rápida</p>
      </div>
      <ul className="space-y-1.5 text-[10.5px] leading-snug pr-2">
        {items.map(it => (
          <li key={it.k}>
            <span className="font-extrabold">{it.k}</span>
            <span className="text-white/75"> — {it.d}</span>
          </li>
        ))}
      </ul>
      <p className="text-[9.5px] text-white/70 mt-2 pt-2 border-t border-white/20">
        Pasa el mouse sobre los <span className="font-extrabold">?</span> para ayuda contextual.
      </p>
    </div>
  );
}
