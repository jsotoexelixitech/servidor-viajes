import React, { useRef } from 'react';
import type { Notif } from '../../types';
import { Ic } from '../ui/Icons';
import { Spinner } from '../ui/Spinner';

export interface AppHeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  apiKeyInput: string;
  onApiKeyInput: (v: string) => void;
  apiKeyVis: boolean;
  onToggleApiKeyVis: () => void;
  apiKeySet: boolean;
  apiKeyLoading: boolean;
  apiKeyError: string;
  tenantNombreConectado: string;
  onConnectApiKey: () => void;
  demoOn: boolean;
  onToggleDemo: () => void;
  notifs: Notif[];
  notifOpen: boolean;
  onToggleNotif: () => void;
  onClearNotifs: () => void;
  /** Abierto desde Nexus (SSO): sin campo de API key ni modo demo. */
  ssoMode?: boolean;
  ssoEmpresa?: string;
}

const iniciales = (s: string) =>
  s.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'LM';

/** Cabecera con la identidad de La Mundial (misma línea que el portal de emisión). */
export function AppHeader({
  sidebarOpen, onToggleSidebar,
  apiKeyInput, onApiKeyInput, apiKeyVis, onToggleApiKeyVis,
  apiKeySet, apiKeyLoading, apiKeyError, tenantNombreConectado, onConnectApiKey,
  demoOn, onToggleDemo,
  notifs, notifOpen, onToggleNotif, onClearNotifs,
  ssoMode = false, ssoEmpresa = '',
}: AppHeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="sticky top-0 z-40 bg-white" style={{ boxShadow: '0 1px 0 rgba(9,17,51,0.06), 0 6px 18px -12px rgba(9,17,51,0.18)' }}>
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #0F1A5A 0%, #2E6DBF 48%, #E84F51 100%)' }} />
      <div className="h-16 px-3 sm:px-5 flex items-center gap-3 sm:gap-4 max-w-screen-2xl mx-auto">

        <button onClick={onToggleSidebar}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-[#0F1A5A] hover:bg-[#F0F2F8] transition-colors shrink-0"
          title={sidebarOpen ? 'Ocultar menú' : 'Mostrar menú'}>
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            {sidebarOpen ? <path d="M2 4h12M2 8h12M2 12h12"/> : <path d="M2 4h12M2 8h8M2 12h12"/>}
          </svg>
        </button>

        {/* Marca */}
        <div className="flex items-center gap-3 shrink-0">
          <img src="/brand/mundial-isotipo.png" alt="" className="h-10 w-10 object-contain" draggable={false} />
          <div className="min-w-0 hidden sm:block">
            <p className="font-display text-lg font-bold leading-tight text-[#091133]">
              La Mundial<span className="text-[#E84F51] italic font-semibold"> de Seguros</span>
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#777777] mt-0.5">Flota por uso</p>
          </div>
        </div>

        <div className="w-px h-7 bg-[#E3E5EC] shrink-0 hidden sm:block" />

        {/* Conexión: SSO (Nexus) o API key (uso interno) */}
        {ssoMode ? (
          <div className="flex items-center gap-2 min-w-0">
            {apiKeyLoading && <Spinner size="sm" />}
            {apiKeySet && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0F1A5A] bg-[#F0F2F8] px-3 py-1.5 rounded-full whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Acceso Nexus{ssoEmpresa ? ` · ${ssoEmpresa}` : ''}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0 max-w-md">
            <div className="relative flex-1 min-w-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#ACACAC] pointer-events-none hidden sm:block">{Ic.key('w-3.5 h-3.5')}</span>
              <input ref={inputRef} type={apiKeyVis ? 'text' : 'password'} placeholder="API Key de la plataforma…"
                value={apiKeyInput} onChange={(e) => onApiKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onConnectApiKey()}
                className="input pl-3 sm:pl-8 pr-8 h-9 text-xs w-full" />
              <button onClick={onToggleApiKeyVis} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#ACACAC] hover:text-[#0F1A5A] transition-colors">
                {apiKeyVis ? Ic.eyeOff('w-3.5 h-3.5') : Ic.eye('w-3.5 h-3.5')}
              </button>
            </div>
            <button onClick={onConnectApiKey} disabled={apiKeyLoading || !apiKeyInput.trim()} className="btn-navy h-9 text-xs px-3.5 whitespace-nowrap shrink-0">
              {apiKeyLoading && <Spinner size="sm" />}
              {apiKeySet ? 'Cambiar' : 'Conectar'}
            </button>
            {apiKeyError && <span className="text-[10.5px] font-semibold text-[#E84F51] whitespace-nowrap hidden md:inline">{apiKeyError}</span>}
            {apiKeySet && !apiKeyError && (
              <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0F1A5A] bg-[#F0F2F8] px-3 py-1.5 rounded-full whitespace-nowrap max-w-[180px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="truncate">{tenantNombreConectado || 'Conectado'}</span>
              </span>
            )}
          </div>
        )}

        {!ssoMode && (
          <button onClick={onToggleDemo} title={demoOn ? 'Desactivar modo demo' : 'Activar modo demo (datos simulados)'}
            className={`h-9 px-3 rounded-xl text-[11px] font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all ${
              demoOn ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-[#F0F2F8] text-[#5E6275] hover:bg-[#E3E5EC]'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${demoOn ? 'bg-white animate-pulse' : 'bg-[#ACACAC]'}`} />
            <span className="hidden sm:inline">{demoOn ? 'Demo activo' : 'Modo demo'}</span>
          </button>
        )}

        {/* Derecha: usuario/flota + notificaciones */}
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {apiKeySet && (
            <div className="hidden lg:flex items-center gap-2.5 pl-3 border-l border-[#E3E5EC]">
              <div className="h-9 w-9 rounded-full grid place-items-center text-[11px] font-bold text-white" style={{ background: 'linear-gradient(135deg, #2E6DBF, #0F1A5A)' }}>
                {iniciales(tenantNombreConectado)}
              </div>
              <div className="leading-tight">
                <p className="text-sm font-bold text-[#091133]">{tenantNombreConectado}</p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ACACAC]">{ssoMode ? 'Flota · Nexus' : 'Flota'}</p>
              </div>
            </div>
          )}

          <div className="relative">
            <button onClick={onToggleNotif} className="relative w-9 h-9 rounded-xl flex items-center justify-center text-[#0F1A5A] hover:bg-[#F0F2F8] transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 1a5 5 0 0 1 5 5v3l1.5 2H1.5L3 9V6a5 5 0 0 1 5-5z"/><path d="M6.5 13a1.5 1.5 0 0 0 3 0"/>
              </svg>
              {notifs.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#E84F51] text-white text-[9px] font-bold flex items-center justify-center">
                  {notifs.length > 9 ? '9+' : notifs.length}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-11 w-80 card shadow-xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#E3E5EC]">
                  <span className="text-xs font-bold text-[#091133]">Notificaciones</span>
                  {notifs.length > 0 && <button onClick={onClearNotifs} className="text-[10px] text-[#5E6275] hover:text-[#E84F51] font-semibold">Limpiar todo</button>}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-[#F0F2F8]">
                  {notifs.length === 0 ? <p className="text-center text-xs text-[#5E6275] py-6">Sin notificaciones</p> : notifs.map((n) => (
                    <div key={n.id} className="flex gap-3 px-4 py-3 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${n.tipo === 'success' ? 'bg-emerald-500' : n.tipo === 'error' ? 'bg-[#E84F51]' : n.tipo === 'warning' ? 'bg-amber-500' : 'bg-[#2E6DBF]'}`} />
                      <div className="min-w-0">
                        <p className="font-bold text-[#091133] truncate">{n.titulo}</p>
                        <p className="text-[#5E6275] mt-0.5">{n.mensaje}</p>
                        <p className="text-[#ACACAC] mt-1">{n.ts.toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
