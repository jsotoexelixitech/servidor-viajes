import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './entities/tenant.entity';
import { SessionService } from '../../common/session/session.service';

/**
 * Acceso directo (demo / red interna): abrir la pantalla por el link sin Nexus ni API key.
 * APAGADO por defecto. Solo con FLOTA_ACCESO_DIRECTO=1 se entrega un session token de la flota
 * FLOTA_ACCESO_DIRECTO_TENANT (o FLOTA_NEXUS_TENANT_DEFAULT). Nunca se entrega la API key.
 * Es acceso SIN autenticación: usar solo en red interna o demo.
 */
export function accesoDirectoActivo(): boolean {
  return (process.env.FLOTA_ACCESO_DIRECTO || '').trim() === '1';
}

export function accesoDirectoTenant(): string {
  return (process.env.FLOTA_ACCESO_DIRECTO_TENANT || process.env.FLOTA_NEXUS_TENANT_DEFAULT || '').trim();
}

@Injectable()
export class AccesoDirectoService {
  private readonly logger = new Logger(AccesoDirectoService.name);

  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly sessionService: SessionService,
  ) {}

  async iniciar(ip?: string) {
    // Con la bandera apagada el endpoint se comporta como si no existiera.
    if (!accesoDirectoActivo()) throw new NotFoundException('Cannot POST /api/auth/directo');
    const nombre = accesoDirectoTenant();
    if (!nombre) throw new NotFoundException('Acceso directo sin flota configurada (FLOTA_ACCESO_DIRECTO_TENANT).');
    const tenant = await this.tenantRepo.findOne({ where: { nombre, activo: true } });
    if (!tenant) throw new NotFoundException(`La flota "${nombre}" no existe o está inactiva.`);

    this.logger.warn(`Acceso directo (sin autenticación) a la flota "${tenant.nombre}" desde ${ip ?? '?'}`);
    const { token, expiresAt } = this.sessionService.generate(tenant.id);
    return {
      sessionToken: token,
      expiresAt,
      tenant: { id: tenant.id, nombre: tenant.nombre },
      ui: tenant.config?.ui ?? null,
      directo: true,
    };
  }
}
