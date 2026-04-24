import { ConflictException, NotFoundException } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { Tenant } from './entities/tenant.entity';

// ── Helpers ────────────────────────────────────────────────────────────────

const mockTenantData = (): Tenant => ({
  id: 'tenant-uuid-001',
  nombre: 'Ridery S.A.',
  apiKey: 'apikey-abc123',
  activo: true,
  webhookUrl: 'https://ridery.com/webhook',
  webhookSecret: 'secret123',
  rateLimit: 5000,
  config: {
    fieldMappings: { placa: 'numPlaca', fano: 'year' },
    defaultValues: { ccodpro: '0042' },
    seguroConfig: { baseUrl: 'https://api.lamundial.com.ve', plan: 'A' },
  },
  creadoEn: new Date('2026-01-01'),
  actualizadoEn: new Date('2026-01-01'),
});

describe('TenantService', () => {
  let service: TenantService;
  let mockRedis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  const mockRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    service = new TenantService(mockRepo as any, mockRedis as any);
  });

  // ── CREAR ───────────────────────────────────────────────────────────────────

  describe('crear()', () => {
    it('crea un tenant nuevo con apiKey aleatoria (96 hex chars)', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const savedTenant = { ...mockTenantData(), apiKey: 'a'.repeat(96) };
      mockRepo.create.mockReturnValue(savedTenant);
      mockRepo.save.mockResolvedValue(savedTenant);

      const result = await service.crear({ nombre: 'Ridery S.A.' });

      expect(result.nombre).toBe('Ridery S.A.');
      expect(result.apiKey).toBeTruthy();
      // randomBytes(48).toString('hex') = 96 chars
      expect(result.apiKey.length).toBe(96);
    });

    it('lanza ConflictException si ya existe un tenant con ese nombre', async () => {
      mockRepo.findOne.mockResolvedValue(mockTenantData());

      await expect(service.crear({ nombre: 'Ridery S.A.' }))
        .rejects.toThrow(ConflictException);

      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── BUSCAR POR API KEY (con caché Redis) ─────────────────────────────────

  describe('findByApiKey()', () => {
    it('consulta BD si no hay caché y guarda en Redis', async () => {
      const tenant = mockTenantData();
      mockRepo.findOne.mockResolvedValue(tenant);

      const result = await service.findByApiKey('apikey-abc123');

      expect(result!.nombre).toBe('Ridery S.A.');
      expect(mockRepo.findOne).toHaveBeenCalledTimes(1);
      // Debe guardar en Redis después de consultar BD
      expect(mockRedis.set).toHaveBeenCalledWith(
        'tenant:apikey:apikey-abc123',
        expect.any(String),
        'EX',
        60,
      );
    });

    it('sirve desde caché Redis en la segunda llamada (sin tocar BD)', async () => {
      const tenant = mockTenantData();
      // Primera llamada: caché vacía → va a BD → guarda en Redis
      mockRepo.findOne.mockResolvedValue(tenant);
      mockRedis.get.mockResolvedValueOnce(null); // primera llamada: sin caché

      await service.findByApiKey('apikey-abc123');

      // Segunda llamada: Redis tiene el valor
      const cached = JSON.stringify(tenant);
      mockRedis.get.mockResolvedValueOnce(cached);

      const result2 = await service.findByApiKey('apikey-abc123');
      expect(result2!.nombre).toBe('Ridery S.A.');
      expect(mockRepo.findOne).toHaveBeenCalledTimes(1); // BD solo se consultó 1 vez
    });

    it('devuelve null para apiKey inexistente', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.findByApiKey('key-no-existe');
      expect(result).toBeNull();
    });

    it('va a BD si Redis falla (fallback gracioso)', async () => {
      const tenant = mockTenantData();
      mockRedis.get.mockRejectedValue(new Error('Redis connection refused'));
      mockRepo.findOne.mockResolvedValue(tenant);

      const result = await service.findByApiKey('apikey-abc123');
      expect(result!.nombre).toBe('Ridery S.A.');
      expect(mockRepo.findOne).toHaveBeenCalledTimes(1);
    });
  });

  // ── LISTAR ──────────────────────────────────────────────────────────────────

  describe('listar()', () => {
    it('retorna lista sin exponer apiKey', async () => {
      mockRepo.find.mockResolvedValue([mockTenantData()]);

      const result = await service.listar();

      expect(result).toHaveLength(1);
      expect((result[0] as any).apiKey).toBeUndefined();
    });
  });

  // ── DESACTIVAR ──────────────────────────────────────────────────────────────

  describe('desactivar()', () => {
    it('desactiva tenant e invalida caché en Redis', async () => {
      const tenant = mockTenantData();
      mockRepo.findOne.mockResolvedValue(tenant);
      mockRepo.save.mockResolvedValue({ ...tenant, activo: false });

      await service.desactivar('tenant-uuid-001');

      expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ activo: false }));
      expect(mockRedis.del).toHaveBeenCalledWith('tenant:apikey:apikey-abc123');
    });

    it('lanza NotFoundException si el tenant no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.desactivar('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ── OBTENER MAPEOS ──────────────────────────────────────────────────────────

  describe('obtenerMapeos()', () => {
    it('retorna el mapa de campos configurado', () => {
      const tenant = mockTenantData();
      expect(service.obtenerMapeos(tenant)).toEqual({ placa: 'numPlaca', fano: 'year' });
    });

    it('retorna objeto vacío si no hay mapeos configurados', () => {
      const tenant = { ...mockTenantData(), config: {} };
      expect(service.obtenerMapeos(tenant)).toEqual({});
    });
  });

  // ── CONFIGURAR SEGURO ───────────────────────────────────────────────────────

  describe('configurarSeguro()', () => {
    it('guarda configuración y elimina fieldMappings vacíos', async () => {
      const tenant = mockTenantData();
      const updatedTenant = { ...tenant };
      mockRepo.findOne
        .mockResolvedValueOnce(tenant)   // primera consulta (existing)
        .mockResolvedValueOnce(updatedTenant); // segunda (post-update)
      mockRepo.save.mockResolvedValue(updatedTenant);

      const result = await service.configurarSeguro(tenant, {
        seguroConfig: { baseUrl: 'https://api.lamundial.com.ve', plan: 'A', cramo: 1310, frecuencia: 'DI' },
        fieldMappings: { placa: 'numPlaca', fano: '' }, // fano vacío → eliminado
        defaultValues: {},
      });

      // El update fue llamado con fieldMappings sin el campo vacío
      const updateCall = mockRepo.update.mock.calls[0][1];
      expect(updateCall.config.fieldMappings).toEqual({ placa: 'numPlaca' });
      expect((result as any).apiKey).toBeUndefined();
    });
  });
});
