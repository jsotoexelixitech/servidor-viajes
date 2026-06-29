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
}

export function AppHeader({
  sidebarOpen, onToggleSidebar,
  apiKeyInput, onApiKeyInput, apiKeyVis, onToggleApiKeyVis,
  apiKeySet, apiKeyLoading, apiKeyError, tenantNombreConectado, onConnectApiKey,
  demoOn, onToggleDemo,
  notifs, notifOpen, onToggleNotif, onClearNotifs,
}: AppHeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="h-14 bg-white border-b border-slate-100 sticky top-0 z-40"
      style={{ boxShadow: '0 1px 0 #e2e8f0, 0 2px 8px -2px rgb(0 0 0/.04)' }}>
      <div className="h-full px-3 sm:px-4 flex items-center gap-2 sm:gap-4 max-w-screen-2xl mx-auto">

        {/* Sidebar toggle */}
        <button onClick={onToggleSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-700 transition-all shrink-0"
          title={sidebarOpen ? 'Colapsar menú' : 'Expandir menú'}>
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            {sidebarOpen ? <><path d="M2 4h12M2 8h12M2 12h12"/></> : <><path d="M2 4h12M2 8h8M2 12h12"/></>}
          </svg>
        </button>

        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-white ring-1 ring-slate-200 flex items-center justify-center shrink-0 p-1"
            style={{ boxShadow: '0 3px 8px -1px rgb(15 26 90 / .15)' }}>
            <img src="/logo-isotipo-transparente.png" alt="La Mundial" className="w-full h-full object-contain" />
          </div>
          <div className="leading-none hidden sm:block">
            <span className="block text-sm font-extrabold tracking-tight" style={{ color: '#0F1A5A' }}>La Mundial</span>
            <span className="block text-[9px] font-bold tracking-[0.12em] uppercase italic" style={{ color: '#E84F51' }}>de Seguros</span>
          </div>
        </div>

        <div className="w-px h-5 bg-slate-100 shrink-0 hidden sm:block" />

        {/* API Key */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 max-w-md">
          <div className="relative flex-1 min-w-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none hidden sm:block">
              {Ic.key('w-3.5 h-3.5')}
            </span>
            <input
              ref={inputRef}
              type={apiKeyVis ? 'text' : 'password'}
              placeholder="API Key…"
              value={apiKeyInput}
              onChange={e => { onApiKeyInput(e.target.value); }}
              onKeyDown={e => e.key === 'Enter' && onConnectApiKey()}
              className="input pl-3 sm:pl-8 pr-8 h-8 text-xs rounded-lg w-full"
            />
            <button onClick={onToggleApiKeyVis}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors">
              {apiKeyVis ? Ic.eyeOff('w-3.5 h-3.5') : Ic.eye('w-3.5 h-3.5')}
            </button>
          </div>
          <button onClick={onConnectApiKey} disabled={apiKeyLoading || !apiKeyInput.trim()}
            className="btn-primary h-8 text-xs px-2.5 sm:px-3.5 rounded-lg whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
            {apiKeyLoading && <Spinner size="sm" />}
            <span className="hidden sm:inline">{apiKeySet ? 'Actualizar' : 'Conectar'}</span>
            <span className="sm:hidden">{apiKeySet ? 'Upd' : 'Go'}</span>
          </button>
          {apiKeyError && (
            <span className="text-[10.5px] font-bold text-red-500 whitespace-nowrap shrink-0 hidden md:inline">{apiKeyError}</span>
          )}
          {apiKeySet && !apiKeyError && (
            <div className="hidden md:flex items-center gap-1.5 text-[10.5px] font-bold text-emerald-600 bg-emerald-50 ring-1 ring-inset ring-emerald-200/70 px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 max-w-[180px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="truncate">{tenantNombreConectado || 'Conectado'}</span>
            </div>
          )}
        </div>

        {/* Demo toggle */}
        <button onClick={onToggleDemo}
          title={demoOn ? 'Desactivar modo demo' : 'Activar modo demo (datos simulados)'}
          className={`h-8 px-2 sm:px-3 rounded-lg text-[11px] font-bold tracking-wide flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 transition-all ${
            demoOn
              ? 'bg-amber-500 text-white shadow-[0_3px_10px_-2px_rgba(245,158,11,.5)] hover:bg-amber-600'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 ring-1 ring-inset ring-slate-200'
          }`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${demoOn ? 'bg-white animate-pulse' : 'bg-slate-400'}`} />
          <span className="hidden sm:inline">{demoOn ? 'DEMO ACTIVO' : 'Modo Demo'}</span>
          <span className="sm:hidden">{demoOn ? 'DEMO' : 'Demo'}</span>
        </button>

        {/* Right slot */}
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden xl:flex items-center gap-1.5 text-[11px] text-slate-600 font-medium">
            <span className="kbd">Ctrl</span><span className="kbd">K</span>
            <span className="ml-1">buscar</span>
          </span>
          <div className="w-px h-4 bg-slate-100 hidden xl:block" />

          {/* Notificaciones */}
          <div className="relative">
            <button onClick={onToggleNotif}
              className="relative w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 1a5 5 0 0 1 5 5v3l1.5 2H1.5L3 9V6a5 5 0 0 1 5-5z"/>
                <path d="M6.5 13a1.5 1.5 0 0 0 3 0"/>
              </svg>
              {notifs.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-extrabold flex items-center justify-center">
                  {notifs.length > 9 ? '9+' : notifs.length}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <span className="text-xs font-extrabold text-slate-700">Notificaciones</span>
                  {notifs.length > 0 && (
                    <button onClick={onClearNotifs} className="text-[10px] text-slate-600 hover:text-red-500 transition-colors font-semibold">
                      Limpiar todo
                    </button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                  {notifs.length === 0 ? (
                    <p className="text-center text-xs text-slate-600 py-6">Sin notificaciones</p>
                  ) : notifs.map(n => (
                    <div key={n.id} className={`flex gap-3 px-4 py-3 text-xs ${
                      n.tipo === 'success' ? 'bg-emerald-50/50' :
                      n.tipo === 'error'   ? 'bg-red-50/50' :
                      n.tipo === 'warning' ? 'bg-amber-50/50' : 'bg-white'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${
                        n.tipo === 'success' ? 'bg-emerald-500' :
                        n.tipo === 'error'   ? 'bg-red-500' :
                        n.tipo === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                      }`} />
                      <div className="min-w-0">
                        <p className="font-bold text-slate-700 truncate">{n.titulo}</p>
                        <p className="text-slate-500 mt-0.5">{n.mensaje}</p>
                        <p className="text-slate-500 mt-1">{n.ts.toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-slate-100 hidden sm:block" />
          <span className="text-[11px] text-slate-500 font-semibold hidden lg:block">v2.1</span>
        </div>
      </div>
    </header>
  );
}
