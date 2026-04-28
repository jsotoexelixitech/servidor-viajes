import React, { useState, useCallback, useEffect, useRef, FormEvent } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import {
  authApi, setSessionToken, clearSession, viajeApi, tenantApi, adminApi,
  dashboardApi, conductorApi,
  Viaje, Conductor, DashboardKpis, KpisGlobales, RankingConductor, CarteraCliente,
  CAMPOS_SEGURO, SeguroConfig, FRECUENCIAS, CampoSeguro,
} from './api';
import { setDemoMode, isDemoMode, DEMO_INFO, buildDemoViajeBody } from './demo';
import { WelcomeSplash } from './WelcomeSplash';

type Tab = 'dashboard' | 'setup' | 'mapeo' | 'viaje' | 'finalizar' | 'listar' | 'monitor' | 'conductores' | 'cartera';
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
  users:    (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="5" r="2.5"/><path d="M1.5 13.5a4.5 4.5 0 0 1 9 0"/><circle cx="11.5" cy="6" r="2"/><path d="M11 10c1.7 0 3.2 1 3.5 3"/></svg>,
  cash:     (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><circle cx="8" cy="8" r="1.8"/><path d="M3.5 6v4M12.5 6v4"/></svg>,
  trend:    (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12 6 8l3 3 5-6"/><path d="M10 5h4v4"/></svg>,
  trophy:   (p?: string) => <svg className={p ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2.5h8v3a4 4 0 0 1-8 0z"/><path d="M4 4H2.5v1.5A2.5 2.5 0 0 0 5 8M12 4h1.5v1.5A2.5 2.5 0 0 1 11 8"/><path d="M6.5 9.5h3v3h-3z"/><path d="M5 13.5h6"/></svg>,
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
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 mb-4">
        {icon}
      </div>
      <p className="font-bold text-slate-600">{title}</p>
      {sub && <p className="text-sm text-slate-600 mt-1">{sub}</p>}
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
      'grid items-center gap-2 sm:gap-3 px-2.5 sm:px-3 py-2.5 rounded-xl border transition-all duration-150',
      'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_60px] sm:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_72px]',
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
        <p className="text-[11px] text-slate-600 truncate">{campo.descripcion}</p>
      </div>
      {/* arrow */}
      <span className="text-slate-200 font-bold text-center select-none hidden sm:block">←</span>
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
            className="shrink-0 w-5 h-5 flex items-center justify-center rounded-md text-slate-500 hover:text-red-400 hover:bg-red-50 transition-all">
            {Ic.close()}
          </button>
        )}
      </div>
      {/* type badge */}
      <span className={TIPO_BADGE[campo.tipo]}>{campo.tipo}</span>
    </div>
  );
}

// ─── Modal: Vista previa de Póliza (modo demo) ────────────────────────────────
function PolizaModal({ viaje, onClose }: { viaje: Viaje; onClose: () => void }) {
  const print = () => window.print();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const fechaEmision = new Date(viaje.creadoEn);
  const fechaVigencia = new Date(fechaEmision.getTime() + 365 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in poliza-modal-overlay"
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-3xl max-h-[96vh] sm:max-h-[92vh] overflow-hidden flex flex-col poliza-modal-content">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50 no-print">
          <div className="flex items-center gap-3">
            <span className="badge bg-amber-100 text-amber-800 ring-1 ring-amber-200">DEMO</span>
            <span className="text-sm font-bold text-slate-700">Vista previa · Póliza {viaje.cnpoliza}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={print} className="btn-secondary text-xs h-8 py-0 px-3">
              Imprimir / Guardar PDF
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-all">
              {Ic.close()}
            </button>
          </div>
        </div>

        {/* Documento */}
        <div className="overflow-y-auto p-5 sm:p-8 poliza-doc">
          <div className="flex items-start justify-between gap-3 border-b-4 border-brand-600 pb-4 sm:pb-5 mb-5 sm:mb-6">
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-xl font-extrabold text-brand-700 tracking-tight leading-tight">PÓLIZA DE RESPONSABILIDAD CIVIL VEHICULAR</h1>
              <p className="text-[11px] sm:text-xs text-slate-700 mt-1.5 font-medium">Plan RCV Básico · Ramo 18 · Cobertura Anual</p>
            </div>
            <div className="text-right shrink-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white ring-1 ring-slate-200 flex items-center justify-center ml-auto p-1"
                style={{ boxShadow: '0 3px 8px -1px rgb(15 26 90 / .15)' }}>
                <img src="/logo-isotipo-transparente.png" alt="La Mundial" className="w-full h-full object-contain" />
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5 font-bold uppercase tracking-wider hidden sm:block">Documento Oficial</p>
            </div>
          </div>

          {/* Datos generales */}
          <div className="grid grid-cols-2 gap-x-4 sm:gap-x-8 gap-y-3 mb-5 sm:mb-6 text-sm">
            <div>
              <p className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider mb-0.5">N° de Póliza</p>
              <p className="font-mono font-extrabold text-slate-900 text-base">{viaje.cnpoliza}</p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider mb-0.5">N° de Recibo</p>
              <p className="font-mono font-extrabold text-slate-900 text-base">{viaje.cnrecibo}</p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider mb-0.5">Fecha de Emisión</p>
              <p className="font-bold text-slate-900">{fmt(fechaEmision)}</p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider mb-0.5">Vigencia hasta</p>
              <p className="font-bold text-slate-900">{fmt(fechaVigencia)}</p>
            </div>
          </div>

          {/* Tomador / Conductor */}
          <div className="bg-slate-50 rounded-xl p-4 sm:p-5 mb-4 sm:mb-5 border border-slate-200">
            <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-3">Datos del Tomador</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
              <div>
                <p className="text-[11px] text-slate-700 font-semibold mb-0.5">Nombre completo</p>
                <p className="font-bold text-slate-900">{viaje.nombreConductor}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-slate-700 font-semibold mb-0.5">Tenant ID</p>
                <p className="font-mono text-xs text-slate-700 truncate">{viaje.tenantId}</p>
              </div>
            </div>
          </div>

          {/* Vehículo */}
          <div className="bg-slate-50 rounded-xl p-4 sm:p-5 mb-4 sm:mb-5 border border-slate-200">
            <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-3">Vehículo asegurado</p>
            <div className="grid grid-cols-3 gap-3 sm:gap-4 text-sm">
              <div>
                <p className="text-[11px] text-slate-700 font-semibold mb-0.5">Placa</p>
                <p className="font-mono font-extrabold text-slate-900">{viaje.numeroPlaca}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-700 font-semibold mb-0.5">Modelo</p>
                <p className="font-bold text-slate-900">{viaje.modeloVehiculo}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-700 font-semibold mb-0.5">Año</p>
                <p className="font-bold text-slate-900">{viaje.anioVehiculo}</p>
              </div>
            </div>
          </div>

          {/* Coberturas */}
          <div className="border border-slate-200 rounded-xl mb-5 overflow-hidden">
            <div className="bg-brand-50 px-5 py-2.5 border-b border-slate-200">
              <p className="text-[11px] font-extrabold text-brand-700 uppercase tracking-wider">Coberturas Incluidas</p>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {[
                  ['Daños a personas', 'Bs. 500.000,00'],
                  ['Daños a cosas', 'Bs. 500.000,00'],
                  ['Defensa Penal', 'Bs. 50.000,00'],
                  ['Asistencia en carretera', 'Incluido'],
                ].map(([label, val]) => (
                  <tr key={label} className="border-t border-slate-100 first:border-t-0">
                    <td className="px-5 py-2.5 text-slate-700">{label}</td>
                    <td className="px-5 py-2.5 text-right font-mono font-bold text-slate-900">{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Coordenadas del viaje */}
          <div className="border border-slate-200 rounded-xl p-4 mb-5 text-xs">
            <p className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider mb-2">Trayecto registrado</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <p className="text-slate-700 font-semibold mb-0.5">Origen</p>
                <p className="font-mono text-slate-800">{viaje.latInicio.toFixed(4)}, {viaje.lngInicio.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-slate-700 font-semibold mb-0.5">Destino</p>
                <p className="font-mono text-slate-800">{viaje.latDestino.toFixed(4)}, {viaje.lngDestino.toFixed(4)}</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-[10px] text-slate-700 mt-8 pt-5 border-t border-slate-200 leading-relaxed">
            <p className="font-bold text-slate-700">Documento generado por el Sistema Ridery Seguros · ExelixiTech</p>
            <p className="mt-1">Este es un documento de demostración generado automáticamente. No tiene validez legal.</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .poliza-doc, .poliza-doc * { visibility: visible; }
          .poliza-modal-overlay { position: static !important; background: white !important; backdrop-filter: none !important; padding: 0 !important; }
          .poliza-modal-content { box-shadow: none !important; border-radius: 0 !important; max-height: none !important; max-width: none !important; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [demoOn, setDemoOn] = useState(isDemoMode());

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

  // Modal de vista previa de póliza (modo demo)
  const [polizaPreview, setPolizaPreview] = useState<Viaje | null>(null);

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

  const toggleDemo = useCallback(async () => {
    const next = !demoOn;
    setDemoMode(next);
    setDemoOn(next);
    if (next) {
      try {
        const res = await authApi.login(DEMO_INFO.apiKey);
        setSessionToken(res.data.sessionToken);
        setApiKeySet(true);
        setApiKeyInput('');
        setApiKeyError('');
        setTenantNombreConectado(res.data.tenant.nombre);

        setTenantNombre(DEMO_INFO.setupNombre);
        setTenantWebhook(DEMO_INFO.setupWebhook);
        setTenantSecret(DEMO_INFO.setupSecret);
        setAdminKeyInput(DEMO_INFO.adminKey);

        setViajeRaw(JSON.stringify(buildDemoViajeBody(), null, 2));

        pushNotif('success', 'Modo Demo activado',
          'Cliente, configuración y 8 viajes precargados. Listo para presentar.');
      } catch {
        pushNotif('error', 'Modo Demo', 'No se pudo iniciar sesión simulada.');
      }
    } else {
      clearSession();
      setApiKeySet(false);
      setTenantNombreConectado('');
      setTenantNombre('');
      setTenantWebhook('');
      setTenantSecret('');
      setAdminKeyInput('');
      setViajeRaw('');
      setIdViaje('');
      setResponse(null);
      setReqStatus('idle');
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

  const handleIniciar = async (e: FormEvent) => {
    e.preventDefault();
    if (!viajeRaw.trim()) {
      setResponse({ error: 'El body JSON no puede estar vacío.' });
      setReqStatus('error');
      return;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(viajeRaw); }
    catch { setResponse({ error: 'JSON inválido. Verifica el formato.' }); setReqStatus('error'); return; }
    setReqStatus('loading'); setResponse(null);
    try {
      const r = await viajeApi.iniciar(parsed as Record<string, unknown>);
      setResponse(r.data);
      setReqStatus('success');
      if (r.data?.id) setIdViaje(r.data.id);
      if (demoOn) {
        pushNotif('success', 'Viaje iniciado',
          `Póliza ${r.data.cnpoliza ?? ''} emitida para placa ${r.data.numeroPlaca}`);
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

  const NAV_REQUIRES_KEY = new Set<Tab>(['mapeo', 'viaje', 'finalizar', 'listar', 'monitor', 'conductores']);
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

  const NAV: { id: Tab; label: string; icon: () => React.ReactNode; dot?: boolean; requiresKey?: boolean; section?: string }[] = [
    { id: 'dashboard',  label: 'Dashboard',     icon: () => Ic.grid() },
    { id: 'cartera',    label: 'Cartera',       icon: () => Ic.shield() },
    { id: 'setup',      label: 'Nuevo Cliente', icon: () => Ic.plus() },
    { id: 'mapeo',       label: 'Configuración', icon: () => Ic.gear(),  requiresKey: true },
    { id: 'conductores', label: 'Conductores',   icon: () => Ic.users(), requiresKey: true },
    { id: 'viaje',       label: 'Iniciar Viaje', icon: () => Ic.play(),  requiresKey: true },
    { id: 'finalizar',  label: 'Finalizar',     icon: () => Ic.stop(),  requiresKey: true },
    { id: 'listar',     label: 'Viajes',        icon: () => Ic.rows(),  requiresKey: true },
    { id: 'monitor',    label: 'Monitor',       icon: () => Ic.pulse(), dot: true, requiresKey: true },
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen flex flex-col bg-[#f4f6fb]">
      <WelcomeSplash />
      <Toaster position="top-right" toastOptions={{
        style: { fontSize: '12px', fontWeight: 600, borderRadius: '10px', maxWidth: '360px' },
        success: { style: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' } },
        error:   { style: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' } },
      }} />

      {polizaPreview && <PolizaModal viaje={polizaPreview} onClose={() => setPolizaPreview(null)} />}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="h-14 bg-white border-b border-slate-100 sticky top-0 z-40"
        style={{ boxShadow: '0 1px 0 #e2e8f0, 0 2px 8px -2px rgb(0 0 0/.04)' }}>
        <div className="h-full px-3 sm:px-4 flex items-center gap-2 sm:gap-4 max-w-screen-2xl mx-auto">

          {/* Sidebar toggle */}
          <button onClick={() => setSidebarOpen(s => !s)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-700 transition-all shrink-0"
            title={sidebarOpen ? 'Colapsar menú' : 'Expandir menú'}>
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              {sidebarOpen ? <><path d="M2 4h12M2 8h12M2 12h12"/></> : <><path d="M2 4h12M2 8h8M2 12h12"/></>}
            </svg>
          </button>

          {/* Brand — La Mundial de Seguros */}
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

          {/* API Key area */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 max-w-md">
            <div className="relative flex-1 min-w-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none hidden sm:block">
                {Ic.key('w-3.5 h-3.5')}
              </span>
              <input
                ref={apiKeyRef}
                type={apiKeyVis ? 'text' : 'password'}
                placeholder="API Key…"
                value={apiKeyInput}
                onChange={e => { setApiKeyInput(e.target.value); setApiKeyError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSetApiKey()}
                className="input pl-3 sm:pl-8 pr-8 h-8 text-xs rounded-lg w-full"
              />
              <button onClick={() => setApiKeyVis(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors">
                {Ic.eye('w-3.5 h-3.5')}
              </button>
            </div>
            <button onClick={handleSetApiKey} disabled={apiKeyLoading || !apiKeyInput.trim()}
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
                <span className="truncate">{tenantNombreConectado ? tenantNombreConectado : 'Conectado'}</span>
              </div>
            )}
          </div>

          {/* Demo toggle */}
          <button
            onClick={toggleDemo}
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

            {/* Campana de notificaciones */}
            <div className="relative">
              <button onClick={() => setNotifOpen(o => !o)}
                className="relative w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-600 hover:bg-slate-100 transition-colors">
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
                        className="text-[10px] text-slate-600 hover:text-red-500 transition-colors font-semibold">
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
                        n.tipo === 'warning' ? 'bg-amber-50/50' : 'bg-white'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${
                          n.tipo === 'success' ? 'bg-emerald-500' :
                          n.tipo === 'error'   ? 'bg-red-500' :
                          n.tipo === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
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

      {demoOn && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-[11px] sm:text-[11.5px] font-semibold px-3 sm:px-4 py-1.5 flex items-center justify-center gap-2 text-center flex-wrap">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <span className="hidden sm:inline">Modo Demo activo — los datos mostrados son simulados y no afectan el sistema real.</span>
          <span className="sm:hidden">Modo Demo activo — datos simulados.</span>
          <button onClick={toggleDemo} className="underline underline-offset-2 hover:text-amber-900 font-bold">
            Desactivar
          </button>
        </div>
      )}

      <div className="flex flex-1 max-w-screen-2xl mx-auto w-full">

        {/* ── Sidebar overlay (móvil) ──────────────────────────────────── */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 top-14 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden"
            aria-hidden
          />
        )}

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className={`fixed lg:static top-14 left-0 bottom-0 z-40 lg:z-auto bg-[#f4f6fb] shrink-0 transition-transform duration-200 ease-in-out lg:transition-all ${
          sidebarOpen ? 'translate-x-0 lg:w-52' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden'
        }`}>
          <div className="w-52 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto flex flex-col py-4 px-3 gap-0.5">

            <p className="text-[9.5px] font-extrabold text-slate-500 uppercase tracking-[0.14em] px-3 mb-2">
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
        <main className="flex-1 min-w-0 py-5 px-3 sm:py-7 sm:px-6">

          {/* ══ DASHBOARD ══ */}
          {tab === 'dashboard' && (
            <DashboardPanel
              apiKeySet={apiKeySet}
              tenantNombre={tenantNombreConectado}
              navTo={navTo}
            />
          )}

          {/* ══ CARTERA (admin) ══ */}
          {tab === 'cartera' && (
            <CarteraPanel adminKey={adminKeyInput} setAdminKey={setAdminKeyInput} />
          )}

          {/* ══ CONDUCTORES ══ */}
          {tab === 'conductores' && apiKeySet && (
            <ConductoresPanel pushNotif={pushNotif} />
          )}
          {tab === 'conductores' && !apiKeySet && (
            <div className="card p-10 text-center">
              <p className="text-sm font-bold text-slate-700 mb-2">Conecta tu API Key</p>
              <p className="text-xs text-slate-600">Esta sección requiere autenticación de cliente.</p>
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
                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-600"
                          onClick={() => setAdminKeyVis(v => !v)}>
                          {adminKeyVis ? Ic.eye('w-4 h-4') : Ic.eyeOff('w-4 h-4')}
                        </button>
                      </div>
                      <p className="text-xs text-slate-600 mt-1.5 flex items-center gap-1">
                        {Ic.info('w-3 h-3')} Valor de ADMIN_SECRET en el servidor
                      </p>
                    </div>
                    <div>
                      <label className="label">Nombre de la empresa <span className="text-red-400">*</span></label>
                      <input className="input" value={tenantNombre} onChange={e => setTenantNombre(e.target.value)}
                        placeholder="Ej: Taxis Express C.A." required />
                    </div>
                    <div>
                      <label className="label">Webhook URL <span className="text-slate-500 normal-case font-normal tracking-normal text-xs">— opcional</span></label>
                      <input className="input" type="url" value={tenantWebhook} onChange={e => setTenantWebhook(e.target.value)}
                        placeholder="https://tu-sistema.com/api/eventos" />
                      <p className="text-xs text-slate-600 mt-1.5 flex items-center gap-1">
                        {Ic.info('w-3 h-3')} Recibirás notificaciones automáticas de cada evento
                      </p>
                    </div>
                    <div>
                      <label className="label">Webhook Secret <span className="text-slate-500 normal-case font-normal tracking-normal text-xs">— opcional</span></label>
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
                <div className="card p-16 flex items-center justify-center gap-3 text-slate-600">
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
                    <p className="text-xs text-slate-600 -mt-2 mb-4 ml-7">
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
                            <span className={`text-[10px] font-extrabold ${grupoActivo === g ? 'text-brand-500' : 'text-slate-600'}`}>
                              {cnt}/{total}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Header row */}
                    <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_72px] gap-3 px-3 py-1 mb-1 text-[10px] font-extrabold text-slate-500 uppercase tracking-[0.1em]">
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
                    <p className="text-xs text-slate-600 -mt-2 mb-4 ml-7">
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
                                  className="w-5 h-5 flex items-center justify-center rounded-md text-slate-500 hover:text-red-400 hover:bg-red-50 transition-all shrink-0">
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
                        <p className="text-[11px] text-slate-600 mt-0.5">POST /api/viaje/iniciar · según tu mapeo actual</p>
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
                      <p className="text-xs text-slate-600 mt-1.5 flex items-center gap-1">
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
                <p className="text-xs text-slate-600 -mt-4 mb-4 font-medium">
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
                            <td><code className="text-[11px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md">{v.id.substring(0, 8)}…</code></td>
                            <td><span className="font-mono font-extrabold text-slate-800">{v.numeroPlaca || '—'}</span></td>
                            <td><span className="text-slate-700 font-medium">{v.nombreConductor || '—'}</span></td>
                            <td><span className="badge badge-blue">{v.estado}</span></td>
                            <td><code className="text-[11px] font-mono text-slate-500">{v.cnpoliza || '—'}</code></td>
                            <td><span className={POLIZA_BADGE[v.estadoPoliza ?? ''] ?? 'badge badge-gray'}>{v.estadoPoliza || '—'}</span></td>
                            <td>
                              {v.urlPolizaPDF
                                ? (demoOn
                                    ? <button onClick={() => setPolizaPreview(v)}
                                        className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800 font-semibold text-xs underline underline-offset-2 transition-colors">
                                        {Ic.link()} Ver PDF
                                      </button>
                                    : <a href={v.urlPolizaPDF} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800 font-semibold text-xs underline underline-offset-2 transition-colors">
                                        {Ic.link()} Ver PDF
                                      </a>
                                  )
                                : <span className="text-slate-200">—</span>}
                            </td>
                            <td className="text-xs text-slate-600 whitespace-nowrap font-medium">
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
                <div className="card p-16 flex items-center justify-center gap-3 text-slate-600">
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
                                  <td><code className="text-[11px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md">{v.id?.substring(0, 8)}…</code></td>
                                  <td><span className="font-mono font-extrabold text-slate-800">{v.numeroPlaca || '—'}</span></td>
                                  <td><span className={POLIZA_BADGE[v.estadoPoliza ?? ''] ?? 'badge badge-gray'}>{v.estadoPoliza}</span></td>
                                  <td><span className="font-bold text-slate-600 tabular-nums">{v.polizaIntentos ?? 0}</span></td>
                                  <td className="text-xs text-slate-600 whitespace-nowrap font-medium">
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
          <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
            <div className="w-5 h-5 rounded-lg gradient-brand flex items-center justify-center shrink-0">
              {Ic.shield('w-3 h-3 text-white')}
            </div>
            <span className="font-bold text-slate-500">Ridery</span>
            <span className="text-slate-200">·</span>
            <span>Plataforma de Seguros Vehiculares</span>
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

// ═════════════════════════════════════════════════════════════════════════════
//   DASHBOARD PANEL — KPIs por cliente, ranking de conductores, en curso
// ═════════════════════════════════════════════════════════════════════════════

const fmtBs = (n: number) =>
  new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtInt = (n: number) => new Intl.NumberFormat('es-VE').format(n);

function DashboardPanel({
  apiKeySet, tenantNombre, navTo,
}: {
  apiKeySet: boolean;
  tenantNombre: string;
  navTo: (t: Tab) => void;
}) {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [topPrima, setTopPrima] = useState<RankingConductor[]>([]);
  const [topViajes, setTopViajes] = useState<RankingConductor[]>([]);
  const [topComision, setTopComision] = useState<RankingConductor[]>([]);
  const [enCurso, setEnCurso] = useState<RankingConductor[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!apiKeySet) return;
    setLoading(true); setErr('');
    try {
      const [k, rp, rv, rc, ec] = await Promise.all([
        dashboardApi.kpis(),
        dashboardApi.ranking('prima', 5),
        dashboardApi.ranking('viajes', 5),
        dashboardApi.ranking('comision', 5),
        dashboardApi.enCurso(),
      ]);
      setKpis(k.data);
      setTopPrima(rp.data);
      setTopViajes(rv.data);
      setTopComision(rc.data);
      setEnCurso(ec.data);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'No se pudieron cargar los KPIs');
    } finally {
      setLoading(false);
    }
  }, [apiKeySet]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="animate-in-slow">
      <PageHeader
        title="Panel de Control"
        subtitle={apiKeySet
          ? `Gestión de cartera · ${tenantNombre || 'Cliente conectado'}`
          : 'Conecta tu API Key para ver los datos de tu cartera'}
        action={apiKeySet && (
          <button onClick={load}
            className="btn-secondary h-9 text-xs flex items-center gap-1.5 px-3"
            disabled={loading}>
            {loading ? <Spinner size="sm" /> : Ic.refresh()} Actualizar
          </button>
        )}
      />

      {!apiKeySet && (
        <div className="card p-10 text-center mb-6">
          <p className="text-sm font-bold text-slate-700 mb-1">No hay sesión activa</p>
          <p className="text-xs text-slate-600 mb-4">
            Conecta tu API Key en el header para ver los KPIs de tu cartera de viajes,
            comisiones y conductores.
          </p>
          <button onClick={() => navTo('setup')} className="btn-primary text-xs px-4 mx-auto inline-flex">
            {Ic.plus()} Crear nuevo cliente
          </button>
        </div>
      )}

      {err && (
        <div className="alert-error mb-5">
          <p className="text-xs font-bold text-red-700">{err}</p>
        </div>
      )}

      {apiKeySet && (
        <>
          {/* ─── KPIs principales ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 stagger">
            <KpiCard
              icon={Ic.rows('w-4 h-4 text-white')}
              gradient="gradient-brand"
              label="Viajes realizados"
              value={fmtInt(kpis?.totalViajes ?? 0)}
              sub={`${kpis?.viajesFinalizados ?? 0} finalizados`}
              loading={loading}
            />
            <KpiCard
              icon={Ic.pulse('w-4 h-4 text-white')}
              gradient="gradient-warm"
              label="Viajes activos"
              value={fmtInt(kpis?.viajesActivos ?? 0)}
              sub="en curso ahora"
              loading={loading}
            />
            <KpiCard
              icon={Ic.shield('w-4 h-4 text-white')}
              gradient="gradient-success"
              label="Pólizas activas"
              value={fmtInt(kpis?.polizasActivas ?? 0)}
              sub={`${kpis?.recibos ?? 0} recibos emitidos`}
              loading={loading}
            />
            <KpiCard
              icon={Ic.cash('w-4 h-4 text-white')}
              gradient="gradient-accent"
              label="Comisiones"
              value={`Bs ${fmtBs(kpis?.comisionTotal ?? 0)}`}
              sub={`Prima total: Bs ${fmtBs(kpis?.primaTotal ?? 0)}`}
              loading={loading}
            />
          </div>

          {/* ─── Conductores en curso ─────────────────────────────────── */}
          {enCurso.length > 0 && (
            <div className="card p-5 sm:p-6 mb-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="section-title flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Conductores en curso
                </p>
                <span className="badge badge-yellow">{enCurso.length} activos</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {enCurso.map(c => (
                  <div key={c.conductorId ?? c.nombre}
                    className="border border-slate-200 rounded-xl p-3 bg-gradient-to-br from-amber-50/40 to-white">
                    <div className="flex items-start gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 font-extrabold text-xs flex items-center justify-center shrink-0">
                        {iniciales(c.nombre)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 truncate">{c.nombre}</p>
                        <p className="text-[11px] text-slate-600 font-mono">{c.cedula}</p>
                      </div>
                      <span className="badge badge-yellow text-[10px]">{c.viajesActivos}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Rankings ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <RankingCard
              titulo="Top conductores por prima"
              icon={Ic.trend('w-4 h-4 text-white')}
              gradient="bg-gradient-to-br from-brand-700 to-brand-500"
              metricaLabel="Prima Bs"
              data={topPrima}
              metrica="prima"
              loading={loading}
            />
            <RankingCard
              titulo="Top conductores por viajes"
              icon={Ic.trophy('w-4 h-4 text-white')}
              gradient="bg-gradient-to-br from-amber-600 to-amber-400"
              metricaLabel="Viajes"
              data={topViajes}
              metrica="viajes"
              loading={loading}
            />
            <RankingCard
              titulo="Top conductores por comisión"
              icon={Ic.cash('w-4 h-4 text-white')}
              gradient="bg-gradient-to-br from-emerald-600 to-emerald-400"
              metricaLabel="Comisión Bs"
              data={topComision}
              metrica="comision"
              loading={loading}
            />
          </div>

          {/* ─── Métricas secundarias ─────────────────────────────────── */}
          <div className="card p-5 sm:p-6">
            <p className="section-title mb-4">Indicadores complementarios</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniStat label="Ticket promedio"   value={`Bs ${fmtBs(kpis?.ticketPromedio ?? 0)}`} />
              <MiniStat label="Prima en USD"      value={`$ ${fmtBs(kpis?.primaTotalExt ?? 0)}`} />
              <MiniStat label="Recibos emitidos"  value={fmtInt(kpis?.recibos ?? 0)} />
              <MiniStat label="% conversión"
                value={`${kpis && kpis.totalViajes > 0
                  ? Math.round((kpis.polizasActivas / kpis.totalViajes) * 100)
                  : 0} %`} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, gradient, label, value, sub, loading }: {
  icon: React.ReactNode; gradient: string; label: string; value: string; sub: string; loading: boolean;
}) {
  return (
    <div className={`relative overflow-hidden ${gradient} rounded-[var(--radius)] p-4 sm:p-5 text-white shadow-[0_6px_20px_-6px_rgba(15,26,90,.35)]`}>
      <div className="flex items-start justify-between">
        <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
          {icon}
        </div>
        {loading && <Spinner size="sm" color="white" />}
      </div>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] opacity-80 mt-3">{label}</p>
      <p className="text-2xl sm:text-[1.7rem] font-extrabold leading-tight mt-1 tabular-nums">{value}</p>
      <p className="text-[11px] opacity-70 mt-0.5 font-medium truncate">{sub}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
      <p className="stat-label">{label}</p>
      <p className="text-sm sm:text-base font-extrabold text-slate-800 tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function iniciales(nombre: string): string {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
}

function RankingCard({ titulo, icon, gradient, metricaLabel, data, metrica, loading }: {
  titulo: string;
  icon: React.ReactNode;
  gradient: string;
  metricaLabel: string;
  data: RankingConductor[];
  metrica: 'viajes' | 'prima' | 'comision';
  loading: boolean;
}) {
  const valor = (c: RankingConductor) =>
    metrica === 'viajes' ? fmtInt(c.totalViajes)
    : metrica === 'prima' ? fmtBs(c.primaGenerada)
    : fmtBs(c.comisionGenerada);
  const max = Math.max(
    1,
    ...data.map(c => metrica === 'viajes' ? c.totalViajes : metrica === 'prima' ? c.primaGenerada : c.comisionGenerada),
  );
  return (
    <div className="card p-4 sm:p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <p className="section-title text-[11px]">{titulo}</p>
        <div className={`w-7 h-7 rounded-lg ${gradient} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
      </div>
      {loading && data.length === 0 && (
        <div className="py-6 flex items-center justify-center text-slate-500"><Spinner /></div>
      )}
      {!loading && data.length === 0 && (
        <p className="text-xs text-slate-600 py-6 text-center">Aún no hay datos</p>
      )}
      <div className="space-y-2.5">
        {data.map((c, i) => {
          const val = metrica === 'viajes' ? c.totalViajes : metrica === 'prima' ? c.primaGenerada : c.comisionGenerada;
          const pct = (val / max) * 100;
          return (
            <div key={(c.conductorId ?? '') + i}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-extrabold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-xs font-bold text-slate-800 truncate">{c.nombre}</span>
                </div>
                <span className="text-[11px] font-extrabold tabular-nums text-slate-700 shrink-0">{valor(c)}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #2e6dbf, #0f1a5a)' }} />
              </div>
            </div>
          );
        })}
      </div>
      {data.length > 0 && (
        <p className="text-[10px] text-slate-500 mt-3 text-right">{metricaLabel}</p>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//   CONDUCTORES PANEL — CRUD de conductores del tenant
// ═════════════════════════════════════════════════════════════════════════════

function ConductoresPanel({ pushNotif }: { pushNotif: (tipo: Notif['tipo'], titulo: string, msg: string) => void }) {
  const [list, setList] = useState<Conductor[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Conductor | null>(null);
  const [form, setForm] = useState({
    nombre: '', apellido: '', cedula: '', telefono: '', email: '', porcentajeComision: 10,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await conductorApi.listar();
      setList(r.data);
    } catch {
      pushNotif('error', 'Error', 'No se pudieron cargar los conductores');
    } finally {
      setLoading(false);
    }
  }, [pushNotif]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setForm({ nombre: '', apellido: '', cedula: '', telefono: '', email: '', porcentajeComision: 10 });
    setEditing(null);
    setShowForm(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await conductorApi.actualizar(editing.id, form);
        pushNotif('success', 'Conductor actualizado', form.nombre);
      } else {
        await conductorApi.crear({ ...form, estado: 'ACTIVO' });
        pushNotif('success', 'Conductor creado', form.nombre);
      }
      resetForm();
      load();
    } catch (e: any) {
      pushNotif('error', 'Error', e?.response?.data?.message ?? 'No se pudo guardar');
    }
  };

  const startEdit = (c: Conductor) => {
    setEditing(c);
    setForm({
      nombre: c.nombre,
      apellido: c.apellido ?? '',
      cedula: c.cedula,
      telefono: c.telefono ?? '',
      email: c.email ?? '',
      porcentajeComision: c.porcentajeComision,
    });
    setShowForm(true);
  };

  const desactivar = async (c: Conductor) => {
    if (!confirm(`¿Desactivar al conductor ${c.nombre}?`)) return;
    try {
      await conductorApi.eliminar(c.id);
      pushNotif('info', 'Conductor desactivado', c.nombre);
      load();
    } catch {
      pushNotif('error', 'Error', 'No se pudo desactivar');
    }
  };

  return (
    <div className="animate-in">
      <PageHeader
        title="Conductores"
        subtitle="Gestiona los conductores que ejecutan los viajes y generan pólizas"
        action={
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="btn-primary h-9 text-xs px-3 flex items-center gap-1.5">
            {Ic.plus()} Nuevo conductor
          </button>
        }
      />

      {showForm && (
        <div className="card p-5 sm:p-6 mb-5">
          <p className="section-title mb-4">{editing ? 'Editar conductor' : 'Nuevo conductor'}</p>
          <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="label">Nombre *</label>
              <input className="input" value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })} required />
            </div>
            <div>
              <label className="label">Apellido</label>
              <input className="input" value={form.apellido}
                onChange={e => setForm({ ...form, apellido: e.target.value })} />
            </div>
            <div>
              <label className="label">Cédula / RIF *</label>
              <input className="input" value={form.cedula}
                onChange={e => setForm({ ...form, cedula: e.target.value })}
                placeholder="V12345678" required disabled={!!editing} />
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input className="input" value={form.telefono}
                onChange={e => setForm({ ...form, telefono: e.target.value })}
                placeholder="+58424…" />
            </div>
            <div>
              <label className="label">Correo</label>
              <input className="input" type="email" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">% Comisión</label>
              <input className="input" type="number" step="0.5" min="0" max="100"
                value={form.porcentajeComision}
                onChange={e => setForm({ ...form, porcentajeComision: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 flex gap-2 justify-end">
              <button type="button" onClick={resetForm} className="btn-secondary text-xs px-4">Cancelar</button>
              <button type="submit" className="btn-primary text-xs px-4">
                {editing ? 'Guardar cambios' : 'Crear conductor'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading && list.length === 0 ? (
          <div className="py-16 flex items-center justify-center"><Spinner size="lg" /></div>
        ) : list.length === 0 ? (
          <EmptyState icon={Ic.users('w-6 h-6')} title="Sin conductores"
            sub="Agrega el primer conductor de tu flota" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Conductor</th>
                  <th>Cédula</th>
                  <th className="hidden md:table-cell">Contacto</th>
                  <th>% Comisión</th>
                  <th>Estado</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {list.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 text-xs font-extrabold flex items-center justify-center shrink-0">
                          {iniciales(`${c.nombre} ${c.apellido ?? ''}`)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{c.nombre} {c.apellido}</p>
                          <p className="text-[11px] text-slate-600 truncate md:hidden">{c.email || c.telefono || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-xs">{c.cedula}</td>
                    <td className="hidden md:table-cell text-xs text-slate-700">
                      <div>{c.email || '—'}</div>
                      <div className="text-slate-500">{c.telefono || '—'}</div>
                    </td>
                    <td className="font-bold text-sm tabular-nums">{c.porcentajeComision} %</td>
                    <td>
                      <span className={
                        c.estado === 'ACTIVO' ? 'badge badge-green'
                        : c.estado === 'SUSPENDIDO' ? 'badge badge-yellow'
                        : 'badge badge-gray'
                      }>{c.estado}</span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => startEdit(c)}
                          className="text-xs text-brand-600 hover:text-brand-800 font-bold px-2 py-1">
                          Editar
                        </button>
                        {c.estado === 'ACTIVO' && (
                          <button onClick={() => desactivar(c)}
                            className="text-xs text-red-500 hover:text-red-700 font-bold px-2 py-1">
                            Desactivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//   CARTERA PANEL — vista admin: KPIs globales + lista de tenants/clientes
// ═════════════════════════════════════════════════════════════════════════════

function CarteraPanel({ adminKey, setAdminKey }: { adminKey: string; setAdminKey: (s: string) => void }) {
  const [global, setGlobal] = useState<KpisGlobales | null>(null);
  const [cartera, setCartera] = useState<CarteraCliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!adminKey.trim()) {
      setErr('Ingresa una Admin Key para ver la cartera global');
      return;
    }
    setLoading(true); setErr('');
    try {
      const [g, c] = await Promise.all([
        dashboardApi.global(adminKey),
        dashboardApi.cartera(adminKey),
      ]);
      setGlobal(g.data);
      setCartera(c.data);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Admin Key inválida o error de conexión');
      setGlobal(null);
      setCartera([]);
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  return (
    <div className="animate-in">
      <PageHeader
        title="Cartera de Clientes"
        subtitle="Visión consolidada de todos los clientes de la plataforma (vista administrativa)"
      />

      <div className="card p-4 sm:p-5 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="label">Admin Key</label>
            <input type="password" className="input"
              value={adminKey}
              onChange={e => setAdminKey(e.target.value)}
              placeholder="ADMIN_SECRET del servidor" />
          </div>
          <button onClick={load} className="btn-primary h-10 px-4 text-xs flex items-center gap-1.5"
            disabled={loading}>
            {loading ? <Spinner size="sm" /> : Ic.refresh()} Cargar cartera
          </button>
        </div>
        {err && <p className="text-xs font-bold text-red-600 mt-3">{err}</p>}
      </div>

      {global && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-5 stagger">
          <KpiCard
            icon={Ic.shield('w-4 h-4 text-white')}
            gradient="gradient-brand"
            label="Clientes activos"
            value={fmtInt(global.totalTenants)}
            sub={`${global.totalConductores} conductores`}
            loading={false}
          />
          <KpiCard
            icon={Ic.rows('w-4 h-4 text-white')}
            gradient="gradient-success"
            label="Viajes totales"
            value={fmtInt(global.totalViajes)}
            sub={`${global.viajesActivos} activos`}
            loading={false}
          />
          <KpiCard
            icon={Ic.shield('w-4 h-4 text-white')}
            gradient="gradient-warm"
            label="Pólizas activas"
            value={fmtInt(global.polizasActivas)}
            sub={`${global.recibos} recibos`}
            loading={false}
          />
          <KpiCard
            icon={Ic.cash('w-4 h-4 text-white')}
            gradient="gradient-accent"
            label="Prima global"
            value={`Bs ${fmtBs(global.primaTotal)}`}
            sub={`$ ${fmtBs(global.primaTotalExt)}`}
            loading={false}
          />
          <KpiCard
            icon={Ic.trend('w-4 h-4 text-white')}
            gradient="bg-gradient-to-br from-emerald-600 to-emerald-400"
            label="Comisiones"
            value={`Bs ${fmtBs(global.comisionTotal)}`}
            sub="generadas en total"
            loading={false}
          />
        </div>
      )}

      {cartera.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <p className="section-title">Detalle por cliente</p>
            <span className="badge badge-blue">{cartera.length} clientes</span>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="text-right">Viajes</th>
                  <th className="text-right hidden sm:table-cell">Activos</th>
                  <th className="text-right">Prima Bs</th>
                  <th className="text-right">Comisión Bs</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {cartera.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-700 to-brand-500 text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">
                          {iniciales(c.nombre)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{c.nombre}</p>
                          <p className="text-[10px] text-slate-500 font-mono truncate">{c.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-right font-bold tabular-nums">{fmtInt(c.totalViajes)}</td>
                    <td className="text-right tabular-nums hidden sm:table-cell">
                      {c.viajesActivos > 0
                        ? <span className="badge badge-yellow">{c.viajesActivos}</span>
                        : <span className="text-slate-400">0</span>}
                    </td>
                    <td className="text-right font-bold tabular-nums text-brand-700">{fmtBs(c.primaTotal)}</td>
                    <td className="text-right font-bold tabular-nums text-emerald-600">{fmtBs(c.comisionTotal)}</td>
                    <td>
                      <span className={c.activo ? 'badge badge-green' : 'badge badge-gray'}>
                        {c.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!global && !err && !loading && (
        <EmptyState
          icon={Ic.shield('w-6 h-6')}
          title="Carga la cartera"
          sub="Ingresa tu Admin Key arriba para ver los datos consolidados de todos los clientes"
        />
      )}
    </div>
  );
}
