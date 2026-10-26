import React from 'react';
import { Spinner } from './Spinner';
import { Sparkline } from './Sparkline';

export function KpiCard({
  icon, gradient, label, value, sub,
  loading, delta, trend, onClick, currency,
}: {
  icon: React.ReactNode;
  gradient: string;
  label: string;
  value: string;
  sub: string;
  loading: boolean;
  delta?: number;
  trend?: number[];
  onClick?: () => void;
  currency?: string;
}) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden ${gradient} rounded-[var(--radius)] p-3.5 sm:p-4 text-white shadow-[0_6px_20px_-6px_rgba(15,26,90,.35)] transition-all duration-200 ${
        interactive ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-6px_rgba(15,26,90,.45)]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex items-center gap-1.5">
          {typeof delta === 'number' && !loading && (
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md backdrop-blur-sm ${
              delta >= 0 ? 'bg-white/20 text-white' : 'bg-black/20 text-white'
            }`}>
              <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="currentColor">
                {delta >= 0
                  ? <path d="M6 2 11 8H1z" />
                  : <path d="M6 10 1 4h10z" />}
              </svg>
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {loading && <Spinner size="sm" color="white" />}
        </div>
      </div>
      <p className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] opacity-85 mt-2.5">{label}</p>
      <p className="font-display text-xl sm:text-[1.55rem] font-bold leading-tight mt-0.5 tabular-nums">
        {currency && <span className="text-[11px] opacity-70 font-semibold mr-0.5">{currency}</span>}
        {value}
      </p>
      <div className="flex items-end justify-between gap-2 mt-1">
        <p className="text-[10.5px] opacity-75 font-medium truncate flex-1">{sub}</p>
        {trend && trend.length > 1 && (
          <Sparkline
            data={trend}
            className="w-16 h-7 sm:w-20 sm:h-8 shrink-0 opacity-90"
            stroke="rgba(255,255,255,0.95)"
            fill="rgba(255,255,255,0.18)"
          />
        )}
      </div>
    </div>
  );
}
