import React, { useState, useEffect } from 'react';
import { Ic } from '../ui/Icons';

export function PresentationToggle() {
  const [active, setActive] = useState(false);

  const toggle = () => {
    if (!active) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      document.body.classList.add('presentation-mode');
      setActive(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      document.body.classList.remove('presentation-mode');
      setActive(false);
    }
  };

  useEffect(() => {
    const onFsc = () => {
      if (!document.fullscreenElement) {
        document.body.classList.remove('presentation-mode');
        setActive(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsc);
    return () => document.removeEventListener('fullscreenchange', onFsc);
  }, []);

  return (
    <button
      onClick={toggle}
      title={active ? 'Salir del modo presentación (ESC)' : 'Modo presentación — pantalla completa'}
      className={`h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
        active
          ? 'bg-brand-700 text-white border-brand-700 shadow-md'
          : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:text-brand-700 shadow-sm'
      }`}
    >
      {active ? Ic.minimize('w-3.5 h-3.5') : Ic.maximize('w-3.5 h-3.5')}
      <span className="hidden sm:inline">{active ? 'Salir' : 'Presentar'}</span>
    </button>
  );
}
