import { useCallback } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { publicoApi } from '../api';
import { PolizaVivoTab } from './FlotaPolizaVivoTab';

/**
 * Vista web pública de una póliza de flota: /poliza/<token>. Solo lectura y sin login.
 * Mismo cuadro que "Póliza en vivo"; se actualiza sola cuando entra un viaje o un pago.
 */
export function PolizaPublica({ token }: { token: string }) {
  const fetcher = useCallback(
    (q: { rev?: string; desde?: string; hasta?: string }) => publicoApi.poliza(token, q),
    [token],
  );
  const pushNotif = useCallback((tipo: string, titulo: string, msg: string) => {
    if (tipo === 'error') toast.error(`${titulo}: ${msg}`);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-right" />
      <header className="bg-[#0F1A5A] text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src="logo-isotipo-transparente.png" alt="" className="w-9 h-9 object-contain" />
          <div className="min-w-0">
            <p className="font-display font-bold leading-tight truncate">La Mundial de Seguros</p>
            <p className="text-[11px] opacity-80 leading-tight">Póliza de flota por uso · vista de solo lectura</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold bg-white/10 rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> En vivo
          </span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-5">
        <PolizaVivoTab pushNotif={pushNotif} fetcher={fetcher} />
      </main>
    </div>
  );
}

export default PolizaPublica;
