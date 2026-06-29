import React, { useState, useCallback, useEffect, FormEvent } from 'react';
import type { Notif } from '../types';
import { conductorApi, Conductor } from '../api';
import { Ic } from '../components/ui/Icons';
import { Spinner } from '../components/ui/Spinner';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { iniciales } from '../utils/formatters';

export function ConductoresPanel({
  pushNotif,
}: {
  pushNotif: (tipo: Notif['tipo'], titulo: string, msg: string) => void;
}) {
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
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      pushNotif('error', 'Error', err?.response?.data?.message ?? 'No se pudo guardar');
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
                onChange={e => setForm({ ...form, telefono: e.target.value })} placeholder="+58424…" />
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
