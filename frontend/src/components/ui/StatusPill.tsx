import React from 'react';
import type { ReqStatus } from '../../types';
import { Spinner } from './Spinner';
import { Ic } from './Icons';

export function StatusPill({ status }: { status: ReqStatus }) {
  if (status === 'idle') return null;
  const map = {
    loading: { cls: 'badge badge-yellow gap-1.5', content: <><Spinner size="sm" />Procesando</> },
    success: { cls: 'badge badge-green  gap-1',   content: <>{Ic.check('w-3 h-3')}Exitoso</> },
    error:   { cls: 'badge badge-red    gap-1',   content: <>{Ic.warn('w-3 h-3')}Error</> },
  };
  const s = map[status];
  return <span className={s.cls}>{s.content}</span>;
}
