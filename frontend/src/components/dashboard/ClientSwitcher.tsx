import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { CarteraCliente } from '../../api';
import { dashboardApi } from '../../api';
import { Ic } from '../ui/Icons';
import { Spinner } from '../ui/Spinner';
import { fmtBs, fmtInt, iniciales } from '../../utils/formatters';

type SortMode = 'nombre' | 'viajes' | 'prima' | 'comision' | 'recientes';
type FiltroEstado = 'todos' | 'activos' | 'inactivos';

const RECENT_KEY = 'lm_recent_clients_v1';

function loadRecentIds(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); }
  catch { return []; }
}

function pushRecentId(id: string) {
  try {
    const cur = loadRecentIds().filter(x => x !== id);
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...cur].slice(0, 5)));
  } catch { /* noop */ }
}

export function ClientSwitcher({
  adminKey, currentName, isDrillDown,
  open, onOpenChange,
  onSelect, onClearSelection, onCreateNew,
}: {
  adminKey: string;
  currentName: string;
  isDrillDown: boolean;
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onSelect: (c: { id: string; nombre: string }) => void;
  onClearSelection: () => void;
  onCreateNew: () => void;
}) {
  const [list, setList] = useState<CarteraCliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [filtro, setFiltro] = useState<FiltroEstado>('todos');
  const [sort, setSort] = useState<SortMode>('recientes');
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecentIds());
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!adminKey.trim()) return;
    setLoading(true); setErr('');
    try {
      const r = await dashboardApi.cartera(adminKey);
      setList(r.data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setErr(err?.response?.data?.message ?? 'No se pudo cargar la cartera');
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    if (open) {
      load();
      setTimeout(() => inputRef.current?.focus(), 30);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open, load]);

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    let arr = list;
    if (filtro === 'activos')   arr = arr.filter(c => c.activo);
    if (filtro === 'inactivos') arr = arr.filter(c => !c.activo);
    if (q) arr = arr.filter(c => c.nombre.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    if (sort === 'recientes') {
      const idx = (id: string) => { const i = recentIds.indexOf(id); return i === -1 ? 999 : i; };
      arr = [...arr].sort((a, b) => idx(a.id) - idx(b.id));
    } else if (sort === 'viajes')   arr = [...arr].sort((a, b) => b.totalViajes - a.totalViajes);
    else if (sort === 'prima')      arr = [...arr].sort((a, b) => b.primaTotal - a.primaTotal);
    else if (sort === 'comision')   arr = [...arr].sort((a, b) => b.comisionTotal - a.comisionTotal);
    else arr = [...arr].sort((a, b) => a.nombre.localeCompare(b.nombre));
    return arr;
  })();

  useEffect(() => { setHighlight(0); }, [query, filtro, sort]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
      if (e.key === 'Enter') { const c = filtered[highlight]; if (c) pickClient(c); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, highlight, filtered]);

  const pickClient = (c: CarteraCliente) => {
    pushRecentId(c.id);
    setRecentIds(loadRecentIds());
    onSelect({ id: c.id, nombre: c.nombre });
    onOpenChange(false);
    setQuery('');
  };

  return (
    <>
      <button
        onClick={() => onOpenChange(true)}
        className="group inline-flex items-center gap-2 pl-1 pr-2 py-1 -my-0.5 rounded-lg
          bg-white ring-1 ring-slate-200 hover:ring-brand-400 hover:bg-brand-50/40
          shadow-[0_1px_2px_rgba(15,26,90,.06)] hover:shadow-[0_4px_10px_-2px_rgba(15,26,90,.12)]
          transition-all duration-150"
        title="Cambiar cliente · Ctrl+K"
      >
        <span className="w-6 h-6 rounded-md bg-gradient-to-br from-brand-700 to-brand-500 text-white text-[9px] font-extrabold flex items-center justify-center shrink-0">
          {iniciales(currentName)}
        </span>
        <span className="font-extrabold text-slate-800 truncate max-w-[260px] text-[13px] leading-none">{currentName}</span>
        {isDrillDown && <span className="badge badge-yellow text-[9px] px-1.5 py-0">drill-down</span>}
        <span className="w-4 h-4 rounded bg-slate-100 group-hover:bg-brand-100 text-slate-500 group-hover:text-brand-700 transition-colors flex items-center justify-center">
          {Ic.chevron('w-2.5 h-2.5 rotate-90')}
        </span>
        <kbd className="hidden md:inline-flex ml-0.5 text-[9px] font-mono font-bold text-slate-500 bg-slate-50 ring-1 ring-inset ring-slate-200 px-1 py-0 rounded">⌘K</kbd>
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-3 sm:px-4"
          style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => onOpenChange(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden flex flex-col max-h-[80vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 px-4 py-3 flex items-center gap-2">
              <span className="text-slate-400">{Ic.users('w-4 h-4')}</span>
              <input ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar cliente por nombre o id…"
                className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-800 placeholder-slate-400" />
              <button onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded">
                <kbd className="text-[10px] font-mono font-bold bg-slate-100 ring-1 ring-inset ring-slate-200 px-1.5 py-0.5 rounded">ESC</kbd>
              </button>
            </div>

            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-wrap text-[11px]">
              <div className="flex items-center gap-1">
                {(['todos', 'activos', 'inactivos'] as FiltroEstado[]).map(f => (
                  <button key={f} onClick={() => setFiltro(f)}
                    className={`px-2.5 py-1 rounded-md font-bold transition-colors capitalize ${
                      filtro === f ? 'bg-brand-700 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}>
                    {f}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-slate-500 font-bold">Ordenar:</span>
                <select value={sort} onChange={e => setSort(e.target.value as SortMode)}
                  className="text-[11px] bg-slate-50 border border-slate-200 rounded-md px-2 py-1 font-bold text-slate-700 outline-none focus:border-brand-500">
                  <option value="recientes">Recientes</option>
                  <option value="nombre">A → Z</option>
                  <option value="viajes">Más viajes</option>
                  <option value="prima">Más prima</option>
                  <option value="comision">Más comisión</option>
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading && <div className="py-12 flex items-center justify-center"><Spinner /></div>}
              {err && <div className="px-4 py-6 text-center"><p className="text-xs font-bold text-red-600">{err}</p></div>}
              {!loading && !err && filtered.length === 0 && (
                <div className="px-4 py-12 text-center">
                  <p className="text-sm font-bold text-slate-700">Sin resultados</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {list.length === 0
                      ? 'No hay clientes en la cartera. Crea el primero abajo.'
                      : 'Ningún cliente coincide con los filtros aplicados.'}
                  </p>
                </div>
              )}
              {!loading && filtered.map((c, i) => {
                const isCurrent = c.nombre === currentName;
                const isHighlight = i === highlight;
                return (
                  <button key={c.id}
                    onClick={() => pickClient(c)}
                    onMouseEnter={() => setHighlight(i)}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors border-l-2 ${
                      isHighlight ? 'bg-brand-50/70 border-brand-500' : 'border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-extrabold shrink-0 ${
                      c.activo ? 'bg-gradient-to-br from-brand-700 to-brand-500 text-white' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {iniciales(c.nombre)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-800 truncate">{c.nombre}</p>
                        {isCurrent && <span className="badge badge-blue text-[9px] px-1.5 py-0">actual</span>}
                        {!c.activo && <span className="badge badge-gray text-[9px] px-1.5 py-0">inactivo</span>}
                      </div>
                      <p className="text-[10.5px] text-slate-500 font-mono truncate mt-0.5">{c.id}</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-600 shrink-0">
                      <div className="text-right">
                        <p className="font-extrabold tabular-nums text-slate-800">{fmtInt(c.totalViajes)}</p>
                        <p className="text-[9px] uppercase tracking-wide text-slate-500 font-bold">viajes</p>
                      </div>
                      <div className="text-right">
                        <p className="font-extrabold tabular-nums text-amber-600">{c.viajesActivos}</p>
                        <p className="text-[9px] uppercase tracking-wide text-slate-500 font-bold">activos</p>
                      </div>
                      <div className="text-right">
                        <p className="font-extrabold tabular-nums text-emerald-600">Bs {fmtBs(c.comisionTotal)}</p>
                        <p className="text-[9px] uppercase tracking-wide text-slate-500 font-bold">comisión</p>
                      </div>
                    </div>
                    {isHighlight && (
                      <span className="hidden md:inline-flex text-slate-400 ml-1">
                        <kbd className="text-[9px] font-mono font-bold bg-white ring-1 ring-inset ring-slate-200 px-1 py-0 rounded">↵</kbd>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between gap-2 text-[11px] bg-slate-50/60">
              <div className="flex items-center gap-3 text-slate-500 font-medium">
                <span><kbd className="font-mono font-bold bg-white ring-1 ring-inset ring-slate-200 px-1 py-0 rounded text-[9px]">↑↓</kbd> navegar</span>
                <span><kbd className="font-mono font-bold bg-white ring-1 ring-inset ring-slate-200 px-1 py-0 rounded text-[9px]">↵</kbd> seleccionar</span>
                <span className="hidden sm:inline"><kbd className="font-mono font-bold bg-white ring-1 ring-inset ring-slate-200 px-1 py-0 rounded text-[9px]">ESC</kbd> cerrar</span>
              </div>
              <div className="flex items-center gap-2">
                {isDrillDown && (
                  <button onClick={() => { onClearSelection(); onOpenChange(false); }}
                    className="text-[11px] font-bold text-slate-600 hover:text-slate-800 px-2 py-1">
                    Salir de drill-down
                  </button>
                )}
                <button onClick={() => { onCreateNew(); onOpenChange(false); }}
                  className="text-[11px] font-bold text-brand-700 hover:text-brand-900 flex items-center gap-1 px-2 py-1">
                  {Ic.plus('w-3 h-3')} Nuevo cliente
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
