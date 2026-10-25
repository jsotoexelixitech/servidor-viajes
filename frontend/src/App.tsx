import React, { useState, useCallback, useEffect, FormEvent } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import {
  authApi, setSessionToken, clearSession, viajeApi, tenantApi, adminApi,
  CAMPOS_SEGURO, SeguroConfig, RangoTemporal,
  Viaje,
} from './api';
import { setDemoMode, isDemoMode, DEMO_INFO, buildDemoViajeBody } from './demo';
import { WelcomeSplash } from './WelcomeSplash';

import type { Tab, ReqStatus, Notif } from './types';
import { NAV_REQUIRES_KEY } from './constants';
import { Ic } from './components/ui/Icons';
import { Spinner } from './components/ui/Spinner';
import { PolizaModal } from './components/ui/PolizaModal';
import { AppHeader } from './components/layout/AppHeader';
import { AppSidebar } from './components/layout/AppSidebar';
import type { NavItem } from './components/layout/AppSidebar';

import { DashboardPanel } from './views/DashboardPanel';
import { CarteraPanel } from './views/CarteraPanel';
import { ConductoresPanel } from './views/ConductoresPanel';
import { FlotaPanel } from './views/FlotaPanel';
import { SetupPanel } from './views/SetupPanel';
import { MapeoPanel } from './views/MapeoPanel';
import { ViajePanel } from './views/ViajePanel';
import { FinalizarPanel } from './views/FinalizarPanel';
import { ViajesListPanel } from './views/ViajesListPanel';
import { MonitorPanel } from './views/MonitorPanel';

// ─── Nav definition (uses Ic so must be here) ────────────────────────────────
const NAV: NavItem[] = [
  { id: 'dashboard',   label: 'Dashboard',     icon: () => Ic.grid(),   section: 'Análisis' },
  { id: 'cartera',     label: 'Cartera',       icon: () => Ic.shield(), section: 'Análisis' },
  { id: 'conductores', label: 'Conductores',   icon: () => Ic.users(),  section: 'Análisis',  requiresKey: true },
  { id: 'flota',       label: 'Flota por uso', icon: () => Ic.car(),    section: 'Análisis',  requiresKey: true },

  { id: 'setup',       label: 'Nuevo Cliente', icon: () => Ic.plus(),   section: 'Operación' },
  { id: 'mapeo',       label: 'Configuración', icon: () => Ic.gear(),   section: 'Operación', requiresKey: true },
  { id: 'viaje',       label: 'Iniciar Viaje', icon: () => Ic.play(),   section: 'Operación', requiresKey: true },
  { id: 'finalizar',   label: 'Finalizar',     icon: () => Ic.stop(),   section: 'Operación', requiresKey: true },

  { id: 'listar',      label: 'Viajes',        icon: () => Ic.rows(),   section: 'Histórico', requiresKey: true },
  { id: 'monitor',     label: 'Monitor',       icon: () => Ic.pulse(),  section: 'Histórico', requiresKey: true, dot: true },
];

// ─── Error translation helper ─────────────────────────────────────────────────
function friendlyError(e: unknown): { titulo: string; mensaje: string } {
  const err = e as { response?: { data?: Record<string, unknown>; status?: number }; message?: string };
  const status = err?.response?.status;
  const data   = err?.response?.data;
  const raw    = String(data?.message ?? data?.error ?? err?.message ?? '');

  if (!err?.response)                       return { titulo: 'Sin conexión',       mensaje: 'No se pudo conectar al servidor. Verifica que el backend esté corriendo.' };
  if (raw.includes('ADMIN_SECRET'))         return { titulo: 'Configuración',      mensaje: 'El panel de administración no está habilitado en este servidor.' };
  if (raw.includes('SESSION_SECRET'))       return { titulo: 'Configuración',      mensaje: 'El servidor no tiene configurado el módulo de sesiones.' };
  if (status === 401)                       return { titulo: 'No autorizado',       mensaje: 'Tu sesión expiró o la clave es inválida. Reconecta tu API Key.' };
  if (status === 403)                       return { titulo: 'Acceso denegado',     mensaje: 'No tienes permisos para realizar esta acción.' };
  if (status === 404)                       return { titulo: 'No encontrado',       mensaje: 'El recurso solicitado no existe.' };
  if (status === 409)                       return { titulo: 'Conflicto',           mensaje: raw || 'Ya existe un registro con esos datos.' };
  if (status === 422 || status === 400)     return { titulo: 'Datos inválidos',     mensaje: raw || 'Revisa los campos del formulario.' };
  if (status === 429)                       return { titulo: 'Límite alcanzado',    mensaje: 'Demasiadas solicitudes. Espera unos segundos e intenta de nuevo.' };
  if (status === 503 || status === 502)     return { titulo: 'Servicio no disponible', mensaje: 'El servicio externo de seguros no responde en este momento.' };
  if (status === 500)                       return { titulo: 'Error del servidor',  mensaje: 'Ocurrió un error interno. Revisa los logs del backend.' };
  return { titulo: 'Error', mensaje: raw || 'Ocurrió un error inesperado.' };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]             = useState<Tab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [demoOn, setDemoOn]       = useState(isDemoMode());

  // Auth
  const [apiKeyInput,   setApiKeyInput]   = useState('');
  const [apiKeySet,     setApiKeySet]     = useState(false);
  const [apiKeyVis,     setApiKeyVis]     = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyError,   setApiKeyError]   = useState('');
  const [tenantNombreConectado, setTenantNombreConectado] = useState('');
  const [notifs,        setNotifs]        = useState<Notif[]>([]);
  const [notifOpen,     setNotifOpen]     = useState(false);

  // Shared request state
  const [response,   setResponse]  = useState<unknown>(null);
  const hasResponse = response !== null && response !== undefined;
  const [reqStatus,  setReqStatus] = useState<ReqStatus>('idle');

  // Setup form
  const [tenantNombre,   setTenantNombre]   = useState('');
  const [tenantWebhook,  setTenantWebhook]  = useState('');
  const [tenantSecret,   setTenantSecret]   = useState('');
  const [adminKeyInput,  setAdminKeyInput]  = useState('');
  const [adminKeyVis,    setAdminKeyVis]    = useState(false);

  // Mapeo
  const [seguroConfig,  setSeguroConfig]  = useState<SeguroConfig>({ baseUrl: '', authToken: '', cramo: 18, plan: '', frecuencia: 'A' });
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [defaultValues, setDefaultValues] = useState<Record<string, string>>({});
  const [mapeoLoading,  setMapeoLoading]  = useState(false);
  const [mapeoSaved,    setMapeoSaved]    = useState(false);
  const [grupoActivo,   setGrupoActivo]   = useState<'vehiculo' | 'tomador' | 'interno'>('vehiculo');

  // Viaje
  const [viajeRaw,    setViajeRaw]    = useState('');
  const [idViaje,     setIdViaje]     = useState('');
  const [viajes,      setViajes]      = useState<Viaje[]>([]);
  const [totalViajes, setTotalViajes] = useState(0);

  // Monitor
  const [monitorData,    setMonitorData]    = useState<Record<string, unknown> | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);

  // Cliente seleccionado en modo admin (compartido entre todas las vistas)
  const [selectedClient, setSelectedClient] = useState<{ id: string; nombre: string } | null>(null);
  const adminMode = !!adminKeyInput.trim();

  // Póliza preview modal (demo)
  const [polizaPreview, setPolizaPreview] = useState<Viaje | null>(null);

  // ── Notifications ──────────────────────────────────────────────────────────
  const pushNotif = useCallback((tipo: Notif['tipo'], titulo: string, mensaje: string) => {
    const notif: Notif = { id: crypto.randomUUID(), tipo, titulo, mensaje, ts: new Date() };
    setNotifs(prev => [notif, ...prev].slice(0, 50));
    if (tipo === 'success')      toast.success(mensaje, { duration: 3000 });
    else if (tipo === 'error')   toast.error(mensaje,   { duration: 6000 });
    else if (tipo === 'warning') toast(mensaje,          { icon: '⚠️', duration: 4000 });
    else                         toast(mensaje,          { duration: 3000 });
  }, []);

  // ── Auth handlers ──────────────────────────────────────────────────────────
  const handleSetApiKey = async () => {
    const key = apiKeyInput.trim();
    if (!key) return;
    setApiKeyLoading(true); setApiKeyError('');
    try {
      const res = await authApi.login(key);
      setSessionToken(res.data.sessionToken);
      setApiKeySet(true); setApiKeyInput('');
      setTenantNombreConectado(res.data.tenant.nombre);
      pushNotif('success', 'Conectado', `Sesión iniciada como "${res.data.tenant.nombre}"`);
    } catch (e: unknown) {
      clearSession(); setApiKeySet(false); setTenantNombreConectado('');
      const { titulo, mensaje } = friendlyError(e);
      setApiKeyError(mensaje);
      pushNotif('error', titulo, mensaje);
    } finally {
      setApiKeyLoading(false);
    }
  };

  const toggleDemo = useCallback(async () => {
    const next = !demoOn;
    setDemoMode(next); setDemoOn(next);
    if (next) {
      try {
        const res = await authApi.login(DEMO_INFO.apiKey);
        setSessionToken(res.data.sessionToken);
        setApiKeySet(true); setApiKeyInput(''); setApiKeyError('');
        setTenantNombreConectado(res.data.tenant.nombre);
        setTenantNombre(DEMO_INFO.setupNombre);
        setTenantWebhook(DEMO_INFO.setupWebhook);
        setTenantSecret(DEMO_INFO.setupSecret);
        setAdminKeyInput(DEMO_INFO.adminKey);
        setViajeRaw(JSON.stringify(buildDemoViajeBody(), null, 2));
        pushNotif('success', 'Modo Demo activado', 'Cliente, configuración y 8 viajes precargados. Listo para presentar.');
      } catch {
        pushNotif('error', 'Modo Demo', 'No se pudo iniciar sesión simulada.');
      }
    } else {
      clearSession(); setApiKeySet(false); setTenantNombreConectado('');
      setTenantNombre(''); setTenantWebhook(''); setTenantSecret('');
      setAdminKeyInput(''); setViajeRaw(''); setIdViaje('');
      setResponse(null); setReqStatus('idle');
      pushNotif('info', 'Modo Demo desactivado', 'Conecta con tu API Key real para continuar.');
    }
  }, [demoOn, pushNotif]);

  const doRequest = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    setReqStatus('loading'); setResponse(null);
    try {
      const r = await fn();
      setResponse((r as { data: unknown }).data);
      setReqStatus('success');
      return true;
    } catch (e: unknown) {
      const err = e as { response?: { data: unknown }; message: string };
      setResponse(err.response?.data ?? { error: err.message });
      setReqStatus('error');
      const { titulo, mensaje } = friendlyError(e);
      pushNotif('error', titulo, mensaje);
      return false;
    }
  }, [pushNotif]);

  // ── Mapeo autoload ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!apiKeySet || tab !== 'mapeo') return;
    setMapeoLoading(true); setMapeoSaved(false);
    tenantApi.obtenerSeguro()
      .then(r => {
        if (r.data.seguroConfig) setSeguroConfig(r.data.seguroConfig);
        setFieldMappings(r.data.fieldMappings ?? {});
        setDefaultValues(Object.fromEntries(Object.entries(r.data.defaultValues ?? {}).map(([k, v]) => [k, String(v)])));
      })
      .catch(e => {
        const { titulo, mensaje } = friendlyError(e);
        pushNotif('error', titulo, `No se pudo cargar la configuración: ${mensaje}`);
      })
      .finally(() => setMapeoLoading(false));
  }, [apiKeySet, tab, pushNotif]);

  // ── Monitor ────────────────────────────────────────────────────────────────
  const loadMonitor = useCallback(() => {
    if (!apiKeySet) return;
    setMonitorLoading(true);
    tenantApi.misPolizasCriticas()
      .then(r => setMonitorData(r.data as Record<string, unknown>))
      .catch(e => { const { titulo, mensaje } = friendlyError(e); pushNotif('error', titulo, mensaje); })
      .finally(() => setMonitorLoading(false));
  }, [apiKeySet, pushNotif]);

  useEffect(() => { if (apiKeySet && tab === 'monitor') loadMonitor(); }, [apiKeySet, tab, loadMonitor]);

  // ── Setup handlers ─────────────────────────────────────────────────────────
  const handleCrearTenant = (e: FormEvent) => {
    e.preventDefault();
    if (!adminKeyInput.trim()) { pushNotif('warning', 'Clave requerida', 'Ingresa la Admin Key para crear clientes.'); return; }
    doRequest(() => adminApi.crear(
      { nombre: tenantNombre, ...(tenantWebhook && { webhookUrl: tenantWebhook }), ...(tenantSecret && { webhookSecret: tenantSecret }) },
      adminKeyInput.trim(),
    ));
  };

  // ── Mapeo handlers ─────────────────────────────────────────────────────────
  const handleGuardarMapeo = async (e: FormEvent) => {
    e.preventDefault(); setMapeoSaved(false);
    const cleanDefs: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(defaultValues)) {
      if (v.trim()) { const n = Number(v); cleanDefs[k] = isNaN(n) ? v : n; }
    }
    const ok = await doRequest(() => tenantApi.configurarSeguro({ seguroConfig, fieldMappings, defaultValues: cleanDefs }));
    if (ok) { setMapeoSaved(true); setTimeout(() => setMapeoSaved(false), 3000); }
  };

  // ── Viaje handlers ─────────────────────────────────────────────────────────
  const buildExampleBody = () => {
    const body: Record<string, string | number> = {};
    for (const c of CAMPOS_SEGURO) {
      if (c.grupo === 'interno' && !fieldMappings[c.key]) continue;
      if ((defaultValues[c.key] ?? '').trim()) continue;
      const name = fieldMappings[c.key]?.trim() || c.key;
      body[name] = c.tipo === 'numero' ? parseFloat(c.ejemplo) || 0 : c.ejemplo;
    }
    return body;
  };
  const exampleBody = buildExampleBody();

  const handleIniciar = async (e: FormEvent) => {
    e.preventDefault();
    if (!viajeRaw.trim()) { setResponse({ error: 'El body JSON no puede estar vacío.' }); setReqStatus('error'); return; }
    let parsed: unknown;
    try { parsed = JSON.parse(viajeRaw); }
    catch { setResponse({ error: 'JSON inválido. Verifica el formato.' }); setReqStatus('error'); return; }
    setReqStatus('loading'); setResponse(null);
    try {
      const r = await viajeApi.iniciar(parsed as Record<string, unknown>);
      setResponse(r.data); setReqStatus('success');
      if (r.data?.id) setIdViaje(r.data.id);
      if (demoOn) {
        pushNotif('success', 'Viaje iniciado', `Póliza ${r.data.cnpoliza ?? ''} emitida para placa ${r.data.numeroPlaca}`);
        setViajeRaw(JSON.stringify(buildDemoViajeBody(), null, 2));
      }
    } catch (e2: unknown) {
      const err = e2 as { response?: { data: unknown }; message: string };
      setResponse(err.response?.data ?? { error: err.message });
      setReqStatus('error');
      const { titulo, mensaje } = friendlyError(e2);
      pushNotif('error', titulo, mensaje);
    }
  };

  const handleFinalizar = (e: FormEvent) => { e.preventDefault(); doRequest(() => viajeApi.finalizar(idViaje)); };

  const handleListar = () => {
    setReqStatus('loading');
    viajeApi.listar()
      .then(r => { setViajes(r.data.data); setTotalViajes(r.data.total); setResponse(r.data); setReqStatus('success'); })
      .catch(e => { setResponse((e as { response?: { data: unknown } }).response?.data ?? { error: (e as Error).message }); setReqStatus('error'); });
  };

  useEffect(() => {
    if (apiKeySet && tab === 'listar') handleListar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKeySet, tab]);

  // ── Field mapping helpers ──────────────────────────────────────────────────
  const setMapping    = (k: string, v: string) => setFieldMappings(p => ({ ...p, [k]: v }));
  const setDefaultVal = (k: string, v: string) => setDefaultValues(p => ({ ...p, [k]: v }));
  const clearMapping  = (k: string) => setFieldMappings(p => { const n = { ...p }; delete n[k]; return n; });
  const clearDefault  = (k: string) => setDefaultValues(p => { const n = { ...p }; delete n[k]; return n; });

  const mappedCount  = Object.values(fieldMappings).filter(v => v?.trim()).length;
  const defaultCount = Object.values(defaultValues).filter(v => v?.trim()).length;

  // ── Navigation ─────────────────────────────────────────────────────────────
  const navTo = (id: Tab) => {
    if (NAV_REQUIRES_KEY.has(id) && !apiKeySet) return;
    setTab(id); setReqStatus('idle'); setResponse(null);
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  useEffect(() => {
    const handler = () => {
      if (window.innerWidth < 1024) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    handler();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen flex flex-col bg-[#f4f6fb]">
      <WelcomeSplash />
      <Toaster position="top-right" toastOptions={{
        style: { fontSize: '12px', fontWeight: 600, borderRadius: '10px', maxWidth: '360px' },
        success: { style: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' } },
        error:   { style: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' } },
      }} />

      {polizaPreview && <PolizaModal viaje={polizaPreview} onClose={() => setPolizaPreview(null)} />}

      <AppHeader
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(s => !s)}
        apiKeyInput={apiKeyInput}
        onApiKeyInput={v => { setApiKeyInput(v); setApiKeyError(''); }}
        apiKeyVis={apiKeyVis}
        onToggleApiKeyVis={() => setApiKeyVis(v => !v)}
        apiKeySet={apiKeySet}
        apiKeyLoading={apiKeyLoading}
        apiKeyError={apiKeyError}
        tenantNombreConectado={tenantNombreConectado}
        onConnectApiKey={handleSetApiKey}
        demoOn={demoOn}
        onToggleDemo={toggleDemo}
        notifs={notifs}
        notifOpen={notifOpen}
        onToggleNotif={() => setNotifOpen(o => !o)}
        onClearNotifs={() => setNotifs([])}
      />

      {/* Demo pill */}
      {demoOn && (
        <div className="fixed bottom-4 right-4 z-40 group animate-in">
          <div className="relative bg-white ring-1 ring-amber-300/70 shadow-lg rounded-full pl-2 pr-1 py-1 flex items-center gap-2 text-amber-900 text-[11px] font-bold backdrop-blur-sm">
            <span className="absolute -inset-px rounded-full pointer-events-none ring-2 ring-amber-400/30 animate-pulse" />
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-amber-500 opacity-70 animate-ping" />
              <span className="relative w-2 h-2 rounded-full bg-amber-500" />
            </span>
            <span className="text-[11px] tracking-wide uppercase font-extrabold">Demo</span>
            <span className="hidden md:inline text-[10.5px] text-amber-700/80 font-medium opacity-0 group-hover:opacity-100 transition-opacity max-w-0 group-hover:max-w-[260px] overflow-hidden whitespace-nowrap">
              datos simulados, sin impacto real
            </span>
            <button onClick={toggleDemo} title="Desactivar modo demo"
              className="ml-1 w-6 h-6 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-800 flex items-center justify-center transition-colors">
              {Ic.close('w-3 h-3')}
            </button>
          </div>
        </div>
      )}

      {/* ── Banner de contexto: empresa seleccionada en modo admin ── */}
      {adminMode && selectedClient && (
        <div className="sticky top-14 z-30 w-full flex items-center gap-3 px-4 sm:px-6 py-2 bg-brand-700 text-white text-xs font-semibold border-b border-brand-800 shadow-sm">
          <span className="flex items-center gap-1.5 shrink-0 text-brand-200">
            {Ic.eye('w-3.5 h-3.5')}
            Viendo datos de:
          </span>
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-md bg-white/15 ring-1 ring-white/20 flex items-center justify-center text-[10px] font-extrabold shrink-0">
              {selectedClient.nombre.slice(0, 2).toUpperCase()}
            </span>
            <span className="font-extrabold text-white truncate">{selectedClient.nombre}</span>
          </div>
          <span className="text-brand-300 mx-1 hidden sm:inline">·</span>
          <span className="text-brand-200 hidden sm:inline text-[11px]">
            Todas las vistas muestran datos de esta empresa
          </span>
          <button
            onClick={() => setSelectedClient(null)}
            className="ml-auto shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition-all active:scale-95"
          >
            {Ic.chevron('w-3 h-3 rotate-180')}
            Volver a vista global
          </button>
        </div>
      )}

      <div className="flex flex-1 max-w-screen-2xl mx-auto w-full">
        <AppSidebar
          open={sidebarOpen}
          tab={tab}
          apiKeySet={apiKeySet}
          demoOn={demoOn}
          navItems={NAV}
          onNavTo={navTo}
          onOverlayClick={() => setSidebarOpen(false)}
        />

        <main className="flex-1 min-w-0 py-5 px-3 sm:py-7 sm:px-6">

          {tab === 'dashboard' && (
            <DashboardPanel
              apiKeySet={apiKeySet}
              tenantNombre={tenantNombreConectado}
              navTo={navTo}
              adminKey={adminKeyInput}
              selectedClient={selectedClient}
              onSelectClient={setSelectedClient}
            />
          )}

          {tab === 'cartera' && (
            <CarteraPanel adminKey={adminKeyInput} setAdminKey={setAdminKeyInput} demoOn={demoOn} />
          )}

          {tab === 'flota' && apiKeySet && (
            <FlotaPanel pushNotif={pushNotif} demoOn={demoOn} />
          )}
          {tab === 'flota' && !apiKeySet && (
            <div className="card p-10 text-center">
              <p className="text-sm font-bold text-slate-700 mb-2">Conecta tu API Key</p>
              <p className="text-xs text-slate-600">Flota por uso requiere conectarse con la API key del cliente (ej. Ridery).</p>
            </div>
          )}

          {tab === 'conductores' && apiKeySet && (
            <ConductoresPanel pushNotif={pushNotif} />
          )}
          {tab === 'conductores' && !apiKeySet && (
            <div className="card p-10 text-center">
              <p className="text-sm font-bold text-slate-700 mb-2">Conecta tu API Key</p>
              <p className="text-xs text-slate-600">Esta sección requiere autenticación de cliente.</p>
            </div>
          )}

          {tab === 'setup' && (
            <SetupPanel
              adminKeyInput={adminKeyInput}         setAdminKeyInput={setAdminKeyInput}
              adminKeyVis={adminKeyVis}             setAdminKeyVis={setAdminKeyVis}
              tenantNombre={tenantNombre}           setTenantNombre={setTenantNombre}
              tenantWebhook={tenantWebhook}         setTenantWebhook={setTenantWebhook}
              tenantSecret={tenantSecret}           setTenantSecret={setTenantSecret}
              reqStatus={reqStatus}                 response={response}
              hasResponse={hasResponse}             handleCrearTenant={handleCrearTenant}
              setApiKeyInput={setApiKeyInput}       setApiKeyLoading={setApiKeyLoading}
              setApiKeyError={setApiKeyError}       setApiKeySet={setApiKeySet}
              setTenantNombreConectado={setTenantNombreConectado}
              pushNotif={pushNotif}
            />
          )}

          {tab === 'mapeo' && (
            <MapeoPanel
              seguroConfig={seguroConfig}           setSeguroConfig={setSeguroConfig}
              fieldMappings={fieldMappings}         defaultValues={defaultValues}
              grupoActivo={grupoActivo}             setGrupoActivo={setGrupoActivo}
              mapeoLoading={mapeoLoading}           mapeoSaved={mapeoSaved}
              reqStatus={reqStatus}                 exampleBody={exampleBody}
              mappedCount={mappedCount}             defaultCount={defaultCount}
              handleGuardarMapeo={handleGuardarMapeo}
              setMapping={setMapping}               clearMapping={clearMapping}
              setDefaultVal={setDefaultVal}         clearDefault={clearDefault}
            />
          )}

          {tab === 'viaje' && (
            <ViajePanel
              viajeRaw={viajeRaw}   setViajeRaw={setViajeRaw}
              exampleBody={exampleBody}
              reqStatus={reqStatus} response={response}
              hasResponse={hasResponse}
              handleIniciar={handleIniciar}
              cplan={seguroConfig.plan || 'RCVBAS'}
              hasSession={apiKeySet}
            />
          )}

          {tab === 'finalizar' && (
            <FinalizarPanel
              idViaje={idViaje}     setIdViaje={setIdViaje}
              reqStatus={reqStatus} response={response}
              hasResponse={hasResponse}
              handleFinalizar={handleFinalizar}
            />
          )}

          {tab === 'listar' && (
            <ViajesListPanel
              viajes={viajes}       totalViajes={totalViajes}
              reqStatus={reqStatus} demoOn={demoOn}
              handleListar={handleListar}
              onViewPoliza={v => setPolizaPreview(v)}
            />
          )}

          {tab === 'monitor' && (
            <MonitorPanel
              monitorData={monitorData}
              monitorLoading={monitorLoading}
              loadMonitor={loadMonitor}
            />
          )}

        </main>
      </div>

      <footer className="border-t border-slate-100 bg-white/80 backdrop-blur-sm">
        <div className="max-w-screen-2xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
            <div className="w-5 h-5 rounded-lg gradient-brand flex items-center justify-center shrink-0">
              {Ic.shield('w-3 h-3 text-white')}
            </div>
            <span className="font-bold text-slate-500">La Mundial de Seguros</span>
            <span className="text-slate-200">·</span>
            <span>Sistema de Emisión Automática</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500 font-semibold">
            <a href="/api/docs" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-brand-500 transition-colors">
              {Ic.link()} API Docs
            </a>
            <span>·</span>
            <span>v2.1 · {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
