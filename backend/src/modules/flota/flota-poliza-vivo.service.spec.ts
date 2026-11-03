import { FlotaPolizaVivoService, leerCoberturas, rangoFechas, reciboDeViaje } from './flota-poliza-vivo.service';
import { FlotaVivoBus } from './flota-vivo.bus';
import { FlotaSis2000Client } from './flota-sis2000.client';
import { FlotaService } from './flota.service';
import { EstadoViajeFlota, FlotaViaje } from './entities/flota-viaje.entity';
import { EstadoReciboViaje, FlotaPagoViaje } from './entities/flota-pago-viaje.entity';

const T = 'tenant-1';
const POLIZA = '18-1-1130480881';
const HOY = new Date();

const viaje = (id: string, p: Partial<FlotaViaje>): FlotaViaje => ({
  id, tenantId: T, idExterno: id, placa: 'AB123CD', conductorDoc: 'V-1', conductorNombre: 'José', estado: EstadoViajeFlota.FINALIZADO,
  inicio: HOY, fin: HOY, km: '9.1', minutos: '20', costo: '1', moneda: 'USD', modoCobro: 'POR_VIAJE', clasificacion: 'URBANO',
  cnpoliza: POLIZA, ccerti: 1, estadoPago: 'PENDIENTE', ...p,
} as FlotaViaje);
const pago = (viajeId: string, p: Partial<FlotaPagoViaje>): FlotaPagoViaje => ({
  id: `p-${viajeId}`, tenantId: T, viajeId, idExterno: viajeId, monto: '1', moneda: 'USD', referencia: `PAY-${viajeId}`, metodo: 'WALLET',
  fechaPago: HOY, cnpoliza: POLIZA, ccerti: 1, estado: EstadoReciboViaje.RECIBO_SIMULADO, modo: 'SIMULADO',
  cnrecibo: `SIM-${viajeId}`, crecibo: null, error: null, actualizadoEn: HOY, ...p,
} as FlotaPagoViaje);

function setup(opts: { conexion?: boolean; poliza?: boolean } = {}) {
  const viajes = [
    viaje('V1', {}),                                                     // pagado (cert 1)
    viaje('V2', { km: '35', costo: '5.25', clasificacion: 'EXTRA_URBANO' }), // pendiente (cert 1)
    viaje('V3', { ccerti: 2, conductorNombre: 'Ana', placa: 'XY999ZZ', estado: EstadoViajeFlota.INICIADO, fin: null, km: null, costo: null, kmEstimados: '4', montoEstimado: '1' }),
    viaje('V4', { ccerti: 2, estado: EstadoViajeFlota.CANCELADO, costo: '0' }),
    viaje('V5', { ccerti: null, placa: 'ZZZ', conductorNombre: 'Sin cert' }),
    viaje('V6', { ccerti: 2, conductorNombre: 'Ana', placa: 'XY999ZZ', km: '30', costo: '4.5' }),
  ];
  const pagos = [
    pago('V1', {}),
    pago('V5', { ccerti: null, estado: EstadoReciboViaje.ERROR, cnrecibo: null, error: 'sin certificado' }),
    pago('V6', { ccerti: 2, monto: '4.5' }),
  ];
  const certs = [
    { id: 'c1', tenantId: T, cnpoliza: POLIZA, ccerti: 1, placa: 'AB123CD', conductorDoc: 'V-1', conductorNombre: 'José', istatcer: null, activo: true, origen: 'MANUAL' },
    { id: 'c2', tenantId: T, cnpoliza: POLIZA, ccerti: 2, placa: 'XY999ZZ', conductorDoc: 'V-2', conductorNombre: 'Ana', istatcer: null, activo: true, origen: 'MANUAL' },
  ];
  const viajeRepo = { find: jest.fn().mockResolvedValue(viajes) };
  const pagoRepo = { find: jest.fn().mockResolvedValue(pagos) };
  const certRepo = { find: jest.fn().mockResolvedValue(certs) };
  const flota = { getConfig: async () => ({ cnpoliza: POLIZA, cplan: 'LARA', moneda: 'USD' }) } as unknown as FlotaService;
  const polizaFlota = jest.fn().mockResolvedValue({
    poliza: opts.poliza === false ? null : { cnpoliza: POLIZA, cplan: 'RIDER1', itipopol: 'C', ifrecuencia: 'M', cmoneda: '$', istatpol: 'V', fdesde: '2026-11-01', fhasta: '2027-11-01', cproductor: 55 },
    certificados: [{ ccerti: 3, xplaca: 'NEW001', xconductor: 'Pedro', cid_asegurado: 'V-3', xasegurado: null, istatcer: 'V', recibos: 0 }],
  });
  const sis2000 = {
    conexionConfigurada: () => opts.conexion ?? false,
    reciboRealActivo: () => false,
    polizaFlota,
    recibosCertificado: jest.fn().mockResolvedValue([]),
  } as unknown as FlotaSis2000Client;
  const bus = new FlotaVivoBus();
  const config = { get: () => undefined } as never;
  const svc = new FlotaPolizaVivoService(viajeRepo as never, certRepo as never, pagoRepo as never, flota, sis2000, bus, config);
  return { svc, bus, polizaFlota };
}

describe('FlotaPolizaVivoService', () => {
  it('arma el cuadro local (sin nest-api) con un recibo por viaje en el certificado del conductor', async () => {
    const { svc } = setup();
    const r = await svc.cuadro(T, 'Ridery', {});
    if (r.sinCambios) throw new Error('debía traer datos');
    expect(r.fuente).toBe('LOCAL');
    expect(r.tomador.nombre).toBe('Ridery');
    expect(r.poliza.cnpoliza).toBe(POLIZA);
    expect(r.poliza.plan).toBe('LARA');

    const c1 = r.certificados.find((c) => c.ccerti === 1)!;
    expect(c1.recibos.map((x) => [x.idViaje, x.estado])).toEqual([['V1', 'PAGADO'], ['V2', 'PENDIENTE']]);
    expect(c1.recibos[0].nRecibo).toBe('SIM-V1');
    expect(c1.totales).toMatchObject({ viajes: 2, pagados: 1, primasCobradas: 1, primasPendientes: 5.25, km: 44.1 });

    const c2 = r.certificados.find((c) => c.ccerti === 2)!;
    expect(c2.recibos.map((x) => x.estado).sort()).toEqual(['EN_CURSO', 'PAGADO']);
    expect(c2.totales).toMatchObject({ viajes: 1, enCurso: 1, cancelados: 1, primasCobradas: 4.5 });

    const sin = r.certificados.find((c) => c.ccerti == null)!;
    expect(sin.recibos[0]).toMatchObject({ idViaje: 'V5', estado: 'ERROR', error: 'sin certificado' });

    expect(r.totales).toMatchObject({ viajes: 4, pagados: 3, primasCobradas: 6.5, primasPendientes: 5.25, enCurso: 1, cancelados: 1, recibosError: 1 });
    expect(r.coberturas[0].prima).toBe(6.5);
  });

  it('responde sinCambios si la revisión no cambió y recarga tras un evento', async () => {
    const { svc, bus } = setup();
    const r1 = await svc.cuadro(T, 'Ridery', {});
    const r2 = await svc.cuadro(T, 'Ridery', { rev: r1.rev });
    expect(r2.sinCambios).toBe(true);
    bus.bump(T);
    const r3 = await svc.cuadro(T, 'Ridery', { rev: r1.rev });
    expect(r3.sinCambios).toBe(false);
  });

  it('con nest-api toma la cabecera real y suma los certificados de vhcerti (con caché)', async () => {
    const { svc, polizaFlota } = setup({ conexion: true });
    const r = await svc.cuadro(T, 'Ridery', {});
    if (r.sinCambios) throw new Error('debía traer datos');
    expect(r.fuente).toBe('SIS2000');
    expect(r.poliza).toMatchObject({ plan: 'RIDER1', frecuencia: 'MENSUAL', moneda: 'DÓLAR ($)', estatus: 'VIGENTE', tipoPoliza: 'COLECTIVA (FLOTA)' });
    expect(r.certificados.find((c) => c.ccerti === 3)).toMatchObject({ placa: 'NEW001', conductorNombre: 'Pedro', estatus: 'VIGENTE', origen: 'SIS2000' });
    await svc.cuadro(T, 'Ridery', {});
    expect(polizaFlota).toHaveBeenCalledTimes(1);
  });

  it('si nest-api falla, cae a los datos locales sin romper', async () => {
    const { svc, polizaFlota } = setup({ conexion: true });
    polizaFlota.mockRejectedValueOnce(Object.assign(new Error('x'), { response: { status: 404, data: { message: 'Cannot GET' } } }));
    const r = await svc.cuadro(T, 'Ridery', {});
    if (r.sinCambios) throw new Error('debía traer datos');
    expect(r.fuente).toBe('LOCAL');
    expect(r.sis2000.error).toContain('404');
    expect(r.certificados.length).toBeGreaterThan(0);
  });
});

describe('helpers', () => {
  it('reciboDeViaje: cancelado no genera recibo', () => {
    expect(reciboDeViaje(viaje('X', { estado: EstadoViajeFlota.CANCELADO }), null)).toBeNull();
  });
  it('leerCoberturas: JSON inválido → cobertura por defecto', () => {
    expect(leerCoberturas('no-json')).toHaveLength(1);
    expect(leerCoberturas('[{"nombre":"RCV","suma":5000,"pct":60},{"nombre":"APOV","pct":40}]')).toEqual([
      { nombre: 'RCV', suma: 5000, pct: 60 }, { nombre: 'APOV', suma: null, pct: 40 },
    ]);
  });
  it('rangoFechas: por defecto el mes en curso', () => {
    const { desde, hasta } = rangoFechas();
    expect(desde.getDate()).toBe(1);
    expect(hasta.getMonth()).toBe(desde.getMonth());
  });
});

describe('reciboDeViaje con recibo propio (Fase 1)', () => {
  const v = viaje('V9', {});
  const propio = { viajeId: 'V9', numero: `RDY-${POLIZA}-1-000007`, estado: 'COBRADO', syncSis2000: 'PENDIENTE', cnreciboSis2000: null, ccerti: 1 } as never;
  it('muestra el número propio RDY-… en lugar del SIM-…', () => {
    const r = reciboDeViaje(v, pago('V9', {}), undefined, propio);
    expect(r).toMatchObject({ nRecibo: `RDY-${POLIZA}-1-000007`, estadoNexus: 'COBRADO', syncSis2000: 'PENDIENTE', estado: 'PAGADO' });
  });
  it('pendiente de pago ya trae número; anulado se marca ANULADO', () => {
    expect(reciboDeViaje(v, null, undefined, { ...(propio as object), estado: 'PENDIENTE' } as never))
      .toMatchObject({ nRecibo: `RDY-${POLIZA}-1-000007`, estado: 'PENDIENTE', modo: 'NEXUS' });
    expect(reciboDeViaje(v, null, undefined, { ...(propio as object), estado: 'ANULADO' } as never)?.estado).toBe('ANULADO');
  });
});
