import React from 'react';
import type { Tab } from '../../types';
import { SidebarTourCard } from '../ui/SidebarTourCard';
import { Ic } from '../ui/Icons';

export interface NavItem {
  id: Tab;
  label: string;
  icon: () => React.ReactNode;
  dot?: boolean;
  requiresKey?: boolean;
  section: string;
}

export interface AppSidebarProps {
  open: boolean;
  tab: Tab;
  apiKeySet: boolean;
  demoOn: boolean;
  navItems: NavItem[];
  onNavTo: (id: Tab) => void;
  onOverlayClick: () => void;
}

const SECTIONS = ['Análisis', 'Operación', 'Histórico'] as const;

export function AppSidebar({
  open, tab, apiKeySet, demoOn, navItems, onNavTo, onOverlayClick,
}: AppSidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          onClick={onOverlayClick}
          className="fixed inset-0 top-14 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden"
          aria-hidden
        />
      )}

      <aside className={`fixed lg:static top-14 left-0 bottom-0 z-40 lg:z-auto bg-[#f4f6fb] shrink-0 transition-transform duration-200 ease-in-out lg:transition-all ${
        open ? 'translate-x-0 lg:w-52' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden'
      }`}>
        <div className="w-52 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto flex flex-col py-3 px-3 gap-0.5">

          {SECTIONS.map((section, sIdx) => (
            <React.Fragment key={section}>
              <p className={`nav-group-label ${sIdx === 0 ? 'mt-0' : ''}`}>{section}</p>
              {navItems.filter(n => n.section === section).map(item => {
                const disabled = !!(item.requiresKey && !apiKeySet);
                const isActive = tab === item.id;
                return (
                  <button key={item.id}
                    onClick={() => !disabled && onNavTo(item.id)}
                    disabled={disabled}
                    title={disabled ? 'Requiere API Key' : item.label}
                    className={`nav-item ${isActive ? 'nav-active' : disabled ? 'nav-disabled' : 'nav-inactive'}`}>
                    <span className={`${isActive ? 'text-white/90' : disabled ? 'text-slate-500' : 'text-slate-600'} shrink-0`}>
                      {item.icon()}
                    </span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.dot && !disabled && (
                      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-amber-300' : 'bg-amber-400'}`} />
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          ))}

          <div className="flex-1" />

          {demoOn && <SidebarTourCard />}

          <div className={`mx-1 rounded-xl p-3 transition-all ${apiKeySet ? 'bg-emerald-50 border border-emerald-100' : 'bg-amber-50 border border-amber-100'}`}>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${apiKeySet ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <p className={`text-[11px] font-semibold leading-snug ${apiKeySet ? 'text-emerald-700' : 'text-amber-700'}`}>
                {apiKeySet ? 'API Key activa' : 'Sin API Key'}
              </p>
            </div>
            {!apiKeySet && (
              <p className="text-[10px] text-amber-600 mt-1">Ingresa tu clave para activar todas las funciones</p>
            )}
          </div>

          <div className="mt-2 px-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[9.5px] font-bold text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {demoOn ? 'DEMO' : 'QA La Mundial'}
            </span>
            <span className="font-mono">v2.1</span>
          </div>
        </div>
      </aside>
    </>
  );
}
