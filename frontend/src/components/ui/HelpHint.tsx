import React from 'react';

export function HelpHint({ text, side = 'bottom' }: { text: string; side?: 'bottom' | 'top' | 'left' }) {
  const sidePos = side === 'top'
    ? 'bottom-full mb-1.5 left-1/2 -translate-x-1/2'
    : side === 'left'
    ? 'right-full mr-1.5 top-1/2 -translate-y-1/2'
    : 'top-full mt-1.5 left-1/2 -translate-x-1/2';
  const arrowPos = side === 'top'
    ? 'left-1/2 -translate-x-1/2 -bottom-1 border-t-slate-900 border-l-transparent border-r-transparent border-b-0'
    : side === 'left'
    ? 'top-1/2 -translate-y-1/2 -right-1 border-l-slate-900 border-t-transparent border-b-transparent border-r-0'
    : 'left-1/2 -translate-x-1/2 -top-1 border-b-slate-900 border-l-transparent border-r-transparent border-t-0';
  return (
    <span className="help-hint relative inline-flex group/hint" tabIndex={0}>
      <span className="w-3.5 h-3.5 rounded-full bg-slate-200 hover:bg-brand-100 text-slate-600 hover:text-brand-700 text-[9px] font-extrabold flex items-center justify-center cursor-help transition-colors leading-none">
        ?
      </span>
      <span className={`pointer-events-none absolute ${sidePos} z-20 hidden group-hover/hint:block group-focus/hint:block`}>
        <span className="block bg-slate-900 text-white text-[11px] leading-snug font-medium rounded-lg shadow-lg px-2.5 py-1.5 max-w-[220px] whitespace-normal text-center">
          {text}
        </span>
        <span className={`absolute w-0 h-0 border-4 ${arrowPos}`} />
      </span>
    </span>
  );
}
