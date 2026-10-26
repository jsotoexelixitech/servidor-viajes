import React from 'react';
import type { Tab } from '../../types';
import { SidebarTourCard } from '../ui/SidebarTourCard';

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
  ssoMode?: boolean;
}

const SECTIONS = ['Análisis', 'Operación', 'Histórico'] as const;

export function AppSidebar({
  open, tab, apiKeySet, demoOn, navItems, onNavTo, onOverlayClick, ssoMode = false,
}: AppSidebarProps) {
  return (
    <>
      {open && (
        <div onClick={onOverlayClick} className="fixed inset-0 top-[68px] bg-[#091133]/40 backdrop-blur-sm z-30 lg:hidden" aria-hidden />
      )}

      <aside className={`fixed lg:static top-[68px] left-0 bottom-0 z-40 lg:z-auto bg-white lg:bg-transparent shrink-0 transition-transform duration-200 ease-in-out lg:transition-all ${
        open ? 'translate-x-0 lg:w-60' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden'
      }`}>
        <div className="w-60 sticky top-[68px] h-[calc(100vh-68px)] overflow-y-auto flex flex-col py-4 px-3 gap-0.5 border-r border-[#E3E5EC] lg:border-r-0">

          {SECTIONS.map((section, sIdx) => (
            <React.Fragment key={section}>
              <p className={`nav-group-label ${sIdx === 0 ? 'mt-0' : ''}`}>{section}</p>
              {navItems.filter((n) => n.section === section).map((item) => {
                const disabled = !!(item.requiresKey && !apiKeySet);
                const isActive = tab === item.id;
                return (
                  <button key={item.id} onClick={() => !disabled && onNavTo(item.id)} disabled={disabled}
                    title={disabled ? (ssoMode ? 'Esperando el acceso de Nexus' : 'Requiere conectar la flota') : item.label}
                    className={`nav-item ${isActive ? 'nav-active' : disabled ? 'nav-disabled' : 'nav-inactive'}`}>
                    <span className={`${isActive ? 'text-white' : disabled ? 'text-[#C9CCD6]' : 'text-[#2E6DBF]'} shrink-0`}>{item.icon()}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.dot && !disabled && <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-[#FF8A8D]' : 'bg-[#E84F51]'}`} />}
                  </button>
                );
              })}
            </React.Fragment>
          ))}

          <div className="flex-1" />

          {demoOn && !ssoMode && <SidebarTourCard />}

          <div className={`mx-1 rounded-xl p-3 border ${apiKeySet ? 'bg-[#F0F2F8] border-[#E3E5EC]' : 'bg-[#FFF7E6] border-[#F5E2B8]'}`}>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${apiKeySet ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <p className={`text-[11px] font-semibold leading-snug ${apiKeySet ? 'text-[#0F1A5A]' : 'text-[#7A4B00]'}`}>
                {apiKeySet ? (ssoMode ? 'Sesión iniciada desde Nexus' : 'Flota conectada') : ssoMode ? 'Validando acceso…' : 'Sin flota conectada'}
              </p>
            </div>
            {!apiKeySet && !ssoMode && <p className="text-[10px] text-[#7A4B00] mt-1">Conecta la API key de la plataforma para activar todas las funciones.</p>}
          </div>

          <div className="mt-2 px-3 pt-2 border-t border-[#E3E5EC] flex items-center justify-between text-[9.5px] font-semibold text-[#ACACAC] uppercase tracking-[0.14em]">
            <span>{demoOn && !ssoMode ? 'Demo' : 'La Mundial'}</span>
            <span className="font-mono normal-case tracking-normal">v2.2</span>
          </div>
        </div>
      </aside>
    </>
  );
}
