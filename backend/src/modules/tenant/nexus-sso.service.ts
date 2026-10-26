import {
  ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as crypto from 'crypto';
import { Tenant } from './entities/tenant.entity';

/** Payload del nexus_token (tenant_access) que Nexus pone en la URL del módulo. */
export interface NexusTokenPayload {
  type: string;
  empresaId: number;
  submoduloId: number;
  empresaNombre?: string;
  metadata?: Record<string, unknown>;
  exp?: number;
}

/**
 * SSO desde Nexus, con el mismo patrón que los módulos RCV (nexusAuth):
 *  1. firma HS256 del nexus_token con TENANT_TOKEN_SECRET (el mismo de nexus-api);
 *  2. heartbeat a nexus-api para confirmar que la empresa y el módulo siguen activos;
 *  3. empresa Nexus → flota (tenant) de este servicio.
 */
@Injectable()
export class NexusSsoService {
  private readonly logger = new Logger(NexusSsoService.name);

  constructor(@InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>) {}

  verificar(token: string): NexusTokenPayload {
    const secret = process.env.TENANT_TOKEN_SECRET || '';
    if (!secret) throw new UnauthorizedException('TENANT_TOKEN_SECRET no está configurado en este servidor.');

    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Token inválido.');
    const [h, p, s] = parts;
    let header: { alg?: string };
    let payload: NexusTokenPayload;
    try {
      header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Token inválido.');
    }
    if (header.alg !== 'HS256') throw new UnauthorizedException('Algoritmo de token no soportado.');

    const esperado = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
    const a = Buffer.from(s);
    const b = Buffer.from(esperado);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Token inválido o firmado con otro secreto.');
    }
    if (payload.type !== 'tenant_access') throw new UnauthorizedException('Tipo de token inválido.');
    if (!payload.empresaId || !payload.submoduloId) {
      throw new UnauthorizedException('El token no contiene empresaId/submoduloId.');
    }
    const esperados = (process.env.NEXUS_EXPECTED_SUBMODULO_IDS || '')
      .split(',').map((x) => Number(x.trim())).filter(Boolean);
    if (esperados.length && !esperados.includes(Number(payload.submoduloId))) {
      throw new ForbiddenException(
        `Token emitido para el submódulo ${payload.submoduloId}; este servicio espera ${esperados.join(', ')}.`,
      );
    }
    // La expiración (1 h) no se exige aquí: el heartbeat decide si la empresa sigue activa, igual que en los módulos.
    return payload;
  }

  /** Heartbeat a Nexus. Si nexus-api no responde, no bloquea (como en los módulos). */
  async heartbeat(token: string): Promise<{ active: boolean; reason?: string; empresaNombre?: string }> {
    const base = (process.env.NEXUS_API_URL || '').replace(/\/$/, '');
    if (!base) return { active: true };
    try {
      const { data } = await axios.post<{ active?: boolean; reason?: string; empresaNombre?: string }>(
        `${base}/api/access/heartbeat`, {},
        { headers: { Authorization: `Bearer ${token}` }, timeout: 5000, validateStatus: (st) => st < 500 },
      );
      if (data?.active === false) return { active: false, reason: data.reason };
      return { active: true, empresaNombre: data?.empresaNombre };
    } catch (e) {
      this.logger.warn(`Heartbeat a Nexus sin respuesta: ${(e as Error).message}`);
      return { active: true };
    }
  }

  /**
   * Empresa Nexus → flota. Orden: FLOTA_NEXUS_TENANT_MAP ("empresaId:nombreFlota,..."),
   * FLOTA_NEXUS_TENANT_DEFAULT (nombre), y si solo hay una flota activa, esa.
   */
  async resolverTenant(empresaId: number): Promise<Tenant> {
    const pares = (process.env.FLOTA_NEXUS_TENANT_MAP || '').split(',').map((x) => x.trim()).filter(Boolean);
    for (const par of pares) {
      const [id, nombre] = par.split(':');
      if (Number(id) === Number(empresaId) && nombre) {
        const t = await this.tenantRepo.findOne({ where: { nombre: nombre.trim(), activo: true } });
        if (t) return t;
      }
    }
    const def = (process.env.FLOTA_NEXUS_TENANT_DEFAULT || '').trim();
    if (def) {
      const t = await this.tenantRepo.findOne({ where: { nombre: def, activo: true } });
      if (t) return t;
    }
    const activos = await this.tenantRepo.find({ where: { activo: true } });
    if (activos.length === 1) return activos[0];
    throw new NotFoundException(
      `La empresa Nexus ${empresaId} no está vinculada a ninguna flota. Configura FLOTA_NEXUS_TENANT_MAP o FLOTA_NEXUS_TENANT_DEFAULT.`,
    );
  }
}
