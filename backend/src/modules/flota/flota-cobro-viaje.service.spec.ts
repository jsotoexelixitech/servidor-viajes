import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { calcularMontoDistancia, FlotaCobroViajeService, normalizarDoc } from './flota-cobro-viaje.service';
import { FlotaSis2000Client } from './flota-sis2000.client';
import { FlotaService } from './flota.service';

/** Repositorio en memoria (solo lo que usa el servicio). */
function fakeRepo<T extends Record<string, unknown>>() {
  const rows: T[] = [];
  const match = (r: T, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => r[k] === v);
  return {
    rows,
    create: (d: Partial<T>) => ({ ...d }) as T,
    findOne: async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => match(r, where)) ?? null,
    find: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => match(r, where)),
    save: async (e: T) => {
      if (!e.id) {
        if (e.idExterno && rows.some((r) => r.tenantId === e.tenantId && r.idExterno === e.idExterno)) {
          throw Object.assign(new Error('duplicate'), { code: '23505' });
        }
        Object.assign(e, { id: randomUUID(), creadoEn: new Date() });
        rows.push(e);
      }
      return e;
    },
  };
}

const T = 'tenant-1';
const POLIZA = '18-1-1130480881';
const TARIFAS = [
  { clasificacion: 'URBANO', nombre: 'Urbano', kmDesde: '0', kmHasta: '20', tarifaKm: '0.1', minimo: '0.5', redondeo: 'KM_ARRIBA', moneda: 'USD', activa: true },
  { clasificacion: 'EXTRA_URBANO', nombre: 'Extra urbano', kmDesde: '20', kmHasta: null, tarifaKm: '0.15', minimo: '3', redondeo: 'NINGUNO', moneda: 'USD', activa: true },
] as never[];

function setup(real = false) {
  const viajes = fakeRepo();
  const tarifas = fakeRepo();
  tarifas.rows.push(...(TARIFAS as Record<string, unknown>[]).map((t) => ({ ...t, tenantId: T })));
  const certs = fakeRepo();
  certs.rows.push({ id: 'c1', tenantId: T, cnpoliza: POLIZA, ccerti: 3, placa: 'AB123CD', conductorDocNorm: 'V12345678', activo: true });
  const pagos = fakeRepo();
  const flota = { getConfig: async () => ({ cnpoliza: POLIZA }) } as unknown as FlotaService;
  const crearReciboCertificado = jest.fn().mockResolvedValue({ cnrecibo: '18-998877', crecibo: '998877', yaExistia: false, data: { status: true } });
  const sis2000 = {
    reciboRealActivo: () => real,
    cusuario: () => 1,
    rutaRecibo: (p: string, c: number) => `/api/flota/polizas/${p}/certificados/${c}/recibos`,
    crearReciboCertificado,
  } as unknown as FlotaSis2000Client;
  // tarifaRepo.find con order: el fake ignora el orden (ya vienen ordenadas).
  const svc = new FlotaCobroViajeService(viajes as never, tarifas as never, certs as never, pagos as never, flota, sis2000);
  return { svc, viajes, pagos, crearReciboCertificado };
}

describe('calcularMontoDistancia', () => {
  it('clasifica por rango de km y redondea el km iniciado', () => {
    const r = calcularMontoDistancia(TARIFAS, 9.1);
    expect(r.clasificacion).toBe('URBANO');
    expect(r.kmCobrados).toBe(10);
    expect(r.monto).toBe(1);
  });
  it('aplica el mínimo', () => {
    expect(calcularMontoDistancia(TARIFAS, 1.2).monto).toBe(0.5);
  });
  it('extra urbano desde 20 km', () => {
    const r = calcularMontoDistancia(TARIFAS, 30);
    expect(r.clasificacion).toBe('EXTRA_URBANO');
    expect(r.monto).toBe(4.5);
  });
  it('respeta la clasificación enviada por la plataforma', () => {
    expect(calcularMontoDistancia(TARIFAS, 5, 'EXTRA_URBANO').monto).toBe(3);
  });
  it('error si ningún rango cubre los km', () => {
    expect(() => calcularMontoDistancia([TARIFAS[0]], 50)).toThrow(UnprocessableEntityException);
  });
});

describe('normalizarDoc', () => {
  it('quita guiones, puntos y espacios', () => {
    expect(normalizarDoc('v-12.345.678 ')).toBe('V12345678');
    expect(normalizarDoc('')).toBeNull();
  });
});

describe('FlotaCobroViajeService', () => {
  const inicio = { idViaje: 'RDY-1', tipo: 'INICIO' as const, fecha: '2026-11-01T14:00:00Z', placa: 'xx999', conductorDoc: 'V-12.345.678', kmEstimados: 8 };
  const fin = { idViaje: 'RDY-1', tipo: 'FIN' as const, fecha: '2026-11-01T14:30:00Z', km: 9.1 };

  it('INICIO ubica el certificado por cédula y devuelve el estimado; es idempotente', async () => {
    const { svc, viajes } = setup();
    const r1 = await svc.evento(T, inicio);
    expect(r1.certificado).toEqual({ cnpoliza: POLIZA, ccerti: 3 });
    expect(r1.montoEstimado).toBe(0.8);
    const r2 = await svc.evento(T, inicio);
    expect(r2.duplicado).toBe(true);
    expect(viajes.rows).toHaveLength(1);
  });

  it('FIN devuelve el monto por km y deja el pago PENDIENTE', async () => {
    const { svc } = setup();
    await svc.evento(T, inicio);
    const r = await svc.evento(T, fin);
    expect(r).toMatchObject({ estado: 'FINALIZADO', clasificacion: 'URBANO', monto: 1, estadoPago: 'PENDIENTE', minutos: 30 });
    expect((await svc.evento(T, fin)).duplicado).toBe(true);
  });

  it('pago con monto distinto → 422', async () => {
    const { svc } = setup();
    await svc.evento(T, inicio);
    await svc.evento(T, fin);
    await expect(svc.pagar(T, { idViaje: 'RDY-1', monto: 2, referencia: 'P1' })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('pago genera recibo SIMULADO sobre el certificado; repetido devuelve lo mismo; otra referencia → 409', async () => {
    const { svc, crearReciboCertificado } = setup(false);
    await svc.evento(T, inicio);
    await svc.evento(T, fin);
    const p = await svc.pagar(T, { idViaje: 'RDY-1', monto: 1, referencia: 'P1' });
    expect(p.pago.recibo).toMatchObject({ estado: 'RECIBO_SIMULADO', modo: 'SIMULADO', cnpoliza: POLIZA, ccerti: 3 });
    expect(crearReciboCertificado).not.toHaveBeenCalled();
    expect((await svc.pagar(T, { idViaje: 'RDY-1', monto: 1, referencia: 'P1' })).duplicado).toBe(true);
    await expect(svc.pagar(T, { idViaje: 'RDY-1', monto: 1, referencia: 'P2' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('pago REAL llama a nest-api con el certificado del conductor', async () => {
    const { svc, crearReciboCertificado } = setup(true);
    await svc.evento(T, inicio);
    await svc.evento(T, fin);
    const p = await svc.pagar(T, { idViaje: 'RDY-1', monto: 1, moneda: 'USD', referencia: 'P1' });
    expect(crearReciboCertificado).toHaveBeenCalledWith(expect.objectContaining({
      cnpoliza: POLIZA, ccerti: 3, mprima: 1, cmoneda: '$', fdesde: '2026-11-01', fhasta: '2026-11-01', creferencia: 'VIAJE:RDY-1',
    }));
    expect(p.pago.recibo).toMatchObject({ estado: 'RECIBO_GENERADO', cnrecibo: '18-998877' });
  });

  it('sin certificado el pago se registra y el recibo queda en ERROR', async () => {
    const { svc } = setup();
    await svc.evento(T, { ...inicio, idViaje: 'RDY-2', conductorDoc: 'V-1', placa: 'ZZ000ZZ' });
    await svc.evento(T, { ...fin, idViaje: 'RDY-2' });
    const p = await svc.pagar(T, { idViaje: 'RDY-2', monto: 1, referencia: 'P9' });
    expect(p.estadoPago).toBe('PAGADO');
    expect(p.pago.recibo.estado).toBe('ERROR');
  });

  it('no se paga un viaje en curso ni se cancela uno finalizado', async () => {
    const { svc } = setup();
    await svc.evento(T, inicio);
    await expect(svc.pagar(T, { idViaje: 'RDY-1', monto: 1, referencia: 'P1' })).rejects.toBeInstanceOf(ConflictException);
    await svc.evento(T, fin);
    await expect(svc.evento(T, { idViaje: 'RDY-1', tipo: 'CANCELACION' })).rejects.toBeInstanceOf(ConflictException);
  });
});
