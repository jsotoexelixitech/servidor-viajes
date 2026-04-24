import { PolizaGuardianService } from './poliza-guardian.service';
import { Viaje } from '../viaje/entities/viaje.entity';

const makeViaje = (overrides = {}): Partial<Viaje> => ({
  id: `viaje-${Math.random().toString(36).slice(2, 8)}`,
  tenantId: 'tenant-001',
  numeroPlaca: 'ABC123',
  estadoPoliza: 'ERROR' as any,
  polizaIntentos: 1,
  polizaUltimoIntento: new Date(Date.now() - 10 * 60 * 1000), // 10min atrás → rescatable
  creadoEn: new Date(Date.now() - 15 * 60 * 1000),
  ...overrides,
});

describe('PolizaGuardianService', () => {
  let service: PolizaGuardianService;

  const mockRepo = {
    find: jest.fn(),
    count: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-rescate-001' }),
    getJob: jest.fn().mockResolvedValue(null),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueue.add.mockResolvedValue({ id: 'job-rescate-001' });
    mockQueue.getJob.mockResolvedValue(null);
    const mockRedis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') };
    service = new PolizaGuardianService(mockRepo as any, mockQueue as any, mockRedis as any);
  });

  // ── ESCANEO PERIÓDICO ────────────────────────────────────────────────────────

  describe('escanearPolizasPendientes()', () => {
    it('no hace nada si no hay viajes pendientes', async () => {
      mockRepo.find.mockResolvedValue([]);

      await service.escanearPolizasPendientes();

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('re-encola viajes con estadoPoliza ERROR rescatables', async () => {
      const viajeError = makeViaje({ estadoPoliza: 'ERROR' as any, polizaIntentos: 2 });
      mockRepo.find.mockResolvedValue([viajeError]);

      await service.escanearPolizasPendientes();

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'reintentar-poliza',
        expect.objectContaining({ viajeId: viajeError.id }),
        expect.objectContaining({ attempts: 5 }),
      );
      expect(mockRepo.update).toHaveBeenCalledWith(
        viajeError.id,
        expect.objectContaining({ polizaUltimoIntento: expect.any(Date) }),
      );
    });

    it('re-encola viajes CRITICO (todos los reintentos de BullMQ agotados)', async () => {
      const viajeCritico = makeViaje({ estadoPoliza: 'CRITICO' as any, polizaIntentos: 10 });
      mockRepo.find.mockResolvedValue([viajeCritico]);

      await service.escanearPolizasPendientes();

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('omite viajes que ya tienen job en cola (sin duplicar)', async () => {
      const viaje = makeViaje();
      mockRepo.find.mockResolvedValue([viaje]);
      mockQueue.getJob.mockResolvedValue({ id: `poliza-${viaje.id}`, data: {} });

      await service.escanearPolizasPendientes();

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('omite viajes con último intento hace menos de 4 minutos (cooldown)', async () => {
      const viajeReciente = makeViaje({
        polizaUltimoIntento: new Date(Date.now() - 1 * 60 * 1000), // 1min atrás → en cooldown
      });
      mockRepo.find.mockResolvedValue([viajeReciente]);

      await service.escanearPolizasPendientes();

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('omite viajes con más de MAX_INTENTOS_GUARDIAN', async () => {
      const viajeExhausto = makeViaje({ polizaIntentos: 55 });
      mockRepo.find.mockResolvedValue([viajeExhausto]);

      await service.escanearPolizasPendientes();

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('continúa con otros viajes si falla el encolado de uno', async () => {
      const viaje1 = makeViaje({ id: 'viaje-fail-001' });
      const viaje2 = makeViaje({ id: 'viaje-ok-002' });
      mockRepo.find.mockResolvedValue([viaje1, viaje2]);

      mockQueue.add
        .mockRejectedValueOnce(new Error('Redis timeout'))
        .mockResolvedValueOnce({ id: 'job-002' });

      await service.escanearPolizasPendientes();

      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });
  });

  // ── RESUMEN CRÍTICOS ────────────────────────────────────────────────────────

  describe('obtenerResumenCriticos()', () => {
    it('devuelve contadores correctos y lista de viajes problemáticos', async () => {
      mockRepo.count
        .mockResolvedValueOnce(2)  // criticos
        .mockResolvedValueOnce(5)  // errores
        .mockResolvedValueOnce(1); // atascados

      mockRepo.find.mockResolvedValue([makeViaje(), makeViaje(), makeViaje()]);

      const result = await service.obtenerResumenCriticos();

      expect(result.total).toBe(8);
      expect(result.criticos).toBe(2);
      expect(result.errores).toBe(5);
      expect(result.atascados).toBe(1);
      expect(result.detalle).toHaveLength(3);
    });

    it('devuelve lista vacía si no hay viajes problemáticos', async () => {
      mockRepo.count.mockResolvedValue(0);
      mockRepo.find.mockResolvedValue([]);

      const result = await service.obtenerResumenCriticos();

      expect(result.total).toBe(0);
      expect(result.detalle).toHaveLength(0);
    });
  });
});
