import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Tokens de sesión stateless basados en HMAC-SHA256.
 *
 * Formato del token (base64url): <tenantId>.<windowId>.<hmac>
 * - windowId = Math.floor(Date.now() / (ttlHours * 3600 * 1000))
 *   → el mismo valor durante toda la ventana de tiempo → token cambia
 *     automáticamente cada TTL horas sin almacenamiento en BD/Redis.
 * - HMAC cubre tenantId + windowId → no se puede forjar sin SESSION_SECRET.
 *
 * Ventajas:
 * - Stateless: no requiere Redis ni BD.
 * - La API key cruda solo viaja una vez (al hacer login).
 * - Funciona con cluster PM2 multi-proceso (sin estado compartido).
 * - Compatible con invalidación manual: cambiar SESSION_SECRET invalida todos.
 */
@Injectable()
export class SessionService {
  private readonly secret: string;
  private readonly ttlMs: number;

  constructor(private readonly config: ConfigService) {
    this.secret  = config.get<string>('security.sessionSecret');
    const hours  = config.get<number>('security.sessionTtlHours') || 8;
    this.ttlMs   = hours * 3600 * 1000;
  }

  /** Genera un token de sesión para el tenantId dado. */
  generate(tenantId: string): { token: string; expiresAt: string } {
    const windowId   = Math.floor(Date.now() / this.ttlMs);
    const hmac       = this.computeHmac(tenantId, windowId);
    const raw        = `${tenantId}.${windowId}.${hmac}`;
    const token      = Buffer.from(raw).toString('base64url');

    const expiresAt  = new Date((windowId + 1) * this.ttlMs).toISOString();
    return { token, expiresAt };
  }

  /**
   * Verifica el token y devuelve el tenantId si es válido.
   * Acepta la ventana actual Y la anterior (evita expiry abrupto en el borde).
   */
  verify(token: string): string | null {
    try {
      const raw    = Buffer.from(token, 'base64url').toString('utf8');
      const parts  = raw.split('.');
      if (parts.length !== 3) return null;

      const [tenantId, windowIdStr, providedHmac] = parts;
      const windowId = parseInt(windowIdStr, 10);
      if (isNaN(windowId)) return null;

      const currentWindow = Math.floor(Date.now() / this.ttlMs);

      // Aceptar ventana actual o la anterior (gracia de 1 ventana)
      const valid = [currentWindow, currentWindow - 1].some(w => {
        const expected = this.computeHmac(tenantId, w);
        return crypto.timingSafeEqual(
          Buffer.from(providedHmac, 'hex'),
          Buffer.from(expected, 'hex'),
        );
      });

      return valid ? tenantId : null;
    } catch {
      return null;
    }
  }

  private computeHmac(tenantId: string, windowId: number): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(`${tenantId}:${windowId}`)
      .digest('hex');
  }
}
