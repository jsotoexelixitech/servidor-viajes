import React, { useState, useCallback, useEffect, useRef, FormEvent } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import {
  authApi, setSessionToken, clearSession, viajeApi, tenantApi, adminApi,
  Viaje, CAMPOS_SEGURO, SeguroConfig, FRECUENCIAS, CampoSeguro,
} from './api';

type Tab = 'dashboard' | 'setup' | 'mapeo' | 'viaje' | 'finalizar' | 'listar' | 'monitor';
type ReqStatus = 'idle' | 'loading' | 'success' | 'error';

interface Notif {
  id: string;
  tipo: 'success' | 'error' | 'info' | 'warning';
  titulo: string;
  mensaje: string;
  ts: Date;
}

// ─── Icons (crisp SVGs, 16px optical size) ────────────────────────────────────
const Ic = {
  grid:     (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="1.5" width="5" height="5" rx="1"/><rect x="9.5" y="1.5" width="5" height="5" rx="1"/><rect x="1.5" y="9.5" width="5" height="5" rx="1"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/></svg>,
  plus:     (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>,
  gear:     (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M12.95 3.05l-1.06 1.06M4.11 11.89 3.05 12.95"/></svg>,
  play:     (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 3.2a.8.8 0 0 1 1.2-.69l7.5 4.8a.8.8 0 0 1 0 1.38l-7.5 4.8A.8.8 0 0 1 4.5 12.8z"/></svg>,
  stop:     (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="currentColor"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/></svg>,
  rows:     (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12"/></svg>,
  pulse:    (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1,8 4,8 5.5,3 7.5,13 9.5,6 11,8 15,8"/></svg>,
  key:      (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="10.5" r="3.5"/><path d="m8.5 7.5 5-5M11 5l1.5 1.5"/></svg>,
  copy:     (p?: string) => <svg className={p ?? 'w-3.5 h-3.5'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="8" height="8" rx="1.5"/><path d="M4 10H3a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 3 1h6A1.5 1.5 0 0 1 10.5 2.5V4"/></svg>,
  check:    (p?: string) => <svg className={p ?? 'w-3.5 h-3.5'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 3.5 6 11 2.5 7.5"/></svg>,
  refresh:  (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 8A6 6 0 1 1 8 2a6 6 0 0 1 4.24 1.76L14 5.5"/><path d="M14 2v3.5h-3.5"/></svg>,
  shield:   (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 14.5S2 11.5 2 6.5V3l6-1.5L14 3v3.5C14 11.5 8 14.5 8 14.5z"/></svg>,
  close:    (p?: string) => <svg className={p ?? 'w-3 h-3'} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 3 3 9M3 3l6 6"/></svg>,
  warn:     (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7.02 2.78 1.18 12.5a1.13 1.13 0 0 0 .98 1.5h11.68a1.13 1.13 0 0 0 .98-1.5L8.98 2.78a1.13 1.13 0 0 0-1.96 0z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor"/></svg>,
  info:     (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><line x1="8" y1="7.5" x2="8" y2="11"/><circle cx="8" cy="5" r="0.5" fill="currentColor"/></svg>,
  arrow:    (p?: string) => <svg className={p ?? 'w-3.5 h-3.5'} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h8M8 4l3 3-3 3"/></svg>,
  eye:      (p?: string) => <svg className={p ?? 'w-3.5 h-3.5'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 8s2.5-5 6.5-5 6.5 5 6.5 5-2.5 5-6.5 5-6.5-5-6.5-5z"/><circle cx="8" cy="8" r="2"/></svg>,
  eyeOff:   (p?: string) => <svg className={p ?? 'w-3.5 h-3.5'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 2l12 12M6.5 6.6A2 2 0 0 0 9.4 9.5M4.1 4.2A6.5 6.5 0 0 0 1.5 8s2.5 5 6.5 5a6.4 6.4 0 0 0 3.9-1.3M6 2.3A6.4 6.4 0 0 1 8 2c4 0 6.5 5 6.5 5a11.6 11.6 0 0 1-1.5 2.3"/></svg>,
  link:     (p?: string) => <svg className={p ?? 'w-3 h-3'} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2H3a2 2 0 0 0 0 4h2M7 10h2a2 2 0 0 0 0-4H7M4 6h4"/></svg>,
  chevron:  (p?: string) => <svg className={p ?? 'w-3.5 h-3.5'} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 3 4 4-4 4"/></svg>,
};

const POLIZA_BADGE: Record<string, string> = {
  ACTIVA:     'badge badge-green',
  EMITIENDO:  'badge badge-yellow',
  ERROR:      'badge badge-red',
  CRITICO:    'badge bg-red-600 text-white ring-0 animate-pulse',
  FINALIZADA: 'badge badge-gray',
};

const TIPO_BADGE: Record<string, string> = {
  texto:   'badge badge-blue',
  numero:  'badge badge-purple',
  fecha:   'badge badge-yellow',
  interno: 'badge badge-gray',
};

const GRUPO_META = {
  vehiculo: { label: 'Vehículo', icon: '🚗', color: 'bg-blue-500' },
  tomador:  { label: 'Tomador',  icon: '👤', color: 'bg-purple-500' },
  interno:  { label: 'Sistema',  icon: '⚙️', color: 'bg-slate-400' },
} as const;

// ─── Primitive Components ─────────────────────────────────────────────────────

function Spinner({ size = 'md', color = 'current' }: { size?: 'sm' | 'md' | 'lg'; color?: string }) {
  const sz = size === 'sm' ? 'w-3.5 h-3.5 border' : size === 'lg' ? 'w-7 h-7 border-2' : 'w-5 h-5 border-2';
  return <div className={`${sz} border-${color} border-t-transparent rounded-full animate-spin shrink-0`} style={color !== 'current' ? undefined : { borderColor: 'currentColor', borderTopColor: 'transparent' }} />;
}

function CopyButton({ text, compact }: { text: string; compact?: boolean }) {
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
        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all active:scale-90">
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

// Syntax-highlighted JSON
function JsonBox({ data, maxH = '18rem' }: { data: unknown; maxH?: string }) {
  if (data === null || data === undefined) return null;
  const raw = JSON.stringify(data, null, 2);
  // Simple tokeniser: strings, numbers, booleans, null, keys
  const html = raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"([^"]+)"(\s*:)/g, '<span class="json-key">"$1"</span>$2')
    .replace(/(:\s*)"([^"]*)"/g, '$1<span class="json-str">"$2"</span>')
    .replace(/:\s*(\b\d+\.?\d*\b)/g, (m, n) => m.replace(n, `<span class="json-num">${n}</span>`))
    .replace(/:\s*(true|false)/g, (m, b) => m.replace(b, `<span class="json-bool">${b}</span>`))
    .replace(/:\s*(null)/g, (m, n) => m.replace(n, `<span class="json-null">${n}</span>`));

  return (
    <div className="relative group">
      <pre
        className="font-mono text-xs rounded-xl p-4 overflow-auto border border-[#21262d]/50 bg-[#0d1117] leading-relaxed"
        style={{ maxHeight: maxH }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style>{`
        .json-key  { color: #79c0ff; }
        .json-str  { color: #a5d6ff; }
        .json-num  { color: #f78166; }
        .json-bool { color: #ff9492; }
        .json-null { color: #8b949e; }
      `}</style>
      <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={raw} compact />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: ReqStatus }) {
  if (status === 'idle') return null;
  const map = {
    loading: { cls: 'badge badge-yellow gap-1.5', content: <><Spinner size="sm" />Procesando</> },
    success: { cls: 'badge badge-green  gap-1',   content: <>{Ic.check('w-3 h-3')}Exitoso</> },
    error:   { cls: 'badge badge-red    gap-1',   content: <>{Ic.warn('w-3 h-3')}Error</> },
  };
  const s = map[status];
  return <span className={s.cls}>{s.content}</span>;
}

function ResponsePanel({ status, data }: { status: ReqStatus; data: unknown }) {
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

function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-7 animate-in">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>
      {action && <div className="ml-4 shrink-0">{action}</div>}
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="card p-16 flex flex-col items-center justify-center text-center animate-in">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300 mb-4">
        {icon}
      </div>
      <p className="font-bold text-slate-600">{title}</p>
      {sub && <p className="text-sm text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function SectionCard({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-6 animate-in">
      <div className="flex items-center gap-2.5 mb-5">
        <span className="section-num">{num}</span>
        <span className="section-title">{title}</span>
      </div>
      {children}
    </div>
  );
}

function FieldRow({ campo, mappedVal, defVal, onMap, onClear }: {
  campo: CampoSeguro; mappedVal: string; defVal: string;
  onMap: (v: string) => void; onClear: () => void;
}) {
  const isMapped = mappedVal.trim() !== '';
  return (
    <div className={[
      'grid items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-150',
      'grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_72px]',
      isMapped  ? 'bg-brand-50/60 border-brand-200/70'
        : defVal ? 'bg-emerald-50/50 border-emerald-100'
        : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/40',
    ].join(' ')}>
      {/* left: internal name */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <code className="text-[11px] font-mono font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md truncate max-w-[130px] block">
            {campo.key}
          </code>
          {campo.requerido && <span className="text-red-400 text-[10px] font-bold leading-none shrink-0">REQ</span>}
        </div>
        <p className="text-[11px] text-slate-400 truncate">{campo.descripcion}</p>
      </div>
      {/* arrow */}
      <span className="text-slate-200 font-bold text-center select-none">←</span>
      {/* right: custom name */}
      <div className="flex items-center gap-1 min-w-0">
        <input
          type="text" value={mappedVal}
          onChange={e => onMap(e.target.value)}
          placeholder={defVal ? `default: ${defVal}` : campo.key}
          className={['input-sm flex-1 min-w-0', isMapped ? 'border-brand-300/80 bg-white font-medium text-brand-800' : ''].join(' ')}
        />
        {isMapped && (
          <button type="button" onClick={onClear}
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded-md text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all">
            {Ic.close()}
          </button>
        )}
      </div>
      {/* type badge */}
      <span className={TIPO_BADGE[campo.tipo]}>{campo.tipo}</span>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [apiKeyInput,   setApiKeyInput]   = useState('');
  const [apiKeySet,     setApiKeySet]     = useState(false);
  const [apiKeyVis,     setApiKeyVis]     = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyError,   setApiKeyError]   = useState('');
  const [tenantNombreConectado, setTenantNombreConectado] = useState('');
  const [notifs,        setNotifs]        = useState<Notif[]>([]);
  const [notifOpen,     setNotifOpen]     = useState(false);
  const apiKeyRef = useRef<HTMLInputElement>(null);

  const [response,   setResponse]  = useState<unknown>(null);
  const hasResponse = response !== null && response !== undefined;
  const [reqStatus,  setReqStatus] = useState<ReqStatus>('idle');

  // Setup
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

  // ── Notificaciones ────────────────────────────────────────────────────────
  const pushNotif = useCallback((tipo: Notif['tipo'], titulo: string, mensaje: string) => {
    const notif: Notif = { id: crypto.randomUUID(), tipo, titulo, mensaje, ts: new Date() };
    setNotifs(prev => [notif, ...prev].slice(0, 50));
    if (tipo === 'success')      toast.success(mensaje, { duration: 3000 });
    else if (tipo === 'error')   toast.error(mensaje,   { duration: 6000 });
    else if (tipo === 'warning') toast(mensaje,          { icon: '⚠️', duration: 4000 });
    else                         toast(mensaje,          { duration: 3000 });
  }, []);

  /** Traduce errores técnicos del servidor a mensajes comprensibles para el usuario. */
  const friendlyError = useCallback((e: unknown): { titulo: string; mensaje: string } => {
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
    return { titulo: 'Error',                mensaje: raw || 'Ocurrió un error inesperado.' };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSetApiKey = async () => {
    const key = apiKeyInput.trim();
    if (!key) return;
    setApiKeyLoading(true);
    setApiKeyError('');
    try {
      const res = await authApi.login(key);
      setSessionToken(res.data.sessionToken);
      setApiKeySet(true);
      setApiKeyInput('');
      setTenantNombreConectado(res.data.tenant.nombre);
      pushNotif('success', 'Conectado', `Sesión iniciada como "${res.data.tenant.nombre}"`);
    } catch (e: unknown) {
      clearSession();
      setApiKeySet(false);
      setTenantNombreConectado('');
      const { titulo, mensaje } = friendlyError(e);
      setApiKeyError(mensaje);
      pushNotif('error', titulo, mensaje);
    } finally {
      setApiKeyLoading(false);
    }
  };

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
  }, [friendlyError, pushNotif]);

  useEffect(() => {
    if (!apiKeySet || tab !== 'mapeo') return;
    setMapeoLoading(true);
    setMapeoSaved(false);
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
  }, [apiKeySet, tab, friendlyError, pushNotif]);

  const loadMonitor = useCallback(() => {
    if (!apiKeySet) return;
    setMonitorLoading(true);
    tenantApi.misPolizasCriticas()
      .then(r => setMonitorData(r.data as Record<string, unknown>))
      .catch(e => {
        const { titulo, mensaje } = friendlyError(e);
        pushNotif('error', titulo, mensaje);
      })
      .finally(() => setMonitorLoading(false));
  }, [apiKeySet, friendlyError, pushNotif]);

  useEffect(() => {
    if (apiKeySet && tab === 'monitor') loadMonitor();
  }, [apiKeySet, tab, loadMonitor]);

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

  const handleCrearTenant = (e: FormEvent) => {
    e.preventDefault();
    if (!adminKeyInput.trim()) {
      pushNotif('warning', 'Clave requerida', 'Ingresa la Admin Key para crear clientes.');
      return;
    }
    doRequest(() => adminApi.crear(
      { nombre: tenantNombre, ...(tenantWebhook && { webhookUrl: tenantWebhook }), ...(tenantSecret && { webhookSecret: tenantSecret }) },
      adminKeyInput.trim(),
    ));
  };

  const handleGuardarMapeo = async (e: FormEvent) => {
    e.preventDefault(); setMapeoSaved(false);
    const cleanDefs: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(defaultValues)) {
      if (v.trim()) { const n = Number(v); cleanDefs[k] = isNaN(n) ? v : n; }
    }
    const ok = await doRequest(() => tenantApi.configurarSeguro({ seguroConfig, fieldMappings, defaultValues: cleanDefs }));
    if (ok) { setMapeoSaved(true); setTimeout(() => setMapeoSaved(false), 3000); }
  };

  const handleIniciar = (e: FormEvent) => {
    e.preventDefault();
    if (!viajeRaw.trim()) {
      setResponse({ error: 'El body JSON no puede estar vacío.' });
      setReqStatus('error');
      return;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(viajeRaw); }
    catch { setResponse({ error: 'JSON inválido. Verifica el formato.' }); setReqStatus('error'); return; }
    doRequest(() => viajeApi.iniciar(parsed as Record<string, unknown>));
  };

  const handleFinalizar = (e: FormEvent) => { e.preventDefault(); doRequest(() => viajeApi.finalizar(idViaje)); };

  const handleListar = () => {
    setReqStatus('loading');
    viajeApi.listar()
      .then(r => { setViajes(r.data.data); setTotalViajes(r.data.total); setResponse(r.data); setReqStatus('success'); })
      .catch(e => { setResponse(e.response?.data ?? { error: e.message }); setReqStatus('error'); });
  };

  const setMapping   = (k: string, v: string) => setFieldMappings(p => ({ ...p, [k]: v }));
  const setDefaultVal  = (k: string, v: string) => setDefaultValues(p => ({ ...p, [k]: v }));
  const clearMapping = (k: string) => setFieldMappings(p => { const n = { ...p }; delete n[k]; return n; });
  const clearDefault = (k: string) => setDefaultValues(p => { const n = { ...p }; delete n[k]; return n; });

  const exampleBody  = buildExampleBody();
  const camposGrupo  = CAMPOS_SEGURO.filter(c => c.grupo === grupoActivo);
  const mappedCount  = Object.values(fieldMappings).filter(v => v?.trim()).length;
  const defaultCount = Object.values(defaultValues).filter(v => v?.trim()).length;

  const NAV_REQUIRES_KEY = new Set<Tab>(['mapeo', 'viaje', 'finalizar', 'listar', 'monitor']);
  const navTo = (id: Tab) => {
    if (NAV_REQUIRES_KEY.has(id) && !apiKeySet) return;
    setTab(id); setReqStatus('idle'); setResponse(null);
  };

  const NAV: { id: Tab; label: string; icon: () => React.ReactNode; dot?: boolean; requiresKey?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard',     icon: () => Ic.grid() },
    { id: 'setup',     label: 'Nuevo Cliente', icon: () => Ic.plus() },
    { id: 'mapeo',     label: 'Configuración', icon: () => Ic.gear(),  requiresKey: true },
    { id: 'viaje',     label: 'Iniciar Viaje', icon: () => Ic.play(),  requiresKey: true },
    { id: 'finalizar', label: 'Finalizar',     icon: () => Ic.stop(),  requiresKey: true },
    { id: 'listar',    label: 'Viajes',        icon: () => Ic.rows(),  requiresKey: true },
    { id: 'monitor',   label: 'Monitor',       icon: () => Ic.pulse(), dot: true, requiresKey: true },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen flex flex-col bg-[#f4f6fb]">
      <Toaster position="top-right" toastOptions={{
        style: { fontSize: '12px', fontWeight: 600, borderRadius: '10px', maxWidth: '360px' },
        success: { style: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' } },
        error:   { style: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' } },
      }} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="h-14 bg-white border-b border-slate-100 sticky top-0 z-40"
        style={{ boxShadow: '0 1px 0 #e2e8f0, 0 2px 8px -2px rgb(0 0 0/.04)' }}>
        <div className="h-full px-4 flex items-center gap-4 max-w-screen-2xl mx-auto">

          {/* Sidebar toggle */}
          <button onClick={() => setSidebarOpen(s => !s)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all shrink-0"
            title={sidebarOpen ? 'Colapsar menú' : 'Expandir menú'}>
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              {sidebarOpen ? <><path d="M2 4h12M2 8h12M2 12h12"/></> : <><path d="M2 4h12M2 8h8M2 12h12"/></>}
            </svg>
          </button>

          {/* Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-xl gradient-brand flex items-center justify-center shrink-0"
              style={{ boxShadow: '0 3px 8px -1px rgb(77 85 232 / .35)' }}>
              {Ic.shield('w-4 h-4 text-white')}
            </div>
            <div className="leading-none hidden sm:block">
              <span className="block text-sm font-extrabold text-slate-900 tracking-tight">Ridery</span>
              <span className="block text-[9px] text-slate-400 font-bold tracking-[0.12em] uppercase">Seguros</span>
            </div>
          </div>

          <div className="w-px h-5 bg-slate-100 shrink-0" />

          {/* API Key area */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none">
                {Ic.key('w-3.5 h-3.5')}
              </span>
              <input
                ref={apiKeyRef}
                type={apiKeyVis ? 'text' : 'password'}
                placeholder="API Key del cliente…"
                value={apiKeyInput}
                onChange={e => { setApiKeyInput(e.target.value); setApiKeyError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSetApiKey()}
                className="input pl-8 pr-8 h-8 text-xs rounded-lg"
              />
              <button onClick={() => setApiKeyVis(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
                {Ic.eye('w-3.5 h-3.5')}
              </button>
            </div>
            <button onClick={handleSetApiKey} disabled={apiKeyLoading || !apiKeyInput.trim()}
              className="btn-primary h-8 text-xs px-3.5 rounded-lg whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
              {apiKeyLoading && <Spinner size="sm" />}
              {apiKeySet ? 'Actualizar' : 'Conectar'}
            </button>
            {apiKeyError && (
              <span className="text-[10.5px] font-bold text-red-500 whitespace-nowrap shrink-0">{apiKeyError}</span>
            )}
            {apiKeySet && !apiKeyError && (
              <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-emerald-600 bg-emerald-50 ring-1 ring-inset ring-emerald-200/70 px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {tenantNombreConectado ? tenantNombreConectado : 'Conectado'}
              </div>
            )}
          </div>

          {/* Right slot */}
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
              <span className="kbd">Ctrl</span><span className="kbd">K</span>
              <span className="ml-1">buscar</span>
            </span>
            <div className="w-px h-4 bg-slate-100 hidden lg:block" />

            {/* Campana de notificaciones */}
            <div className="relative">
              <button onClick={() => setNotifOpen(o => !o)}
                className="relative w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
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
                      <button onClick={() => setNotifs([])}
                        className="text-[10px] text-slate-400 hover:text-red-500 transition-colors font-semibold">
                        Limpiar todo
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                    {notifs.length === 0 ? (
                      <p className="text-center text-xs text-slate-400 py-6">Sin notificaciones</p>
                    ) : notifs.map(n => (
                      <div key={n.id} className={`flex gap-3 px-4 py-3 text-xs ${
                        n.tipo === 'success' ? 'bg-emerald-50/50' :
                        n.tipo === 'error'   ? 'bg-red-50/50' :
                        n.tipo === 'warning' ? 'bg-amber-50/50' : 'bg-white'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${
                          n.tipo === 'success' ? 'bg-emerald-500' :
                          n.tipo === 'error'   ? 'bg-red-500' :
                          n.tipo === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                        <div className="min-w-0">
                          <p className="font-bold text-slate-700 truncate">{n.titulo}</p>
                          <p className="text-slate-500 mt-0.5">{n.mensaje}</p>
                          <p className="text-slate-300 mt-1">{n.ts.toLocaleTimeString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="w-px h-4 bg-slate-100" />
            <span className="text-[11px] text-slate-300 font-semibold hidden lg:block">v2.1</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 max-w-screen-2xl mx-auto w-full">

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className={`shrink-0 transition-all duration-200 ease-in-out ${sidebarOpen ? 'w-52' : 'w-0 overflow-hidden'}`}>
          <div className="w-52 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto flex flex-col py-4 px-3 gap-0.5">

            <p className="text-[9.5px] font-extrabold text-slate-300 uppercase tracking-[0.14em] px-3 mb-2">
              Menu
            </p>

            {NAV.map(item => {
              const disabled = !!(item.requiresKey && !apiKeySet);
              const isActive = tab === item.id;
              return (
                <button key={item.id}
                  onClick={() => !disabled && navTo(item.id)}
                  disabled={disabled}
                  title={disabled ? 'Requiere API Key' : item.label}
                  className={`nav-item ${isActive ? 'nav-active' : disabled ? 'nav-disabled' : 'nav-inactive'}`}>
                  <span className={`${isActive ? 'text-white/90' : disabled ? 'text-slate-300' : 'text-slate-400'} shrink-0`}>
                    {item.icon()}
                  </span>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.dot && !disabled && (
                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-amber-300' : 'bg-amber-400'}`} />
                  )}
                </button>
              );
            })}

            <div className="flex-1" />

            {/* Bottom status */}
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
          </div>
        </aside>

        {/* ── Main ─────────────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 py-7 px-6">

          {/* ══ DASHBOARD ══ */}
          {tab === 'dashboard' && (
            <div className="animate-in-slow">
              <PageHeader title="Panel de Control" subtitle="Plataforma de emisión de pólizas de seguro vehicular" />

              {/* KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 stagger">
                {[
                  { label: 'Capacidad diaria',    value: '120 K+', sub: 'viajes por día',         gradient: 'gradient-brand',   shadow: 'shadow-[0_6px_20px_-4px_rgb(77_85_232/.35)]' },
                  { label: 'Disponibilidad',       value: '99.9 %', sub: 'uptime garantizado',     gradient: 'gradient-success', shadow: 'shadow-[0_6px_20px_-4px_rgb(5_150_105/.32)]' },
                  { label: 'Cobertura reintentos', value: '3 h',    sub: 'protección ante fallos', gradient: 'gradient-warm',    shadow: 'shadow-[0_6px_20px_-4px_rgb(217_119_6/.30)]' },
                ].map(k => (
                  <div key={k.label} className={`noise relative overflow-hidden ${k.gradient} ${k.shadow} rounded-[var(--radius)] p-5 text-white`}>
                    <p className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] opacity-60">{k.label}</p>
                    <p className="text-[2.5rem] font-extrabold leading-tight mt-1 tabular-nums">{k.value}</p>
                    <p className="text-xs opacity-50 mt-0.5 font-medium">{k.sub}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                {/* Quick start */}
                <div className="lg:col-span-2 card p-6">
                  <p className="section-title mb-5">🚀 Inicio rápido</p>
                  <ol className="space-y-4">
                    {[
                      { t: 'Crea tu empresa',     d: '"Nuevo Cliente" → obtén tu API Key',        go: 'setup'   as Tab },
                      { t: 'Conecta la API Key',  d: 'Pégala en el campo del header',              go: null },
                      { t: 'Configura el mapeo',  d: 'Define campos y valores por defecto',        go: 'mapeo'   as Tab },
                      { t: 'Inicia viajes',        d: 'Envía tu JSON → póliza emitida al instante', go: 'viaje'   as Tab },
                      { t: 'Monitorea',            d: 'Supervisa pólizas en tiempo real',           go: 'monitor' as Tab },
                    ].map((s, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="step-num mt-0.5">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800">{s.t}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{s.d}</p>
                        </div>
                        {s.go && (() => {
                          const needsKey = NAV_REQUIRES_KEY.has(s.go);
                          const blocked  = needsKey && !apiKeySet;
                          return (
                            <button onClick={() => navTo(s.go!)} disabled={blocked}
                              title={blocked ? 'Requiere API Key' : undefined}
                              className={`shrink-0 flex items-center gap-0.5 text-xs font-bold transition-colors mt-0.5 ${
                                blocked ? 'text-slate-300 cursor-not-allowed' : 'text-brand-600 hover:text-brand-800'
                              }`}>
                              Ir {Ic.arrow()}
                            </button>
                          );
                        })()}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Features */}
                <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3 stagger">
                  {[
                    { icon: '🔐', t: 'Multi-tenant',           d: 'Datos aislados por empresa. Cada cliente opera en su propio espacio seguro y privado.' },
                    { icon: '⚡', t: 'Alta disponibilidad',     d: 'Cluster Node.js + PostgreSQL pooling + Redis distribuido para resistir picos de tráfico.' },
                    { icon: '🛡️', t: '5 capas de protección',  d: 'Idempotencia, circuit breaker, reintentos exponenciales, guardian cron y verificación post-emisión.' },
                    { icon: '🔄', t: 'Reintentos automáticos',  d: 'Si la emisión falla, el sistema reintenta con backoff exponencial hasta 3 horas continuas.' },
                  ].map(f => (
                    <div key={f.t} className="card-hover p-4 flex items-start gap-3">
                      <span className="text-xl mt-0.5 shrink-0">{f.icon}</span>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{f.t}</p>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{f.d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ SETUP ══ */}
          {tab === 'setup' && (
            <div className="animate-in">
              <PageHeader title="Nuevo Cliente" subtitle="Registra una empresa y obtén su API Key de acceso" />
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

                <div className="lg:col-span-3 card p-6">
                  <p className="section-title mb-5">{Ic.plus()} Datos del cliente</p>
                  <form onSubmit={handleCrearTenant} className="space-y-4">
                    <div>
                      <label className="label">Admin Key <span className="text-red-400">*</span></label>
                      <div className="relative">
                        <input className="input pr-10" type={adminKeyVis ? 'text' : 'password'}
                          value={adminKeyInput} onChange={e => setAdminKeyInput(e.target.value)}
                          placeholder="Clave de administración del servidor" required />
                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          onClick={() => setAdminKeyVis(v => !v)}>
                          {adminKeyVis ? Ic.eye('w-4 h-4') : Ic.eyeOff('w-4 h-4')}
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                        {Ic.info('w-3 h-3')} Valor de ADMIN_SECRET en el servidor
                      </p>
                    </div>
                    <div>
                      <label className="label">Nombre de la empresa <span className="text-red-400">*</span></label>
                      <input className="input" value={tenantNombre} onChange={e => setTenantNombre(e.target.value)}
                        placeholder="Ej: Taxis Express C.A." required />
                    </div>
                    <div>
                      <label className="label">Webhook URL <span className="text-slate-300 normal-case font-normal tracking-normal text-xs">— opcional</span></label>
                      <input className="input" type="url" value={tenantWebhook} onChange={e => setTenantWebhook(e.target.value)}
                        placeholder="https://tu-sistema.com/api/eventos" />
                      <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                        {Ic.info('w-3 h-3')} Recibirás notificaciones automáticas de cada evento
                      </p>
                    </div>
                    <div>
                      <label className="label">Webhook Secret <span className="text-slate-300 normal-case font-normal tracking-normal text-xs">— opcional</span></label>
                      <input className="input" type="password" value={tenantSecret} onChange={e => setTenantSecret(e.target.value)}
                        placeholder="Clave HMAC para verificar origen" />
                    </div>
                    <button type="submit" className="btn-primary w-full mt-1" disabled={reqStatus === 'loading'}>
                      {reqStatus === 'loading' ? <><Spinner size="sm" /> Creando…</> : <>{Ic.plus()} Crear Cliente</>}
                    </button>
                  </form>
                </div>

                <div className="lg:col-span-2 space-y-4">
                  <div className="alert-warn">
                    <p className="text-sm font-bold text-amber-800 flex items-center gap-2 mb-2">
                      {Ic.warn('w-4 h-4')} Importante
                    </p>
                    <ul className="text-xs text-amber-700 space-y-2 leading-relaxed">
                      <li className="flex gap-2"><span className="shrink-0 mt-0.5">•</span><span>La <strong>API Key</strong> solo se muestra <strong>una vez</strong>. Guárdala inmediatamente.</span></li>
                      <li className="flex gap-2"><span className="shrink-0 mt-0.5">•</span><span>Cada empresa tiene datos completamente aislados.</span></li>
                      <li className="flex gap-2"><span className="shrink-0 mt-0.5">•</span><span>Copia la key al header para empezar a configurar.</span></li>
                    </ul>
                  </div>

                  {reqStatus === 'success' && hasResponse && (response as any)?.apiKey && (
                    <div className="alert-success animate-in">
                      <p className="text-sm font-bold text-emerald-800 mb-1 flex items-center gap-1.5">
                        {Ic.check('w-4 h-4')} Cliente creado exitosamente
                      </p>
                      <p className="text-xs text-emerald-700 mb-3">Copia tu API Key antes de salir:</p>
                      <div className="bg-white rounded-xl p-3 border border-emerald-200 flex items-start gap-2">
                        <code className="flex-1 break-all text-xs font-mono text-slate-700 leading-relaxed">
                          {(response as any).apiKey}
                        </code>
                        <CopyButton text={(response as any).apiKey} compact />
                      </div>
                      <button className="mt-3 btn-primary w-full text-xs"
                        onClick={async () => {
                          const key = (response as any).apiKey as string;
                          setApiKeyInput(key);
                          setApiKeyLoading(true);
                          setApiKeyError('');
                          try {
                            const res = await authApi.login(key);
                            setSessionToken(res.data.sessionToken);
                            setApiKeySet(true);
                            setApiKeyInput('');
                            setTenantNombreConectado(res.data.tenant.nombre);
                            pushNotif('success', 'Conectado', `Sesión iniciada como "${res.data.tenant.nombre}"`);
                          } catch {
                            setApiKeyError('No se pudo iniciar sesión automáticamente.');
                            pushNotif('error', 'Error', 'No se pudo iniciar sesión con la nueva API Key');
                          } finally {
                            setApiKeyLoading(false);
                          }
                        }}>
                        {Ic.key()} Usar esta API Key ahora
                      </button>
                    </div>
                  )}

                  {hasResponse && reqStatus === 'error' && <ResponsePanel status={reqStatus} data={response} />}
                </div>
              </div>
            </div>
          )}

          {/* ══ MAPEO ══ */}
          {tab === 'mapeo' && (
            <div className="animate-in">
              <PageHeader
                title="Configuración del Cliente"
                subtitle="Conexión al servicio, mapeo de campos y valores por defecto"
                action={
                  <div className="flex items-center gap-2">
                    {mappedCount  > 0 && <span className="badge badge-blue">{mappedCount} mapeados</span>}
                    {defaultCount > 0 && <span className="badge badge-green">{defaultCount} con default</span>}
                  </div>
                }
              />
              {mapeoLoading ? (
                <div className="card p-16 flex items-center justify-center gap-3 text-slate-400">
                  <Spinner size="lg" /><span className="text-sm font-medium">Cargando configuración…</span>
                </div>
              ) : (
                <form onSubmit={handleGuardarMapeo} className="space-y-5">
                  {/* 1: Conexión */}
                  <SectionCard num={1} title="Conexión al servicio">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label className="label">URL del servicio <span className="text-red-400">*</span></label>
                        <input className="input" value={seguroConfig.baseUrl}
                          onChange={e => setSeguroConfig(p => ({ ...p, baseUrl: e.target.value }))}
                          placeholder="https://api.tu-aseguradora.com" required />
                      </div>
                      <div>
                        <label className="label">Token de autenticación</label>
                        <input className="input" type="password" value={seguroConfig.authToken ?? ''}
                          onChange={e => setSeguroConfig(p => ({ ...p, authToken: e.target.value }))}
                          placeholder="Bearer token (si aplica)" />
                      </div>
                      <div>
                        <label className="label">Frecuencia de pago</label>
                        <select className="input" value={seguroConfig.frecuencia}
                          onChange={e => setSeguroConfig(p => ({ ...p, frecuencia: e.target.value }))}>
                          {FRECUENCIAS.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Plan <span className="text-red-400">*</span></label>
                        <input className="input" value={seguroConfig.plan}
                          onChange={e => setSeguroConfig(p => ({ ...p, plan: e.target.value }))}
                          placeholder="Ej: RCVBAS" required />
                      </div>
                      <div>
                        <label className="label">Código de ramo <span className="text-red-400">*</span></label>
                        <input className="input" type="number" value={seguroConfig.cramo}
                          onChange={e => setSeguroConfig(p => ({ ...p, cramo: parseInt(e.target.value) }))}
                          placeholder="18" required />
                      </div>
                      <div>
                        <label className="label">Código de productor</label>
                        <input className="input" type="number" value={seguroConfig.productor ?? ''}
                          onChange={e => setSeguroConfig(p => ({ ...p, productor: parseInt(e.target.value) || undefined }))}
                          placeholder="Ej: 80080" />
                      </div>
                      <div>
                        <label className="label">Usuario del sistema</label>
                        <input className="input" value={seguroConfig.cusuario ?? ''}
                          onChange={e => setSeguroConfig(p => ({ ...p, cusuario: e.target.value || undefined }))}
                          placeholder="Usuario (si aplica)" />
                      </div>
                    </div>
                  </SectionCard>

                  {/* 2: Mapeo */}
                  <SectionCard num={2} title="Mapeo de campos">
                    <p className="text-xs text-slate-400 -mt-2 mb-4 ml-7">
                      Izquierda: nombre interno. Derecha: nombre que usa <strong className="text-slate-600">tu empresa</strong>. Vacío = usa el mismo nombre.
                    </p>
                    {/* Group tabs */}
                    <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit mb-4">
                      {(Object.keys(GRUPO_META) as Array<keyof typeof GRUPO_META>).filter(g => g !== 'interno').map(g => {
                        const cnt   = CAMPOS_SEGURO.filter(c => c.grupo === g && fieldMappings[c.key]?.trim()).length;
                        const total = CAMPOS_SEGURO.filter(c => c.grupo === g).length;
                        return (
                          <button key={g} type="button" onClick={() => setGrupoActivo(g)}
                            className={['flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all',
                              grupoActivo === g ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                            ].join(' ')}>
                            <span>{GRUPO_META[g].icon}</span>
                            <span>{GRUPO_META[g].label}</span>
                            <span className={`text-[10px] font-extrabold ${grupoActivo === g ? 'text-brand-500' : 'text-slate-400'}`}>
                              {cnt}/{total}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Header row */}
                    <div className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_72px] gap-3 px-3 py-1 mb-1 text-[10px] font-extrabold text-slate-300 uppercase tracking-[0.1em]">
                      <span>Campo interno</span><span /><span>Nombre en tu empresa</span><span>Tipo</span>
                    </div>
                    <div className="space-y-1.5">
                      {camposGrupo.map((campo: CampoSeguro) => (
                        <FieldRow key={campo.key} campo={campo}
                          mappedVal={fieldMappings[campo.key] ?? ''}
                          defVal={(defaultValues[campo.key] ?? '').trim()}
                          onMap={v => setMapping(campo.key, v)}
                          onClear={() => clearMapping(campo.key)}
                        />
                      ))}
                    </div>
                  </SectionCard>

                  {/* 3: Defaults */}
                  <SectionCard num={3} title="Valores por defecto">
                    <p className="text-xs text-slate-400 -mt-2 mb-4 ml-7">
                      Campos que tu empresa <strong className="text-slate-600">no envía</strong> por viaje. El sistema los aplica automáticamente.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {CAMPOS_SEGURO.filter(c => c.grupo !== 'interno').map(campo => {
                        const val = defaultValues[campo.key] ?? '';
                        return (
                          <div key={campo.key}>
                            <label className="label flex items-center gap-1">
                              <code className="font-mono normal-case font-semibold tracking-normal text-slate-500">{campo.key}</code>
                              {campo.requerido && <span className="text-red-400 text-[10px]">REQ</span>}
                            </label>
                            <div className="flex items-center gap-1">
                              <input value={val} onChange={e => setDefaultVal(campo.key, e.target.value)}
                                placeholder={campo.ejemplo || campo.key}
                                className={['input-sm flex-1', val ? 'border-emerald-300/80 bg-emerald-50/40 font-medium text-emerald-800' : ''].join(' ')} />
                              {val && (
                                <button type="button" onClick={() => clearDefault(campo.key)}
                                  className="w-5 h-5 flex items-center justify-center rounded-md text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all shrink-0">
                                  {Ic.close()}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>

                  {/* Actions */}
                  <div className="flex items-center gap-3 pb-1">
                    <button type="submit" className="btn-success" disabled={reqStatus === 'loading'}>
                      {reqStatus === 'loading' ? <><Spinner size="sm" />Guardando…</> : <>{Ic.check()} Guardar configuración</>}
                    </button>
                    {mapeoSaved && <span className="badge badge-green animate-in">{Ic.check('w-3 h-3')} Guardado</span>}
                    {reqStatus !== 'loading' && <StatusPill status={reqStatus} />}
                  </div>

                  {/* Preview */}
                  <div className="card border-dashed border-2 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-xs font-bold text-slate-600">JSON de ejemplo para tu empresa</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">POST /api/viaje/iniciar · según tu mapeo actual</p>
                      </div>
                      <CopyButton text={JSON.stringify(exampleBody, null, 2)} />
                    </div>
                    <JsonBox data={exampleBody} />
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ══ VIAJE ══ */}
          {tab === 'viaje' && (
            <div className="animate-in">
              <PageHeader title="Iniciar Viaje" subtitle="Registra el inicio de un viaje — la póliza se emite automáticamente" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <p className="section-title">{Ic.play()} POST /api/viaje/iniciar</p>
                    {viajeRaw && (
                      <button type="button" onClick={() => setViajeRaw('')}
                        className="btn-ghost text-xs py-1 px-2 h-auto">
                        {Ic.close()} Limpiar
                      </button>
                    )}
                  </div>
                  <form onSubmit={handleIniciar} className="space-y-4">
                    <div>
                      <label className="label">Body JSON</label>
                      <textarea value={viajeRaw} onChange={e => setViajeRaw(e.target.value)}
                        placeholder={JSON.stringify(exampleBody, null, 2)}
                        className="input font-mono text-xs resize-none h-80 leading-relaxed"
                        spellCheck={false} />
                    </div>
                    <button type="submit" className="btn-success w-full" disabled={reqStatus === 'loading'}>
                      {reqStatus === 'loading' ? <><Spinner size="sm" />Procesando…</> : <>{Ic.play()} Iniciar Viaje y Emitir Póliza</>}
                    </button>
                  </form>
                </div>

                <div className="space-y-4">
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold text-slate-600">Referencia (según tu mapeo)</p>
                      <div className="flex items-center gap-2">
                        <CopyButton text={JSON.stringify(exampleBody, null, 2)} />
                        <button onClick={() => setViajeRaw(JSON.stringify(exampleBody, null, 2))}
                          className="btn-secondary text-xs py-1 px-2.5 h-auto rounded-lg">
                          Usar JSON
                        </button>
                      </div>
                    </div>
                    <JsonBox data={exampleBody} />
                  </div>
                  <div className="alert-info">
                    <p className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">{Ic.info()} Flujo de emisión</p>
                    <ol className="text-xs text-blue-700 space-y-1.5 leading-relaxed">
                      {['Viaje registrado en base de datos', 'Póliza emitida de forma sincrónica', 'Si falla → reintentos exponenciales (hasta 3h)', 'estadoPoliza refleja el estado en tiempo real'].map((s, i) => (
                        <li key={i} className="flex gap-2"><span className="font-extrabold shrink-0">{i + 1}.</span>{s}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
              <ResponsePanel status={reqStatus} data={hasResponse ? response : null} />
            </div>
          )}

          {/* ══ FINALIZAR ══ */}
          {tab === 'finalizar' && (
            <div className="animate-in">
              <PageHeader title="Finalizar Viaje" subtitle="Cierra el viaje activo y marca la póliza como finalizada" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="card p-6">
                  <p className="section-title mb-4">{Ic.stop()} POST /api/viaje/finalizar</p>
                  <form onSubmit={handleFinalizar} className="space-y-4">
                    <div>
                      <label className="label">ID del Viaje (UUID) <span className="text-red-400">*</span></label>
                      <input className="input font-mono text-sm" value={idViaje}
                        onChange={e => setIdViaje(e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required />
                      <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                        {Ic.info('w-3 h-3')} Cópialo de la respuesta de "Iniciar Viaje" o de la tabla Viajes
                      </p>
                    </div>
                    <button type="submit" className="btn-danger w-full" disabled={reqStatus === 'loading'}>
                      {reqStatus === 'loading' ? <><Spinner size="sm" />Procesando…</> : <>{Ic.stop()} Finalizar Viaje</>}
                    </button>
                  </form>
                </div>
                <div className="alert-warn h-fit">
                  <p className="text-sm font-bold text-amber-800 flex items-center gap-2 mb-2">{Ic.warn()} Acción irreversible</p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Finalizar marca la póliza como <strong>FINALIZADA</strong> y elimina datos temporales.
                    Esta acción <strong>no puede deshacerse</strong>.
                  </p>
                </div>
              </div>
              <ResponsePanel status={reqStatus} data={hasResponse ? response : null} />
            </div>
          )}

          {/* ══ LISTAR ══ */}
          {tab === 'listar' && (
            <div className="animate-in">
              <PageHeader title="Viajes Activos" subtitle="Listado de viajes del cliente conectado"
                action={
                  <button onClick={handleListar} className="btn-primary" disabled={reqStatus === 'loading'}>
                    {reqStatus === 'loading' ? <><Spinner size="sm" />Cargando</> : <>{Ic.refresh()} Actualizar</>}
                  </button>
                }
              />

              {totalViajes > 0 && (
                <p className="text-xs text-slate-400 -mt-4 mb-4 font-medium">
                  Mostrando <strong className="text-slate-600">{viajes.length}</strong> de <strong className="text-slate-600">{totalViajes}</strong> viajes
                </p>
              )}

              {viajes.length > 0 ? (
                <div className="card overflow-hidden animate-in">
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>{['ID', 'Placa', 'Conductor', 'Estado', 'Póliza', 'Estado Póliza', 'PDF', 'Creado'].map(h => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {viajes.map(v => (
                          <tr key={v.id}>
                            <td><code className="text-[11px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">{v.id.substring(0, 8)}…</code></td>
                            <td><span className="font-mono font-extrabold text-slate-800">{v.numeroPlaca || '—'}</span></td>
                            <td><span className="text-slate-700 font-medium">{v.nombreConductor || '—'}</span></td>
                            <td><span className="badge badge-blue">{v.estado}</span></td>
                            <td><code className="text-[11px] font-mono text-slate-500">{v.cnpoliza || '—'}</code></td>
                            <td><span className={POLIZA_BADGE[v.estadoPoliza ?? ''] ?? 'badge badge-gray'}>{v.estadoPoliza || '—'}</span></td>
                            <td>
                              {v.urlPolizaPDF
                                ? <a href={v.urlPolizaPDF} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800 font-semibold text-xs underline underline-offset-2 transition-colors">
                                    {Ic.link()} Ver PDF
                                  </a>
                                : <span className="text-slate-200">—</span>}
                            </td>
                            <td className="text-xs text-slate-400 whitespace-nowrap font-medium">
                              {new Date(v.creadoEn).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : reqStatus !== 'loading' ? (
                <EmptyState icon={Ic.rows('w-6 h-6')} title="No hay viajes activos" sub='Haz clic en "Actualizar" para consultar el servidor' />
              ) : null}
            </div>
          )}

          {/* ══ MONITOR ══ */}
          {tab === 'monitor' && (
            <div className="animate-in">
              <PageHeader title="Monitor de Pólizas" subtitle="Supervisión en tiempo real de pólizas pendientes o con error"
                action={
                  <button onClick={loadMonitor} className="btn-secondary" disabled={monitorLoading}>
                    {monitorLoading ? <><Spinner size="sm" />Actualizando</> : <>{Ic.refresh()} Actualizar</>}
                  </button>
                }
              />

              {monitorLoading && !monitorData ? (
                <div className="card p-16 flex items-center justify-center gap-3 text-slate-400">
                  <Spinner size="lg" /><span className="text-sm font-medium">Cargando monitor…</span>
                </div>
              ) : monitorData ? (() => {
                const d = monitorData as any;
                return (
                  <div className="space-y-5 stagger">
                    {/* Status banner */}
                    <div className={`rounded-[var(--radius)] border p-5 flex items-center gap-4 ${d.alerta ? 'border-red-200/70 bg-red-50/60' : 'border-emerald-200/70 bg-emerald-50/60'}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${d.alerta ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        {d.alerta ? Ic.warn('w-5 h-5') : Ic.check('w-5 h-5')}
                      </div>
                      <div>
                        <p className={`font-bold text-sm ${d.alerta ? 'text-red-800' : 'text-emerald-800'}`}>{d.mensaje}</p>
                        {d.alerta && <p className="text-xs text-red-600 mt-0.5">El sistema está reintentando automáticamente.</p>}
                      </div>
                    </div>

                    {/* KPI row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Total pendientes', val: d.resumen?.total    ?? 0, color: d.resumen?.total > 0 ? 'text-red-600' : 'text-emerald-600' },
                        { label: 'Críticos',          val: d.resumen?.criticos ?? 0, color: 'text-red-500' },
                        { label: 'Con error',         val: d.resumen?.errores  ?? 0, color: 'text-amber-600' },
                        { label: 'Atascados',         val: d.resumen?.atascados ?? 0, color: 'text-slate-500' },
                      ].map(s => (
                        <div key={s.label} className="stat-card">
                          <span className={`stat-value ${s.color}`}>{s.val}</span>
                          <span className="stat-label">{s.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Detail table */}
                    {d.viajes?.length > 0 && (
                      <div className="card overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-slate-50 bg-[#fafbfd] flex items-center justify-between">
                          <p className="section-title">Viajes que requieren atención</p>
                          <span className="badge badge-red">{d.viajes.length} pendientes</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="data-table">
                            <thead><tr>{['ID', 'Placa', 'Estado', 'Intentos', 'Último intento', 'Error'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                            <tbody>
                              {d.viajes.map((v: any) => (
                                <tr key={v.id}>
                                  <td><code className="text-[11px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">{v.id?.substring(0, 8)}…</code></td>
                                  <td><span className="font-mono font-extrabold text-slate-800">{v.numeroPlaca || '—'}</span></td>
                                  <td><span className={POLIZA_BADGE[v.estadoPoliza ?? ''] ?? 'badge badge-gray'}>{v.estadoPoliza}</span></td>
                                  <td><span className="font-bold text-slate-600 tabular-nums">{v.polizaIntentos ?? 0}</span></td>
                                  <td className="text-xs text-slate-400 whitespace-nowrap font-medium">
                                    {v.polizaUltimoIntento ? new Date(v.polizaUltimoIntento).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                                  </td>
                                  <td className="text-xs text-red-500 max-w-xs truncate font-medium">{v.polizaError || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })() : (
                <EmptyState icon={Ic.pulse('w-6 h-6')} title="Sin datos" sub="Haz clic en Actualizar para cargar el monitor" />
              )}
            </div>
          )}

        </main>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 bg-white/80 backdrop-blur-sm">
        <div className="max-w-screen-2xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
            <div className="w-5 h-5 rounded-lg gradient-brand flex items-center justify-center shrink-0">
              {Ic.shield('w-3 h-3 text-white')}
            </div>
            <span className="font-bold text-slate-500">Ridery</span>
            <span className="text-slate-200">·</span>
            <span>Plataforma de Seguros Vehiculares</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-300 font-semibold">
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
