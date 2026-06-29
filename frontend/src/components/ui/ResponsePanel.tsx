import React from 'react';
import type { ReqStatus } from '../../types';
import { Ic } from './Icons';
import { StatusPill } from './StatusPill';
import { JsonBox } from './JsonBox';

export function ResponsePanel({ status, data }: { status: ReqStatus; data: unknown }) {
  if (status === 'idle' || data === null || data === undefined) return null;
  const ok = status === 'success';
  return (
    <div className={`mt-5 animate-in rounded-[var(--radius)] border p-4 ${ok ? 'border-emerald-200/60 bg-emerald-50/40' : 'border-red-200/60 bg-red-50/40'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${ok ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
            {ok ? Ic.check('w-3 h-3') : Ic.warn('w-3 h-3')}
          </div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Respuesta del servidor</span>
        </div>
        <StatusPill status={status} />
      </div>
      <JsonBox data={data} />
    </div>
  );
}
