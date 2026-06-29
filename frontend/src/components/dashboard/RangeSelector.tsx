import React from 'react';
import type { RangoTemporal } from '../../api';

const RANGOS: { id: RangoTemporal; label: string }[] = [
  { id: 'hoy',  label: 'Hoy' },
  { id: '7d',   label: '7d' },
  { id: '30d',  label: '30d' },
  { id: 'mes',  label: 'Mes' },
  { id: 'todo', label: 'Todo' },
];

export function RangeSelector({
  value, onChange,
}: {
  value: RangoTemporal;
  onChange: (r: RangoTemporal) => void;
}) {
  return (
    <div className="inline-flex items-center bg-slate-100 rounded-lg p-0.5 ring-1 ring-slate-200/60">
      {RANGOS.map(r => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          className={`px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wide rounded-md transition-all ${
            value === r.id
              ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200'
              : 'text-slate-600 hover:text-slate-800'
          }`}>
          {r.label}
        </button>
      ))}
    </div>
  );
}
