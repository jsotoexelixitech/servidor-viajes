import { Injectable, Logger, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Redis } from 'ioredis';
import { Tenant } from './entities/tenant.entity';
import { CrearTenantDto } from './dto/crear-tenant.dto';
import { ConfigurarSeguroDto } from '../seguro/dto/seguro-config.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  /**
   * Caché de tenants en Redis compartida entre todos los workers del cluster.
   * TTL de 60 segundos — un tenant creado en el Worker A es visible en todos
   * los demás workers en el próximo request (sin esperar expiración por worker).
   */
  private readonly CACHE_TTL_SECONDS = 60;
  private readonly CACHE_PREFIX = 'tenant:apikey:';

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  async findByApiKey(apiKey: string): Promise<Tenant | null> {
    // 1. Intentar caché Redis (compartida entre workers)
    try {
      const cached = await this.redis.get(`${this.CACHE_PREFIX}${apiKey}`);
      if (cached) {
        return JSON.parse(cached) as Tenant;
      }
    } catch {
      // Redis no disponible — continuar con consulta a BD
    }

    // 2. Consultar BD
    const tenant = await this.tenantRepo.findOne({ where: { apiKey, activo: true } });
    if (tenant) {
      // 3. Guardar en caché Redis para los próximos 60s
      try {
        await this.redis.set(
          `${this.CACHE_PREFIX}${apiKey}`,
          JSON.stringify(tenant),
          'EX', this.CACHE_TTL_SECONDS,
        );
      } catch {
        // Redis no disponible — continuar sin caché
      }
    }
    return tenant;
  }

  async crear(dto: CrearTenantDto): Promise<Tenant> {
    const existe = await this.tenantRepo.findOne({ where: { nombre: dto.nombre } });
    if (existe) throw new ConflictException(`Ya existe un tenant con nombre "${dto.nombre}"`);

    const apiKey = randomBytes(48).toString('hex');
    const tenant = this.tenantRepo.create({
      nombre: dto.nombre,
      apiKey,
      webhookUrl: dto.webhookUrl,
      webhookSecret: dto.webhookSecret,
      rateLimit: dto.rateLimit,
      config: dto.config,
    });

    const saved = await this.tenantRepo.save(tenant);
    this.logger.log(`Tenant creado: ${saved.nombre} (id: ${saved.id})`);
    return saved;
  }

  async listar(): Promise<Omit<Tenant, 'apiKey'>[]> {
    const tenants = await this.tenantRepo.find({ order: { creadoEn: 'DESC' } });
    return tenants.map(({ apiKey, ...rest }) => rest as Tenant);
  }

  async desactivar(id: string): Promise<void> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    tenant.activo = false;
    await this.tenantRepo.save(tenant);
    await this.invalidarCache(tenant.apiKey);
    this.logger.log(`Tenant desactivado: ${tenant.nombre}`);
  }

  async invalidarCache(apiKey: string): Promise<void> {
    try {
      await this.redis.del(`${this.CACHE_PREFIX}${apiKey}`);
    } catch {
      // Redis no disponible — la caché expirará sola en 60s
    }
  }

  async obtenerConfig(tenant: Tenant): Promise<Omit<Tenant, 'apiKey'>> {
    const fresh = await this.tenantRepo.findOne({ where: { id: tenant.id } });
    if (!fresh) throw new NotFoundException('Tenant no encontrado');
    const { apiKey, ...rest } = fresh;
    return rest as Tenant;
  }

  async configurarSeguro(tenant: Tenant, dto: ConfigurarSeguroDto): Promise<Omit<Tenant, 'apiKey'>> {
    const existing = await this.tenantRepo.findOne({ where: { id: tenant.id } });
    if (!existing) throw new NotFoundException('Tenant no encontrado');

    const cleanedMappings: Record<string, string> = {};
    if (dto.fieldMappings) {
      for (const [key, value] of Object.entries(dto.fieldMappings)) {
        if (value && String(value).trim()) {
          cleanedMappings[key] = String(value).trim();
        }
      }
    }

    const newConfig = {
      ...(existing.config || {}),
      seguroConfig: dto.seguroConfig,
      defaultValues: dto.defaultValues ?? existing.config?.defaultValues ?? {},
      fieldMappings: Object.keys(cleanedMappings).length > 0 ? cleanedMappings : (existing.config?.fieldMappings ?? {}),
    };

    // Usar update() con JSON.parse/stringify para forzar detección de cambios en TypeORM JSONB
    await this.tenantRepo.update(existing.id, { config: JSON.parse(JSON.stringify(newConfig)) });
    await this.invalidarCache(tenant.apiKey);

    this.logger.log(`Configuración de seguro actualizada para tenant=${tenant.nombre}`);

    const updated = await this.tenantRepo.findOne({ where: { id: existing.id } });
    const { apiKey, ...rest } = updated!;
    return rest as Tenant;
  }

  obtenerMapeos(tenant: Tenant): Record<string, string> {
    return (tenant.config?.fieldMappings as Record<string, string>) || {};
  }
}
