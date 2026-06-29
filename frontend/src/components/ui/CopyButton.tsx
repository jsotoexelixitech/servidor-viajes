import React, { useState } from 'react';
import { Ic } from './Icons';

export function CopyButton({ text, compact }: { text: string; compact?: boolean }) {
  const [st, setSt] = useState<'idle' | 'copied'>('idle');
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setSt('copied');
      setTimeout(() => setSt('idle'), 2000);
    });
  };

  if (compact) {
    return (
      <button onClick={copy} title="Copiar"
        className="p-1 rounded-md text-slate-600 hover:text-slate-700 hover:bg-slate-100 transition-all active:scale-90">
        {st === 'copied' ? Ic.check('w-3.5 h-3.5 text-emerald-500') : Ic.copy()}
      </button>
    );
  }
  return (
    <button onClick={copy}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
        st === 'copied'
          ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}>
      {st === 'copied' ? <>{Ic.check('w-3 h-3')} Copiado</> : <>{Ic.copy()} Copiar</>}
    </button>
  );
}
