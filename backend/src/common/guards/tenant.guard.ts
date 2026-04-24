import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { TenantService } from '../../modules/tenant/tenant.service';
import { SessionService } from '../session/session.service';

/**
 * Estrategia de autenticación (prioridad):
 *  1. X-Session-Token: token de sesión emitido por POST /api/auth/session
 *     → La API key cruda solo viaja UNA vez. Recomendado para el frontend.
 *  2. X-Api-Key / Authorization: Bearer  → backward-compatible para clientes directos.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // ── 1. Intentar session token (frontend seguro) ──────────────────────────
    const sessionToken = request.headers['x-session-token'] as string | undefined;
    if (sessionToken) {
      const tenantId = this.sessionService.verify(sessionToken);
      if (!tenantId) {
        this.logger.warn(`Session token inválido o expirado desde IP: ${request.ip}`);
        throw new UnauthorizedException('Sesión inválida o expirada. Vuelva a conectarse.');
      }
      const tenant = await this.tenantService.findById(tenantId);
      if (!tenant || !tenant.activo) {
        throw new UnauthorizedException('Tenant inactivo o no encontrado.');
      }
      request.tenant = tenant;
      return true;
    }

    // ── 2. Fallback: X-Api-Key / Authorization Bearer (clientes directos) ───
    const apiKey =
      request.headers['x-api-key'] ||
      request.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
      throw new UnauthorizedException(
        'Autenticación requerida. Use X-Session-Token (recomendado) o X-Api-Key.',
      );
    }

    const tenant = await this.tenantService.findByApiKey(apiKey as string);
    if (!tenant) {
      this.logger.warn(`API key inválida desde IP: ${request.ip}`);
      throw new UnauthorizedException('API key inválida o tenant inactivo.');
    }

    request.tenant = tenant;
    return true;
  }
}
