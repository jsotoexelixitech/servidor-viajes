import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { TenantService } from '../../modules/tenant/tenant.service';

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(private readonly tenantService: TenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey =
      request.headers['x-api-key'] ||
      request.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
      throw new UnauthorizedException('API key requerida. Envíe el header X-Api-Key.');
    }

    const tenant = await this.tenantService.findByApiKey(apiKey as string);
    if (!tenant) {
      this.logger.warn(`Intento de acceso con API key inválida desde IP: ${request.ip}`);
      throw new UnauthorizedException('API key inválida o tenant inactivo.');
    }

    // Adjuntar el tenant al request para uso en controladores
    request.tenant = tenant;
    return true;
  }
}
