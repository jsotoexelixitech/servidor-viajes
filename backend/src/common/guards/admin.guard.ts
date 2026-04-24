import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Protege las rutas /admin/tenants.
 * Requiere el header  X-Admin-Key: <ADMIN_SECRET>  o
 *                     Authorization: Bearer <ADMIN_SECRET>
 *
 * Si ADMIN_SECRET no está configurado en .env, el guard rechaza TODAS las
 * peticiones para forzar que el operador configure el secreto en producción.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const adminSecret = this.configService.get<string>('security.adminSecret');

    if (!adminSecret) {
      this.logger.error('ADMIN_SECRET no configurado — acceso admin denegado.');
      throw new UnauthorizedException('Rutas admin no disponibles: configure ADMIN_SECRET en .env');
    }

    const req = context.switchToHttp().getRequest();
    const provided =
      req.headers['x-admin-key'] ||
      req.headers['authorization']?.replace('Bearer ', '');

    if (!provided || provided !== adminSecret) {
      this.logger.warn(`Intento de acceso admin no autorizado desde IP: ${req.ip}`);
      throw new UnauthorizedException('Credencial de administrador inválida.');
    }

    return true;
  }
}
