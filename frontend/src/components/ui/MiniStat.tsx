import React from 'react';

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
      <p className="stat-label">{label}</p>
      <p className="text-sm sm:text-base font-extrabold text-slate-800 tabular-nums mt-0.5">{value}</p>
    </div>
  );
}
