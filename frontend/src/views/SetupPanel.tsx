import React, { FormEvent } from 'react';
import type { ReqStatus } from '../types';
import { authApi, setSessionToken } from '../api';
import { Ic } from '../components/ui/Icons';
import { Spinner } from '../components/ui/Spinner';
import { PageHeader } from '../components/ui/PageHeader';
import { CopyButton } from '../components/ui/CopyButton';
import { ResponsePanel } from '../components/ui/ResponsePanel';

export interface SetupPanelProps {
  adminKeyInput: string;
  setAdminKeyInput: (v: string) => void;
  adminKeyVis: boolean;
  setAdminKeyVis: (v: boolean) => void;
  tenantNombre: string;
  setTenantNombre: (v: string) => void;
  tenantWebhook: string;
  setTenantWebhook: (v: string) => void;
  tenantSecret: string;
  setTenantSecret: (v: string) => void;
  reqStatus: ReqStatus;
  response: unknown;
  hasResponse: boolean;
  handleCrearTenant: (e: FormEvent) => void;
  // for auto-connect after creation
  setApiKeyInput: (v: string) => void;
  setApiKeyLoading: (v: boolean) => void;
  setApiKeyError: (v: string) => void;
  setApiKeySet: (v: boolean) => void;
  setTenantNombreConectado: (v: string) => void;
  pushNotif: (tipo: 'success' | 'error' | 'info' | 'warning', titulo: string, msg: string) => void;
}

export function SetupPanel({
  adminKeyInput, setAdminKeyInput, adminKeyVis, setAdminKeyVis,
  tenantNombre, setTenantNombre, tenantWebhook, setTenantWebhook,
  tenantSecret, setTenantSecret,
  reqStatus, response, hasResponse, handleCrearTenant,
  setApiKeyInput, setApiKeyLoading, setApiKeyError, setApiKeySet, setTenantNombreConectado,
  pushNotif,
}: SetupPanelProps) {
  const createdKey = hasResponse && reqStatus === 'success' ? (response as Record<string, unknown>)?.apiKey as string | undefined : undefined;

  const autoConnect = async () => {
    if (!createdKey) return;
    setApiKeyInput(createdKey);
    setApiKeyLoading(true);
    setApiKeyError('');
    try {
      const res = await authApi.login(createdKey);
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
  };

  return (
    <div className="animate-in">
      <PageHeader title="Nuevo Cliente" subtitle="Registra una empresa y obtén su API Key de acceso" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        <div className="lg:col-span-3 card p-6">
          <p className="section-title mb-5 flex items-center gap-1.5">{Ic.plus()} Datos del cliente</p>
          <form onSubmit={handleCrearTenant} className="space-y-4">
            <div>
              <label className="label">Admin Key <span className="text-red-400">*</span></label>
              <div className="relative">
                <input className="input pr-10" type={adminKeyVis ? 'text' : 'password'}
                  value={adminKeyInput} onChange={e => setAdminKeyInput(e.target.value)}
                  placeholder="Clave de administración del servidor" required />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-600"
                  onClick={() => setAdminKeyVis(!adminKeyVis)}>
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

          {createdKey && (
            <div className="alert-success animate-in">
              <p className="text-sm font-bold text-emerald-800 mb-1 flex items-center gap-1.5">
                {Ic.check('w-4 h-4')} Cliente creado exitosamente
              </p>
              <p className="text-xs text-emerald-700 mb-3">Copia tu API Key antes de salir:</p>
              <div className="bg-white rounded-xl p-3 border border-emerald-200 flex items-start gap-2">
                <code className="flex-1 break-all text-xs font-mono text-slate-700 leading-relaxed">{createdKey}</code>
                <CopyButton text={createdKey} compact />
              </div>
              <button className="mt-3 btn-primary w-full text-xs" onClick={autoConnect}>
                {Ic.key()} Usar esta API Key ahora
              </button>
            </div>
          )}

          {hasResponse && reqStatus === 'error' && <ResponsePanel status={reqStatus} data={response} />}
        </div>
      </div>
    </div>
  );
}
