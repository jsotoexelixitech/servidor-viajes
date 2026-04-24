import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ViajeService, VIAJE_QUEUE } from './viaje.service';
import { Viaje, EstadoViaje } from './entities/viaje.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SeguroService } from '../seguro/seguro.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockTenant = (): Tenant => ({
  id: 'tenant-uuid-001',
  nombre: 'Ridery Test',
  apiKey: 'test-api-key',
  activo: true,
  webhookUrl: null,
  webhookSecret: null,
  rateLimit: null,
  config: {},
  creadoEn: new Date(),
  actualizadoEn: new Date(),
});

const mockViaje = (overrides = {}): Viaje => ({
  id: 'viaje-uuid-001',
  tenantId: 'tenant-uuid-001',
  tenant: mockTenant(),
  numeroPlaca: 'ABC123',
  nombreConductor: 'Juan Pérez',
  modeloVehiculo: 'Corolla',
  anioVehiculo: '2022',
  latInicio: 10.48,
  lngInicio: -66.85,
  latDestino: 10.49,
  lngDestino: -66.86,
  estado: EstadoViaje.INICIADO,
  cnpoliza: null,
  cnrecibo: null,
  urlPolizaPDF: null,
  estadoPoliza: 'EMITIENDO',
  polizaError: null,
  polizaIntentos: 0,
  polizaUltimoIntento: null,
  webhookEnviado: false,
  webhookIntentos: 0,
  webhookUltimoError: null,
  metadata: { idempotencyKey: 'key-001', bodyOriginal: {} },
  creadoEn: new Date(),
  actualizadoEn: new Date(),
  finalizadoEn: null,
  ...overrides,
});

// ── Suite principal ───────────────────────────────────────────────────────────

describe('ViajeService', () => {
  let service: ViajeService;

  const mockViajeRepo = {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-001' }),
    getJob: jest.fn().mockResolvedValue(null),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        create: jest.fn().mockImplementation((_, data) => ({ ...data, id: 'viaje-uuid-001' })),
        save: jest.fn().mockImplementation((_, viaje) => Promise.resolve(viaje)),
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
      },
    }),
  };

  const mockSeguroService = {
    emitirPoliza: jest.fn(),
    finalizarPoliza: jest.fn().mockResolvedValue(undefined),
    verificarEmisionAsync: jest.fn(), // fire-and-forget — no lanza
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ViajeService,
        { provide: getRepositoryToken(Viaje), useValue: mockViajeRepo },
        { provide: getQueueToken(VIAJE_QUEUE), useValue: mockQueue },
        { provide: DataSource, useValue: mockDataSource },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: SeguroService, useValue: mockSeguroService },
      ],
    }).compile();

    service = module.get<ViajeService>(ViajeService);
    jest.clearAllMocks();
  });

  // ── INICIAR ─────────────────────────────────────────────────────────────────

  describe('iniciar()', () => {
    it('crea un viaje nuevo y emite póliza exitosamente', async () => {
      const tenant = mockTenant();
      const body = { placa: 'ABC123', nombre_tomador: 'Juan', fano: '2022' };

      // Sin viaje idempotente previo
      mockViajeRepo.findOne.mockResolvedValueOnce(null); // idempotencia
      mockViajeRepo.findOne.mockResolvedValueOnce(null); // dedup placa
      // El queryRunner crea y guarda el viaje
      mockSeguroService.emitirPoliza.mockResolvedValue({
        cnpoliza: '18-1-0000001234',
        cnrecibo: 'REC-001',
        urlpoliza: 'https://lamundial.com/poliza/123.pdf',
      });
      mockViajeRepo.update.mockResolvedValue({ affected: 1 });
      mockViajeRepo.findOne.mockResolvedValue(mockViaje({
        cnpoliza: '18-1-0000001234',
        estadoPoliza: 'ACTIVA',
      }));

      const result = await service.iniciar(body, tenant);

      expect(result.cnpoliza).toBe('18-1-0000001234');
      expect(result.estadoPoliza).toBe('ACTIVA');
      expect(mockSeguroService.emitirPoliza).toHaveBeenCalledTimes(1);
    });

    it('devuelve viaje existente en caso de idempotencia (mismo key)', async () => {
      const tenant = mockTenant();
      const existente = mockViaje({ estadoPoliza: 'ACTIVA', cnpoliza: 'POL-EXISTE' });

      // Primera consulta de idempotencia encuentra un viaje existente
      mockViajeRepo.findOne.mockResolvedValueOnce(existente);

      const result = await service.iniciar({ placa: 'ABC123' }, tenant, 'key-001');

      expect(result.id).toBe(existente.id);
      expect(result.cnpoliza).toBe('POL-EXISTE');
      // No debe crear nuevo viaje ni emitir nueva póliza
      expect(mockSeguroService.emitirPoliza).not.toHaveBeenCalled();
    });

    it('lanza ConflictException si la placa ya tiene viaje activo', async () => {
      const tenant = mockTenant();
      const viajeActivo = mockViaje({ numeroPlaca: 'ABC123', estado: EstadoViaje.INICIADO });

      mockViajeRepo.findOne.mockResolvedValueOnce(null);     // sin idempotencia
      mockViajeRepo.findOne.mockResolvedValueOnce(viajeActivo); // placa activa

      await expect(service.iniciar({ placa: 'ABC123' }, tenant))
        .rejects.toThrow(ConflictException);

      expect(mockSeguroService.emitirPoliza).not.toHaveBeenCalled();
    });

    it('guarda viaje con estado ERROR si La Mundial falla, sin lanzar excepción al cliente', async () => {
      const tenant = mockTenant();
      mockViajeRepo.findOne.mockResolvedValueOnce(null); // idempotencia
      mockViajeRepo.findOne.mockResolvedValueOnce(null); // dedup

      mockSeguroService.emitirPoliza.mockRejectedValue(new Error('La Mundial no responde'));
      mockViajeRepo.update.mockResolvedValue({ affected: 1 });
      mockViajeRepo.findOne.mockResolvedValue(mockViaje({ estadoPoliza: 'ERROR' }));

      const result = await service.iniciar({ placa: 'XYZ999' }, tenant);

      // El viaje se crea igualmente — cliente recibe 201
      expect(result).toBeDefined();
      expect(mockQueue.add).toHaveBeenCalledWith(
        'reintentar-poliza',
        expect.objectContaining({ tenantId: tenant.id }),
        expect.objectContaining({ attempts: 10 }), // 10 reintentos configurados
      );
    });

    it('continúa si BullMQ falla al encolar reintento (viaje ya guardado)', async () => {
      const tenant = mockTenant();
      mockViajeRepo.findOne.mockResolvedValueOnce(null);
      mockViajeRepo.findOne.mockResolvedValueOnce(null);

      mockSeguroService.emitirPoliza.mockRejectedValue(new Error('timeout'));
      mockQueue.add.mockRejectedValue(new Error('Redis no disponible'));
      mockViajeRepo.update.mockResolvedValue({ affected: 1 });
      mockViajeRepo.findOne.mockResolvedValue(mockViaje({ estadoPoliza: 'ERROR' }));

      // NO debe lanzar excepción — el viaje está guardado, el guardian lo rescatará
      await expect(service.iniciar({ placa: 'XYZ999' }, tenant)).resolves.toBeDefined();
    });
  });

  // ── FINALIZAR ───────────────────────────────────────────────────────────────

  describe('finalizar()', () => {
    it('finaliza viaje existente y elimina de BD', async () => {
      const tenant = mockTenant();
      const viaje = mockViaje({ cnpoliza: '18-1-0000001234', estadoPoliza: 'ACTIVA' });
      mockViajeRepo.findOne.mockResolvedValue(viaje);

      const result = await service.finalizar(viaje.id, tenant);

      expect(result.mensaje).toContain('finalizado');
      expect(result.idViaje).toBe(viaje.id);
      expect(result.cnpoliza).toBe('18-1-0000001234');
      expect(mockSeguroService.finalizarPoliza).toHaveBeenCalledWith(viaje, tenant);
    });

    it('lanza NotFoundException si el viaje no existe o no pertenece al tenant', async () => {
      mockViajeRepo.findOne.mockResolvedValue(null);

      await expect(service.finalizar('viaje-no-existe', mockTenant()))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ── LISTAR / OBTENER ────────────────────────────────────────────────────────

  describe('listar()', () => {
    it('devuelve datos paginados del tenant', async () => {
      const viajes = [mockViaje(), mockViaje({ id: 'viaje-uuid-002' })];
      mockViajeRepo.findAndCount.mockResolvedValue([viajes, 2]);

      const result = await service.listar(mockTenant(), 1, 50);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('limita el máximo a 100 registros por página', async () => {
      mockViajeRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.listar(mockTenant(), 1, 999);

      const callArgs = mockViajeRepo.findAndCount.mock.calls[0][0];
      expect(callArgs.take).toBe(100); // máximo 100
    });
  });

  describe('obtener()', () => {
    it('devuelve viaje por ID si pertenece al tenant', async () => {
      const viaje = mockViaje();
      mockViajeRepo.findOne.mockResolvedValue(viaje);

      const result = await service.obtener(viaje.id, mockTenant());
      expect(result.id).toBe(viaje.id);
    });

    it('lanza NotFoundException si el ID no existe', async () => {
      mockViajeRepo.findOne.mockResolvedValue(null);
      await expect(service.obtener('no-existe', mockTenant())).rejects.toThrow(NotFoundException);
    });
  });
});
