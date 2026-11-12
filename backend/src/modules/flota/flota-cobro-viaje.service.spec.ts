import { BadRequestException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { calcularMontoDistancia, FlotaCobroViajeService, normalizarDoc } from './flota-cobro-viaje.service';
import { FlotaSis2000Client } from './flota-sis2000.client';
import { FlotaService } from './flota.service';
import { FlotaRecibosService } from './flota-recibos.service';
import { MSG_PASAJEROS_OBLIGATORIO } from './dto/pasajero.dto';

/** Repositorio en memoria (solo lo que usa el servicio). */
function fakeRepo<T extends Record<string, unknown>>() {
  const rows: T[] = [];
  const match = (r: T, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => r[k] === v);
  return {
    rows,
    create: (d: Partial<T>) => ({ ...d }) as T,
    findOne: async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => match(r, where)) ?? null,
    find: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => match(r, where)),
    maximum: async (col: string, where: Record<string, unknown>) => {
      const v = rows.filter((r) => match(r, where)).map((r) => Number(r[col]));
      return v.length ? Math.max(...v) : null;
    },
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
  const incluirCertificado = jest.fn().mockResolvedValue({ ccerti: 41, data: { status: true } });
  const excluirCertificado = jest.fn().mockResolvedValue({ status: true });
  const sis2000 = {
    reciboRealActivo: () => real,
    cusuario: () => 1,
    rutaRecibo: (p: string, c: number) => `/api/flota/polizas/${p}/certificados/${c}/recibos`,
    crearReciboCertificado,
    incluirCertificado,
    excluirCertificado,
  } as unknown as FlotaSis2000Client;
  // tarifaRepo.find con order: el fake ignora el orden (ya vienen ordenadas).
  const recibosRepo = fakeRepo();
  const recibos = new FlotaRecibosService(recibosRepo as never, fakeRepo() as never, certs as never, flota, sis2000, { get: () => undefined } as never);
  const svc = new FlotaCobroViajeService(viajes as never, tarifas as never, certs as never, pagos as never, flota, sis2000, recibos);
  return { svc, viajes, pagos, certs, crearReciboCertificado, incluirCertificado, excluirCertificado, recibosRepo, recibos };
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

const PASAJEROS = [
  { tipoDoc: 'V' as const, documento: 'V-12.345.678', nombres: ' María ', apellidos: 'Pérez', telefono: '+58 (414) 123-4567', correo: 'Maria.Perez@Correo.com', esConductor: true },
  { tipoDoc: 'P' as const, documento: 'ab-123456', nombres: 'John', apellidos: 'Smith', telefono: '04141234567', correo: 'john@correo.com', fechaNacimiento: '1990-05-17' },
];

describe('FlotaCobroViajeService', () => {
  const inicio = { idViaje: 'RDY-1', tipo: 'INICIO' as const, fecha: '2026-11-01T14:00:00Z', placa: 'xx999', conductorDoc: 'V-12.345.678', kmEstimados: 8, pasajeros: PASAJEROS };
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

  it('INICIO guarda los pasajeros normalizados y los devuelve en el estado del viaje', async () => {
    const { svc, viajes } = setup();
    const r = await svc.evento(T, inicio);
    expect(r.pasajeros).toEqual([
      { tipoDoc: 'V', documento: '12345678', nombres: 'María', apellidos: 'Pérez', telefono: '+584141234567', correo: 'maria.perez@correo.com', fechaNacimiento: null, esConductor: true },
      { tipoDoc: 'P', documento: 'AB123456', nombres: 'John', apellidos: 'Smith', telefono: '04141234567', correo: 'john@correo.com', fechaNacimiento: '1990-05-17', esConductor: false },
    ]);
    expect(viajes.rows[0].pasajeros).toEqual(r.pasajeros);
    expect((await svc.estadoCobro(T, 'RDY-1')).pasajeros).toEqual(r.pasajeros);
  });

  it('reenviar el mismo INICIO no duplica ni reemplaza los pasajeros', async () => {
    const { svc, viajes } = setup();
    await svc.evento(T, inicio);
    const r2 = await svc.evento(T, { ...inicio, pasajeros: [...PASAJEROS, { ...PASAJEROS[1], documento: 'ZZ999' }] });
    expect(r2.duplicado).toBe(true);
    expect(r2.pasajeros).toHaveLength(2);
    expect(viajes.rows).toHaveLength(1);
    expect(viajes.rows[0].pasajeros).toHaveLength(2);
  });

  it('INICIO sin pasajeros → 400 con message como lista; no registra el viaje', async () => {
    const { svc, viajes } = setup();
    for (const pasajeros of [undefined, []]) {
      const err = await svc.evento(T, { ...inicio, pasajeros }).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse().message).toEqual([MSG_PASAJEROS_OBLIGATORIO]);
    }
    expect(viajes.rows).toHaveLength(0);
  });

  it('INICIO con el mismo documento dos veces en la lista → 400', async () => {
    const { svc } = setup();
    const err = await svc.evento(T, { ...inicio, pasajeros: [PASAJEROS[0], { ...PASAJEROS[0], documento: '12345678' }] }).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse().message[0]).toContain('V-12345678 está repetido');
  });

  it('FIN y CANCELACION no exigen pasajeros', async () => {
    const { svc } = setup();
    await svc.evento(T, inicio);
    expect((await svc.evento(T, fin)).estado).toBe('FINALIZADO');
    await svc.evento(T, { ...inicio, idViaje: 'RDY-2' });
    expect((await svc.evento(T, { idViaje: 'RDY-2', tipo: 'CANCELACION' })).estado).toBe('CANCELADO');
    // FIN sin INICIO previo (con placa): se registra sin pasajeros.
    const r = await svc.evento(T, { idViaje: 'RDY-3', tipo: 'FIN', placa: 'AB123CD', km: 5 });
    expect(r.estado).toBe('FINALIZADO');
    expect(r.pasajeros).toEqual([]);
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

  it('FIN crea el recibo propio PENDIENTE con numeración correlativa por certificado', async () => {
    const { svc, recibosRepo } = setup(false);
    await svc.evento(T, inicio);
    await svc.evento(T, fin);
    await svc.evento(T, { ...inicio, idViaje: 'RDY-9' });
    await svc.evento(T, { ...fin, idViaje: 'RDY-9' });
    expect(recibosRepo.rows.map((r) => [r.numero, r.estado, r.syncSis2000])).toEqual([
      [`RDY-${POLIZA}-3-000001`, 'PENDIENTE', 'PENDIENTE'],
      [`RDY-${POLIZA}-3-000002`, 'PENDIENTE', 'PENDIENTE'],
    ]);
    expect((await svc.estadoCobro(T, 'RDY-9')).reciboNexus).toMatchObject({ numero: `RDY-${POLIZA}-3-000002`, estado: 'PENDIENTE' });
  });

  it('anular recibo: requiere motivo y luego el pago del viaje queda en ERROR', async () => {
    const { svc, recibosRepo, recibos } = setup(false);
    await svc.evento(T, inicio);
    await svc.evento(T, fin);
    const id = recibosRepo.rows[0].id as string;
    await expect(recibos.anular(T, id, ' ')).rejects.toThrow();
    expect((await recibos.anular(T, id, 'Reverso')).estado).toBe('ANULADO');
    const p = await svc.pagar(T, { idViaje: 'RDY-1', monto: 1, referencia: 'P1' });
    expect(p.pago.recibo.estado).toBe('ERROR');
  });

  it('pago deja el recibo propio COBRADO (RDY-…, sync PENDIENTE); repetido devuelve lo mismo; otra referencia → 409', async () => {
    const { svc, crearReciboCertificado, recibosRepo } = setup(false);
    await svc.evento(T, inicio);
    await svc.evento(T, fin);
    const p = await svc.pagar(T, { idViaje: 'RDY-1', monto: 1, referencia: 'P1' });
    expect(p.pago.recibo).toMatchObject({
      estado: 'RECIBO_NEXUS', modo: 'NEXUS', cnpoliza: POLIZA, ccerti: 3, cnrecibo: `RDY-${POLIZA}-3-000001`,
    });
    expect(recibosRepo.rows[0]).toMatchObject({ estado: 'COBRADO', referenciaPago: 'P1', syncSis2000: 'PENDIENTE' });
    expect(crearReciboCertificado).not.toHaveBeenCalled();
    expect((await svc.pagar(T, { idViaje: 'RDY-1', monto: 1, referencia: 'P1' })).duplicado).toBe(true);
    await expect(svc.pagar(T, { idViaje: 'RDY-1', monto: 1, referencia: 'P2' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('pago REAL llama a nest-api con el certificado del conductor', async () => {
    const { svc, crearReciboCertificado, recibosRepo } = setup(true);
    await svc.evento(T, inicio);
    await svc.evento(T, fin);
    const p = await svc.pagar(T, { idViaje: 'RDY-1', monto: 1, moneda: 'USD', referencia: 'P1' });
    expect(crearReciboCertificado).toHaveBeenCalledWith(expect.objectContaining({
      cnpoliza: POLIZA, ccerti: 3, mprima: 1, cmoneda: '$', fdesde: '2026-11-01', fhasta: '2026-11-01', creferencia: 'VIAJE:RDY-1',
    }));
    expect(p.pago.recibo).toMatchObject({ estado: 'RECIBO_GENERADO', cnrecibo: '18-998877' });
    expect(recibosRepo.rows[0]).toMatchObject({ estado: 'COBRADO', syncSis2000: 'OK', cnreciboSis2000: '18-998877' });
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

describe('certificados con FLOTA_RECIBO_REAL=1', () => {
  it('incluye en Sis2000 sin recibo y guarda el ccerti REAL devuelto', async () => {
    const { svc, incluirCertificado } = setup(true);
    const c = await svc.guardarCertificado(T, { placa: 'xy987zz', conductorDoc: 'V-87654321', conductorNombre: 'Ana Gómez' });
    expect(incluirCertificado).toHaveBeenCalledWith(POLIZA, expect.objectContaining({
      xplaca: 'XY987ZZ', conductor: { cid: 'V-87654321', nombre: 'ANA GÓMEZ' },
    }));
    expect(c).toMatchObject({ ccerti: 41, origen: 'SIS2000', activo: true });
  });

  it('sin FLOTA_RECIBO_REAL usa la numeración local y no llama a Sis2000', async () => {
    const { svc, incluirCertificado } = setup(false);
    const c = await svc.guardarCertificado(T, { placa: 'XY987ZZ', conductorDoc: 'V-87654321', conductorNombre: 'Ana' });
    expect(incluirCertificado).not.toHaveBeenCalled();
    expect(c).toMatchObject({ ccerti: 4, origen: 'MANUAL' });
  });

  it('al desactivar un certificado de Sis2000 llama a la exclusión', async () => {
    const { svc, certs, excluirCertificado } = setup(true);
    (certs.rows[0] as Record<string, unknown>).origen = 'SIS2000';
    const c = await svc.desactivarCertificado(T, 'c1');
    expect(excluirCertificado).toHaveBeenCalledWith(POLIZA, 3, expect.any(String));
    expect(c.activo).toBe(false);
  });

  it('si la exclusión falla no se desactiva', async () => {
    const { svc, certs, excluirCertificado } = setup(true);
    (certs.rows[0] as Record<string, unknown>).origen = 'SIS2000';
    excluirCertificado.mockRejectedValueOnce(Object.assign(new Error('x'), { response: { status: 400, data: { message: 'no vigente' } } }));
    await expect(svc.desactivarCertificado(T, 'c1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect((certs.rows[0] as Record<string, unknown>).activo).toBe(true);
  });
});

describe('sincronizar recibos pendientes', () => {
  const inicio = { idViaje: 'RDY-5', tipo: 'INICIO' as const, fecha: '2026-11-01T14:00:00Z', placa: 'xx999', conductorDoc: 'V-12.345.678', kmEstimados: 8, pasajeros: PASAJEROS };
  const fin = { idViaje: 'RDY-5', tipo: 'FIN' as const, fecha: '2026-11-01T14:30:00Z', km: 9.1 };

  it('reintenta el recibo COBRADO con sync ERROR y lo deja OK con cnrecibo de Sis2000', async () => {
    const { svc, recibos, recibosRepo, crearReciboCertificado } = setup(true);
    await svc.evento(T, inicio);
    await svc.evento(T, fin);
    crearReciboCertificado.mockRejectedValueOnce(Object.assign(new Error('caído'), { response: { status: 500 } }));
    const p = await svc.pagar(T, { idViaje: 'RDY-5', monto: 1, referencia: 'P5' });
    expect(p.pago.recibo.estado).toBe('ERROR');
    const pendientes = () => recibosRepo.rows.filter((r) => r.estado === 'COBRADO' && ['PENDIENTE', 'ERROR'].includes(String(r.syncSis2000)));
    expect(pendientes()).toHaveLength(1);
    jest.spyOn(recibos, 'listar').mockImplementation(async () => ({ cnpoliza: POLIZA, recibos: pendientes() }) as never);
    const r = await svc.sincronizarRecibosPendientes(T);
    expect(r).toMatchObject({ intentados: 1, ok: 1, error: 0 });
    expect(r.resultados[0].cnrecibo).toBe('18-998877');
    expect(recibosRepo.rows[0]).toMatchObject({ syncSis2000: 'OK', cnreciboSis2000: '18-998877' });
  });

  it('sin FLOTA_RECIBO_REAL=1 no sincroniza', async () => {
    const { svc } = setup(false);
    await expect(svc.sincronizarRecibosPendientes(T)).rejects.toThrow('FLOTA_RECIBO_REAL=1');
  });
});
