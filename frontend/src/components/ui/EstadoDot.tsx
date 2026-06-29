import React from 'react';

export function EstadoDot({ estado }: { estado: string }) {
  const e = (estado || '').toUpperCase();
  const cfg =
    e === 'EN_CURSO' || e === 'ACTIVO'
      ? { color: 'bg-amber-500',   text: 'text-amber-800',   pulse: true,  label: 'En curso'    }
    : e === 'FINALIZADO'
      ? { color: 'bg-emerald-500', text: 'text-emerald-700', pulse: false, label: 'Finalizado'  }
    : e === 'ERROR'
      ? { color: 'bg-red-500',     text: 'text-red-700',     pulse: true,  label: 'Error'       }
      : { color: 'bg-slate-400',   text: 'text-slate-600',   pulse: false, label: estado || '—' };

  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${cfg.text}`}>
      <span className="relative flex w-1.5 h-1.5">
        {cfg.pulse && <span className={`absolute inset-0 rounded-full ${cfg.color} opacity-70 animate-ping`} />}
        <span className={`relative w-1.5 h-1.5 rounded-full ${cfg.color}`} />
      </span>
      {cfg.label}
    </span>
  );
}
