import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SeguroService } from './seguro.service';
import { LaMundialService } from './lamundial.service';
import { Viaje } from '../viaje/entities/viaje.entity';
import { Tenant } from '../tenant/entities/tenant.entity';

const mockTenant = (configOverrides = {}): Tenant => ({
  id: 'tenant-001',
  nombre: 'Ridery Test',
  apiKey: 'key-test',
  activo: true,
  webhookUrl: null,
  webhookSecret: null,
  rateLimit: null,
  creadoEn: new Date(),
  actualizadoEn: new Date(),
  config: {
    seguroConfig: {
      baseUrl: 'https://api.lamundial.com.ve',
      plan: '2',
      cramo: 1310,
      frecuencia: 'DI',
      productor: 42,
      authToken: 'token-qa',
    },
    defaultValues: {
      ccategoria_uso: 1,
      dec_persona_politica: 0,
      dec_term_y_cod: 1,
      estado_tomador: 1,
      ciudad_tomador: 1,
      direccion_tomador: 'Caracas',
    },
    fieldMappings: {},
    ...configOverrides,
  },
});

const bodyTransformado = () => ({
  placa: 'ABC123F',
  fano: 2022,
  marca: '083',
  modelo: '001',
  version: '03',
  color: 'Negro',
  serial_carroceria: 'SC1S6ZMV0000001',
  nombre_tomador: 'Juan',
  apellido_tomador: 'Pérez',
  rif_tomador: 'V25221952',
  tipo_cedula_tomador: 'V',
  fnac_tomador: '1990-10-13',
  telefono_tomador: '+584241829583',
  correo_tomador: 'juan@test.com',
  estado_tomador: 1,
  ciudad_tomador: 1,
  direccion_tomador: 'Av. Libertador, Caracas',
});

describe('SeguroService', () => {
  let service: SeguroService;

  const mockLaMundialService = {
    emitirPoliza: jest.fn(),
    finalizarPoliza: jest.fn(),
    verificarPoliza: jest.fn(),
  };

  const mockViajeRepo = {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeguroService,
        { provide: LaMundialService, useValue: mockLaMundialService },
        { provide: getRepositoryToken(Viaje), useValue: mockViajeRepo },
      ],
    }).compile();

    service = module.get<SeguroService>(SeguroService);
    jest.clearAllMocks();
  });

  // ── EMITIR PÓLIZA ────────────────────────────────────────────────────────────

  describe('emitirPoliza()', () => {
    it('llama a La Mundial con payload completo y retorna resultado', async () => {
      const tenant = mockTenant();
      const resultadoEsperado = {
        cnpoliza: '18-1-0000012345',
        cnrecibo: 'REC-12345',
        urlpoliza: 'https://lamundial.com/poliza/12345.pdf',
        ncuota: 1,
      };
      mockLaMundialService.emitirPoliza.mockResolvedValue(resultadoEsperado);

      const result = await service.emitirPoliza(bodyTransformado(), tenant);

      expect(result.cnpoliza).toBe('18-1-0000012345');
      expect(result.urlpoliza).toContain('.pdf');

      // Verificar que el payload incluye los campos fijos del tenant
      const callArgs = mockLaMundialService.emitirPoliza.mock.calls[0];
      expect(callArgs[0]).toBe(tenant.config.seguroConfig.baseUrl);
      expect(callArgs[1]).toMatchObject({
        plan: '2',
        cramo: 1310,
        frecuencia: 'DI',
        productor: 42,
        placa: 'ABC123F',
        nombre_tomador: 'Juan',
      });
      expect(callArgs[2]).toBe('token-qa');
    });

    it('completa titular con datos del tomador si no se proporcionan', async () => {
      const tenant = mockTenant();
      mockLaMundialService.emitirPoliza.mockResolvedValue({ cnpoliza: 'X' } as any);

      await service.emitirPoliza(bodyTransformado(), tenant);

      const payload = mockLaMundialService.emitirPoliza.mock.calls[0][1];
      // El titular debe ser igual al tomador
      expect(payload.nombre_titular).toBe(payload.nombre_tomador);
      expect(payload.rif_titular).toBe(payload.rif_tomador);
      expect(payload.correo_titular).toBe(payload.correo_tomador);
    });

    it('lanza BadRequestException si el tenant no tiene seguroConfig', async () => {
      const tenantSinConfig = mockTenant();
      tenantSinConfig.config.seguroConfig = undefined;

      await expect(service.emitirPoliza(bodyTransformado(), tenantSinConfig))
        .rejects.toThrow(BadRequestException);

      expect(mockLaMundialService.emitirPoliza).not.toHaveBeenCalled();
    });

    it('lanza BadRequestException si faltan campos requeridos (placa, fano, marca)', async () => {
      const tenant = mockTenant();
      const bodyIncompleto = { nombre_tomador: 'Juan' }; // sin placa, fano, marca, etc.

      await expect(service.emitirPoliza(bodyIncompleto, tenant))
        .rejects.toThrow(BadRequestException);

      const err = await service.emitirPoliza(bodyIncompleto, tenant).catch(e => e);
      expect(err.message).toContain('placa');
    });

    it('usa los defaultValues del tenant para campos faltantes', async () => {
      const tenant = mockTenant();
      const bodySimple = { ...bodyTransformado() };
      delete bodySimple.estado_tomador; // falta — debe venir del default
      delete bodySimple.ciudad_tomador;

      mockLaMundialService.emitirPoliza.mockResolvedValue({ cnpoliza: 'X' } as any);
      await service.emitirPoliza(bodySimple, tenant);

      const payload = mockLaMundialService.emitirPoliza.mock.calls[0][1];
      expect(payload.estado_tomador).toBe(1);  // vino del defaultValues
      expect(payload.ciudad_tomador).toBe(1);  // vino del defaultValues
    });

    it('mapea cmarca/cmodelo/cversion → marca/modelo/version para la emisión', async () => {
      const tenant = mockTenant();
      const bodyConCodigos = { ...bodyTransformado(), cmarca: '083', cmodelo: '001', cversion: '03' };
      delete bodyConCodigos.marca;
      delete bodyConCodigos.modelo;
      delete bodyConCodigos.version;

      mockLaMundialService.emitirPoliza.mockResolvedValue({ cnpoliza: 'X' } as any);
      await service.emitirPoliza(bodyConCodigos, tenant);

      const payload = mockLaMundialService.emitirPoliza.mock.calls[0][1];
      expect(payload.marca).toBe('083');  // cmarca → marca
      expect(payload.modelo).toBe('001'); // cmodelo → modelo
      expect(payload.version).toBe('03'); // cversion → version
    });
  });

  // ── FINALIZAR PÓLIZA ─────────────────────────────────────────────────────────

  describe('finalizarPoliza()', () => {
    it('no lanza error si el viaje no tiene póliza (viaje sin emisión)', async () => {
      const viaje = { id: 'v-001', cnpoliza: null } as Viaje;
      const tenant = mockTenant();

      await expect(service.finalizarPoliza(viaje, tenant)).resolves.not.toThrow();
    });

    it('registra log de finalización si el viaje tiene póliza', async () => {
      const viaje = { id: 'v-001', cnpoliza: '18-1-0000012345' } as Viaje;
      const tenant = mockTenant();

      await expect(service.finalizarPoliza(viaje, tenant)).resolves.not.toThrow();
    });
  });
});
