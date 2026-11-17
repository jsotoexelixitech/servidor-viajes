import { HttpException, ValidationPipe } from '@nestjs/common';
import {
  armarRegistroTrayecto, documentoComparable, FlotaDocumentosService, integradorFlota, itemsDelLote, MAX_ARCHIVO_DOCUMENTO,
  MAX_ARCHIVOS_LOTE,
  requisitoDeConductor, tipoArchivo,
} from './flota-documentos.service';
import { FlotaExpedienteClient, NexusExpedienteError } from './flota-expediente.client';
import { FlotaDocumentosController } from './flota-documentos.controller';
import { FlotaCobroViajeController } from './flota-cobro-viaje.controller';
import { SubirDocumentoFlotaDto } from './dto/documentos.dto';

const TENANT = '7d1c3a52-0000-4000-8000-000000000001';
const POLIZA = '18-1-1130480881';
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(50, 1)]);

type Cert = {
  id: string; tenantId: string; cnpoliza: string; ccerti: number; placa: string | null;
  conductorDoc: string | null; conductorNombre: string | null; activo: boolean;
};

function cert(ccerti: number, conductorDoc: string | null, conductorNombre: string | null, activo = true, cnpoliza = POLIZA): Cert {
  return { id: `cert-${ccerti}`, tenantId: TENANT, cnpoliza, ccerti, placa: `AB${ccerti}CD`, conductorDoc, conductorNombre, activo };
}

const coincide = (row: Record<string, unknown>, where: Record<string, unknown>) =>
  Object.entries(where).every(([k, v]) => row[k] === v);

function crear(opts: { certs?: Cert[]; configurado?: boolean } = {}) {
  const certs = opts.certs ?? [
    cert(1, 'V-12.345.678', 'José Pérez'),
    cert(2, 'E-81234567', 'Luis Gómez'),
    cert(3, 'V12345678', 'José Pérez'), // mismo conductor, otro vehículo
    cert(4, 'V-20111222', 'Ana Ruiz', false), // desactivado
    cert(5, null, null), // sin conductor
  ];
  const certRepo = {
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      certs.filter((c) => coincide(c as unknown as Record<string, unknown>, where)).sort((a, b) => a.ccerti - b.ccerti)),
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      certs.find((c) => coincide(c as unknown as Record<string, unknown>, where)) ?? null),
  };
  const polizaRepo = {
    findOne: jest.fn(async () => ({ tenantId: TENANT, cnpoliza: POLIZA, cplan: 'RIDER1', tomadorRif: 'J-50123456-7', tomadorNombre: 'Transporte Ejemplo C.A.' })),
  };
  const flota = { getConfig: jest.fn(async () => ({ cnpoliza: POLIZA, cplan: 'RIDER1' })) };
  const nexus = {
    configurado: jest.fn(() => opts.configurado ?? true),
    exigirConfiguracion: jest.fn(() => {
      if (!(opts.configurado ?? true)) throw new HttpException('La API de documentos no está configurada', 503);
    }),
    registrar: jest.fn(async () => ({ id: 1, creado: true })),
    estado: jest.fn(async () => ({
      cnpoliza: POLIZA,
      estado: 'incompleto',
      documentos: [
        { tipo: 'rif', estado: 'validado' },
        { tipo: 'cedula', documento: '12345678', estado: 'por_corregir', motivo: 'Ilegible' },
        { tipo: 'cedula', documento: '81234567', estado: 'pendiente' },
      ],
    })),
    subir: jest.fn(async (_i: string, _p: string, _a: unknown, tipo: string, documento?: string | null) => ({
      tipo, estado: 'recibido' as const, ...(documento ? { documento: documentoComparable(documento) } : {}),
    })),
  };
  const config = { get: jest.fn((k: string) => (k === 'FLOTA_EXPEDIENTES_CANAL' ? 'TRAYECTO SEGURO' : undefined)) };
  const svc = new FlotaDocumentosService(polizaRepo as never, certRepo as never, flota as never, nexus as never, config as never);
  return { svc, nexus, certRepo, certs };
}

const archivo = (buffer: Buffer, size = buffer.length) => ({ buffer, originalname: 'doc.jpg', size });

describe('Documentos de flota — reglas', () => {
  it('número comparable y requisito del conductor como en Nexus', () => {
    expect(documentoComparable('V-12.345.678')).toBe('12345678');
    expect(documentoComparable('E-081234567')).toBe('81234567');
    expect(documentoComparable('P-EM2849387')).toBe('EM2849387');
    expect(documentoComparable('J-50123456-7')).toBe('501234567');
    expect(requisitoDeConductor('V12345678')).toBe('conductor_12345678');
    expect(requisitoDeConductor('')).toBeNull();
    expect(integradorFlota(TENANT)).toBe(`flota:${TENANT}`);
    expect(integradorFlota('x').length).toBeGreaterThanOrEqual(7);
  });

  it('registro: RIF de la empresa y un conductor por documento, solo certificados activos', () => {
    const body = armarRegistroTrayecto({
      tenantId: TENANT,
      cnpoliza: POLIZA,
      cplan: 'RIDER1',
      tomadorRif: 'J-50123456-7',
      tomadorNombre: 'Transporte Ejemplo C.A.',
      certificados: [
        cert(2, 'E-81234567', 'Luis Gómez'),
        cert(1, 'V-12.345.678', 'José Pérez'),
        cert(3, 'V12345678', 'José Pérez'),
        cert(4, 'V-20111222', 'Ana Ruiz', false),
        cert(5, null, null),
      ],
    });
    expect(body).toEqual({
      integrador: `flota:${TENANT}`,
      producto: 'trayecto',
      cnpoliza: POLIZA,
      cramo: 18,
      cplan: 'RIDER1',
      canal: { ccanalalt: null, xcanalVenta: 'TRAYECTO SEGURO' },
      tomador: { tipoDoc: 'J', documento: 'J-50123456-7', nombre: 'Transporte Ejemplo C.A.' },
      personas: [
        { tipoDoc: 'V', documento: 'V-12.345.678', nombre: 'José Pérez' },
        { tipoDoc: 'E', documento: 'E-81234567', nombre: 'Luis Gómez' },
      ],
    });
    // Sin RIF de la empresa: Nexus exige el requisito igual; aquí va sin tomador.
    expect(armarRegistroTrayecto({ tenantId: TENANT, cnpoliza: POLIZA, certificados: [] }).tomador).toBeNull();
    // Tope de 500 conductores (Nexus).
    const muchos = Array.from({ length: 600 }, (_, i) => cert(i + 1, `V-${10000000 + i}`, `C${i}`));
    expect(armarRegistroTrayecto({ tenantId: TENANT, cnpoliza: POLIZA, certificados: muchos }).personas).toHaveLength(500);
  });

  it('archivo: PDF, JPG, PNG o WEBP por contenido', () => {
    expect(tipoArchivo(PDF)).toBe('application/pdf');
    expect(tipoArchivo(JPG)).toBe('image/jpeg');
    expect(tipoArchivo(WEBP)).toBe('image/webp');
    expect(tipoArchivo(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(10)]))).toBe('image/png');
    expect(tipoArchivo(Buffer.from('<html><body>hola</body></html>'))).toBeNull();
  });

  it('DTO: tipo válido y campos no documentados → 400', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const meta = { type: 'body' as const, metatype: SubirDocumentoFlotaDto };
    await expect(pipe.transform({ tipo: 'cedula', conductorDoc: 'V-12345678' }, meta)).resolves.toBeDefined();
    await expect(pipe.transform({ tipo: 'licencia' }, meta)).rejects.toThrow();
    await expect(pipe.transform({ tipo: 'rif', extra: '1' }, meta)).rejects.toThrow();
    await expect(pipe.transform({ tipo: 'cedula', certificadoId: 'no-uuid' }, meta)).rejects.toThrow();
  });
});

describe('Documentos de flota — servicio', () => {
  it('sincronizar: registra la póliza con los conductores activos', async () => {
    const { svc, nexus } = crear();
    const r = await svc.sincronizar(TENANT);
    expect(r).toEqual({ cnpoliza: POLIZA, conductores: 2, creado: true, actualizado: false });
    const body = (nexus.registrar.mock.calls[0] as unknown[])[0] as { personas: unknown[]; tomador: unknown; integrador: string };
    expect(body.integrador).toBe(`flota:${TENANT}`);
    expect(body.personas).toHaveLength(2);
    expect(body.tomador).toMatchObject({ documento: 'J-50123456-7' });
  });

  it('estado: cada conductor con su documento, nombre y certificados', async () => {
    const { svc, nexus } = crear();
    const r = await svc.estado(TENANT);
    expect(nexus.estado).toHaveBeenCalledWith(`flota:${TENANT}`, POLIZA);
    expect(r.documentos[0]).toEqual({ requisito: 'rif', tipo: 'rif', estado: 'validado' });
    expect(r.documentos[1]).toMatchObject({
      requisito: 'conductor', tipo: 'cedula', documento: '12345678', estado: 'por_corregir', motivo: 'Ilegible',
      conductorDoc: 'V-12.345.678', conductorNombre: 'José Pérez',
    });
    expect((r.documentos[1] as { certificados: { ccerti: number }[] }).certificados.map((c) => c.ccerti)).toEqual([1, 3]);
  });

  it('estado: póliza aún no registrada en Nexus (404) → la registra y repite', async () => {
    const { svc, nexus } = crear();
    nexus.estado.mockRejectedValueOnce(new NexusExpedienteError(404, 'Póliza no encontrada.'));
    const r = await svc.estado(TENANT);
    expect(nexus.registrar).toHaveBeenCalledTimes(1);
    expect(nexus.estado).toHaveBeenCalledTimes(2);
    expect(r.estado).toBe('incompleto');
  });

  it('sin configuración: 503 claro', async () => {
    const { svc } = crear({ configurado: false });
    await expect(svc.sincronizar(TENANT)).rejects.toMatchObject({ status: 503 });
    await expect(svc.subir(TENANT, archivo(JPG), { tipo: 'rif' })).rejects.toMatchObject({ status: 503 });
  });

  it('subir RIF de la empresa: sin conductor', async () => {
    const { svc, nexus } = crear();
    const r = await svc.subir(TENANT, archivo(PDF), { tipo: 'rif' });
    expect(r).toEqual({ cnpoliza: POLIZA, tipo: 'rif', estado: 'recibido' });
    const [integrador, poliza, arch, tipo, documento] = nexus.subir.mock.calls[0] as unknown[];
    expect([integrador, poliza, tipo, documento]).toEqual([`flota:${TENANT}`, POLIZA, 'rif', null]);
    expect(arch).toMatchObject({ mimetype: 'application/pdf' });
    await expect(svc.subir(TENANT, archivo(PDF), { tipo: 'rif', conductorDoc: 'V-1' })).rejects.toMatchObject({ status: 400 });
  });

  it('subir cédula: el conductor se ubica por conductorDoc o certificadoId (solo activos)', async () => {
    const { svc, nexus } = crear();
    const porDoc = await svc.subir(TENANT, archivo(JPG), { tipo: 'cedula', conductorDoc: '12345678' });
    expect(porDoc).toMatchObject({ tipo: 'cedula', documento: '12345678', conductorDoc: 'V-12.345.678', certificadoId: 'cert-1', ccerti: 1 });
    expect((nexus.subir.mock.calls[0] as unknown[])[4]).toBe('V-12.345.678');

    const porCert = await svc.subir(TENANT, archivo(WEBP), { tipo: 'pasaporte', certificadoId: 'cert-2' });
    expect(porCert).toMatchObject({ tipo: 'pasaporte', conductorDoc: 'E-81234567', ccerti: 2 });

    await expect(svc.subir(TENANT, archivo(JPG), { tipo: 'cedula', conductorDoc: 'V-20111222' })).rejects.toMatchObject({ status: 404 });
    await expect(svc.subir(TENANT, archivo(JPG), { tipo: 'cedula', certificadoId: 'cert-4' })).rejects.toMatchObject({ status: 404 });
    await expect(svc.subir(TENANT, archivo(JPG), { tipo: 'cedula', certificadoId: 'cert-5' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.subir(TENANT, archivo(JPG), { tipo: 'cedula' })).rejects.toMatchObject({ status: 400 });
    await expect(
      svc.subir(TENANT, archivo(JPG), { tipo: 'cedula', certificadoId: 'cert-1', conductorDoc: 'E-81234567' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('subir: archivo faltante 400, mayor a 10 MB 413, formato no permitido 415', async () => {
    const { svc, nexus } = crear();
    await expect(svc.subir(TENANT, undefined, { tipo: 'rif' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.subir(TENANT, archivo(JPG, MAX_ARCHIVO_DOCUMENTO + 1), { tipo: 'rif' })).rejects.toMatchObject({ status: 413 });
    await expect(svc.subir(TENANT, archivo(Buffer.from('<html>xxxxxxxxxxxxxxxx</html>')), { tipo: 'rif' })).rejects.toMatchObject({ status: 415 });
    expect(nexus.subir).not.toHaveBeenCalled();
  });

  it('subir: conductor recién agregado que Nexus no tiene → re-registra y repite; Nexus caído → 502', async () => {
    const { svc, nexus } = crear();
    nexus.subir.mockRejectedValueOnce(new NexusExpedienteError(400, 'El documento no corresponde a ningún conductor activo de la póliza.'));
    const r = await svc.subir(TENANT, archivo(JPG), { tipo: 'cedula', conductorDoc: 'E-81234567' });
    expect(r.estado).toBe('recibido');
    expect(nexus.registrar).toHaveBeenCalledTimes(1);
    expect(nexus.subir).toHaveBeenCalledTimes(2);

    nexus.subir.mockRejectedValueOnce(new NexusExpedienteError(500, 'boom'));
    await expect(svc.subir(TENANT, archivo(JPG), { tipo: 'rif' })).rejects.toMatchObject({ status: 502 });
    nexus.subir.mockRejectedValueOnce(new NexusExpedienteError(401, 'No autorizado.'));
    await expect(svc.subir(TENANT, archivo(JPG), { tipo: 'rif' })).rejects.toMatchObject({ status: 502 });
    nexus.subir.mockRejectedValueOnce(new NexusExpedienteError(400, 'El archivo está vacío.'));
    await expect(svc.subir(TENANT, archivo(JPG), { tipo: 'rif' })).rejects.toMatchObject({ status: 400 });
  });

  describe('programar (segundo plano)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('agrupa cambios seguidos y reintenta si Nexus falla; nunca lanza', async () => {
      const { svc, nexus } = crear();
      nexus.registrar.mockRejectedValueOnce(new NexusExpedienteError(0, 'Nexus no respondió'));
      svc.programar(TENANT);
      svc.programar(TENANT);
      svc.programar(TENANT);
      await jest.advanceTimersByTimeAsync(2_000);
      expect(nexus.registrar).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(30_000);
      expect(nexus.registrar).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(600_000);
      expect(nexus.registrar).toHaveBeenCalledTimes(2);
      svc.onModuleDestroy();
    });

    it('sin configuración no programa nada', async () => {
      const { svc, nexus } = crear({ configurado: false });
      svc.programar(TENANT);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(nexus.registrar).not.toHaveBeenCalled();
    });
  });
});

describe('Documentos de flota — cliente Nexus', () => {
  const config = (vals: Record<string, string>) => ({ get: (k: string) => vals[k] }) as never;
  let fetchMock: jest.Mock;
  const original = global.fetch;
  beforeEach(() => {
    fetchMock = jest.fn(async () => new Response(JSON.stringify({ success: true, data: { ok: 1 } }), { status: 201 }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = original;
  });

  it('sin URL o sin clave: no configurado y 503', () => {
    const c = new FlotaExpedienteClient(config({ NEXUS_API_URL: 'http://nexus' }));
    expect(c.configurado()).toBe(false);
    expect(() => c.exigirConfiguracion()).toThrow(/no está configurada/);
  });

  it('registro y carga con la clave interna y el integrador', async () => {
    const c = new FlotaExpedienteClient(config({ FLOTA_EXPEDIENTES_URL: 'http://nexus/', FLOTA_EXPEDIENTES_KEY: 'clave' }));
    expect(c.configurado()).toBe(true);
    await expect(c.registrar({ integrador: 'flota:x', producto: 'trayecto', cnpoliza: POLIZA, personas: [] })).resolves.toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://nexus/api/expedientes/integracion/registro');
    expect(init.headers['x-expediente-key']).toBe('clave');

    await c.subir('flota:x', POLIZA, { buffer: JPG, nombre: 'c.jpg', mimetype: 'image/jpeg' }, 'cedula', 'V-12345678');
    const [url2, init2] = fetchMock.mock.calls[1];
    expect(url2).toBe(`http://nexus/api/expedientes/integracion/polizas/${POLIZA}/documentos`);
    expect(init2.headers['x-integrador']).toBe('flota:x');
    const form = init2.body as FormData;
    expect(form.get('tipo')).toBe('cedula');
    expect(form.get('documento')).toBe('V-12345678');
    expect((form.get('file') as Blob).size).toBe(JPG.length);
  });

  it('respuesta no 2xx → error con el status y el mensaje de Nexus', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: false, message: 'Póliza no encontrada.' }), { status: 404 }));
    const c = new FlotaExpedienteClient(config({ NEXUS_API_URL: 'http://nexus', FLOTA_EXPEDIENTES_KEY: 'clave' }));
    await expect(c.estado('flota:x', POLIZA)).rejects.toMatchObject({ status: 404, message: 'Póliza no encontrada.' });
  });
});

describe('Documentos de flota — controllers', () => {
  it('POST acepta el archivo en `archivo` o en `file`', async () => {
    const docs = { subir: jest.fn(async () => ({ ok: true })) };
    const ctrl = new FlotaDocumentosController(docs as never);
    const t = { id: TENANT } as never;
    const res = { status: jest.fn() } as never;
    await ctrl.subir(t, [{ ...archivo(JPG), fieldname: 'file' }], { tipo: 'rif' }, res);
    await ctrl.subir(t, [{ ...archivo(PDF), fieldname: 'archivo' }], { tipo: 'rif' }, res);
    expect((docs.subir.mock.calls[0] as unknown[])[1]).toMatchObject({ buffer: JPG });
    expect((docs.subir.mock.calls[1] as unknown[])[1]).toMatchObject({ buffer: PDF });
  });

  it('certificados: tras guardar/desactivar se re-registra en Nexus; si el alta falla, no', async () => {
    const svc = {
      guardarCertificado: jest.fn(async () => ({ id: 'cert-1' })),
      desactivarCertificado: jest.fn(async () => {
        throw new HttpException('Certificado no encontrado.', 404);
      }),
    };
    const docs = { programar: jest.fn() };
    const bus = { bump: jest.fn() };
    const ctrl = new FlotaCobroViajeController(svc as never, {} as never, bus as never, docs as never);
    const t = { id: TENANT } as never;
    await expect(ctrl.guardarCertificado(t, { conductorDoc: 'V-1' })).resolves.toEqual({ id: 'cert-1' });
    expect(docs.programar).toHaveBeenCalledWith(TENANT);
    await expect(ctrl.desactivarCertificado(t, 'x')).rejects.toMatchObject({ status: 404 });
    expect(docs.programar).toHaveBeenCalledTimes(1);
    expect(bus.bump).toHaveBeenCalledTimes(2);
  });
});

describe('Documentos de flota — lote (varios archivos por envío)', () => {
  const UUID = '0b6f1f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
  const GIF = Buffer.from('GIF89a-no-permitido-xx');
  const multer = (buffer: Buffer, nombre: string, fieldname = 'archivos') => ({ buffer, originalname: nombre, size: buffer.length, fieldname });
  function controlador(opts: Parameters<typeof crear>[0] = {}) {
    const c = crear(opts);
    const res = { status: jest.fn() };
    return { ...c, ctrl: new FlotaDocumentosController(c.svc), res, t: { id: TENANT } as never };
  }

  it('items: forma, campos permitidos, cantidad y máximo de 10', () => {
    expect(itemsDelLote(`[{"tipo":"rif"},{"tipo":"cedula","conductorDoc":"V-1"},{"tipo":"pasaporte","certificadoId":"${UUID}"}]`, 3)).toEqual([
      { tipo: 'rif' },
      { tipo: 'cedula', conductorDoc: 'V-1' },
      { tipo: 'pasaporte', certificadoId: UUID },
    ]);
    expect(itemsDelLote('[{"tipo":"rif"}]', 2)).toMatch(/deben coincidir/);
    expect(itemsDelLote(undefined, 2)).toMatch(/items es obligatorio/);
    expect(itemsDelLote('nojson', 1)).toMatch(/JSON array válido/);
    expect(itemsDelLote('[{"tipo":"licencia"}]', 1)).toMatch(/items\[0\]\.tipo/);
    expect(itemsDelLote('[{"tipo":"rif","extra":1}]', 1)).toMatch(/items\[0\]\.extra/);
    expect(itemsDelLote('[{"tipo":"cedula","certificadoId":"no-uuid"}]', 1)).toMatch(/UUID/);
    expect(itemsDelLote('[]', MAX_ARCHIVOS_LOTE + 1)).toMatch(/Máximo 10 archivos/);
  });

  it('un solo archivo con campos sueltos: idéntico a hoy (sin tocar el status)', async () => {
    const { ctrl, res, t } = controlador();
    const r = await ctrl.subir(t, [multer(PDF, 'rif.pdf', 'archivo')], { tipo: 'rif' }, res as never);
    expect(r).toEqual({ cnpoliza: POLIZA, tipo: 'rif', estado: 'recibido' });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('lote ok: 201 con resultado por archivo, en orden y en serie', async () => {
    const { ctrl, res, t, nexus } = controlador();
    const items = JSON.stringify([
      { tipo: 'rif' },
      { tipo: 'cedula', conductorDoc: 'V-12345678' },
      { tipo: 'pasaporte', conductorDoc: 'E-81234567' },
    ]);
    const r = (await ctrl.subir(
      t,
      [multer(PDF, 'rif.pdf'), multer(JPG, 'ced.jpg'), multer(WEBP, 'pas.webp')],
      { items } as never,
      res as never,
    )) as { cnpoliza: string; recibidos: number; fallidos: number; resultados: unknown[] };
    expect(res.status).toHaveBeenCalledWith(201);
    expect(r).toMatchObject({ cnpoliza: POLIZA, recibidos: 3, fallidos: 0 });
    expect(r.resultados).toEqual([
      { indice: 0, archivo: 'rif.pdf', tipo: 'rif', estado: 'recibido', ok: true },
      expect.objectContaining({ indice: 1, archivo: 'ced.jpg', tipo: 'cedula', documento: '12345678', conductorDoc: 'V-12.345.678', certificadoId: 'cert-1', ok: true }),
      expect.objectContaining({ indice: 2, tipo: 'pasaporte', conductorDoc: 'E-81234567', ccerti: 2, ok: true }),
    ]);
    expect(nexus.subir.mock.calls.map((c) => (c as unknown[])[3])).toEqual(['rif', 'cedula', 'pasaporte']);
  });

  it('lote mixto: 207; un archivo malo no tumba a los demás; respaldo de registro por archivo', async () => {
    const { ctrl, res, t, nexus } = controlador();
    // Nexus aún no tiene al conductor: se registra la póliza y se repite (una vez) solo para ese archivo.
    nexus.subir
      .mockImplementationOnce(async () => ({ tipo: 'rif', estado: 'recibido' as const }))
      .mockRejectedValueOnce(new NexusExpedienteError(400, 'El documento no corresponde a ningún conductor activo de la póliza.'));
    const items = JSON.stringify([
      { tipo: 'rif' },
      { tipo: 'cedula', conductorDoc: 'E-81234567' },
      { tipo: 'cedula', conductorDoc: 'V-99999999' },
      { tipo: 'cedula', conductorDoc: 'V-12345678' },
    ]);
    const r = (await ctrl.subir(
      t,
      [multer(PDF, 'rif.pdf', 'archivo'), multer(JPG, 'a.jpg', 'archivo'), multer(JPG, 'b.jpg', 'archivo'), multer(GIF, 'c.gif', 'archivo')],
      { items } as never,
      res as never,
    )) as { recibidos: number; fallidos: number; resultados: unknown[] };
    expect(res.status).toHaveBeenCalledWith(207);
    expect(r).toMatchObject({ recibidos: 2, fallidos: 2 });
    expect(r.resultados).toEqual([
      expect.objectContaining({ indice: 0, ok: true }),
      expect.objectContaining({ indice: 1, ok: true, conductorDoc: 'E-81234567' }),
      { indice: 2, archivo: 'b.jpg', tipo: 'cedula', conductorDoc: 'V-99999999', ok: false, status: 404, message: 'El conductor no tiene certificado activo en la póliza de la flota.' },
      { indice: 3, archivo: 'c.gif', tipo: 'cedula', conductorDoc: 'V-12345678', ok: false, status: 415, message: 'Formato no permitido. Use PDF, JPG, PNG o WEBP.' },
    ]);
    expect(nexus.registrar).toHaveBeenCalledTimes(1);
    expect(nexus.subir).toHaveBeenCalledTimes(3);
  });

  it('lote donde todos fallan: status del primer error (Nexus caído → 502)', async () => {
    const { ctrl, res, t, nexus } = controlador();
    nexus.subir.mockRejectedValue(new NexusExpedienteError(500, 'boom'));
    const r = await ctrl.subir(t, [multer(PDF, 'a.pdf'), multer(PDF, 'b.pdf')], { items: '[{"tipo":"rif"},{"tipo":"rif"}]' } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(r).toMatchObject({ recibidos: 0, fallidos: 2 });
  });

  it('errores de forma del lote: 400 sin procesar nada; sin configuración 503', async () => {
    const { ctrl, res, t, nexus } = controlador();
    const dos = [multer(PDF, 'a.pdf'), multer(PDF, 'b.pdf')];
    await expect(ctrl.subir(t, dos, { items: '[{"tipo":"rif"}]' } as never, res as never)).rejects.toMatchObject({ status: 400 });
    await expect(ctrl.subir(t, dos, { tipo: 'rif' }, res as never)).rejects.toMatchObject({ status: 400 });
    await expect(
      ctrl.subir(t, dos, { items: '[{"tipo":"rif"},{"tipo":"rif"}]', tipo: 'rif' } as never, res as never),
    ).rejects.toMatchObject({ status: 400 });
    const once = Array.from({ length: MAX_ARCHIVOS_LOTE + 1 }, (_, i) => multer(PDF, `${i}.pdf`));
    await expect(
      ctrl.subir(t, once, { items: JSON.stringify(once.map(() => ({ tipo: 'rif' }))) } as never, res as never),
    ).rejects.toMatchObject({ status: 400, message: 'Máximo 10 archivos por envío.' });
    await expect(ctrl.subir(t, [multer(PDF, 'a.pdf', 'foto')], { tipo: 'rif' }, res as never)).rejects.toMatchObject({ status: 400 });
    expect(nexus.subir).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();

    const sin = controlador({ configurado: false });
    const loteDos = { items: JSON.stringify([{ tipo: 'rif' }, { tipo: 'rif' }]) } as never;
    await expect(sin.ctrl.subir(sin.t, dos, loteDos, sin.res as never)).rejects.toMatchObject({ status: 503 });
  });

  it('DTO: con items el tipo suelto no es obligatorio', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const meta = { type: 'body' as const, metatype: SubirDocumentoFlotaDto };
    await expect(pipe.transform({ items: JSON.stringify([{ tipo: 'rif' }]) }, meta)).resolves.toBeDefined();
    await expect(pipe.transform({}, meta)).rejects.toThrow();
  });
});
