import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * EnvValidatorService — valida variables de entorno críticas al arrancar.
 *
 * Si falta alguna variable obligatoria, el proceso muere con un mensaje claro
 * en lugar de fallar silenciosamente más tarde con errores crípticos.
 */
@Injectable()
export class EnvValidatorService implements OnApplicationBootstrap {
  private readonly logger = new Logger('EnvValidator');

  constructor(private readonly config: ConfigService) {}

  onApplicationBootstrap() {
    const errors:   string[] = [];
    const warnings: string[] = [];

    // ── Variables obligatorias ──────────────────────────────────────────────
    const required: { key: string; desc: string }[] = [
      { key: 'DB_HOST',     desc: 'Host de PostgreSQL' },
      { key: 'DB_USERNAME', desc: 'Usuario de PostgreSQL' },
      { key: 'DB_PASSWORD', desc: 'Contraseña de PostgreSQL' },
      { key: 'DB_NAME',     desc: 'Nombre de la base de datos' },
    ];
    for (const { key, desc } of required) {
      if (!process.env[key]) errors.push(`${key} — ${desc}`);
    }

    // ── Variables de seguridad — obligatorias en producción ─────────────────
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    const isProduction = nodeEnv === 'production';

    const sessionSecret = process.env.SESSION_SECRET ?? '';
    const adminSecret   = process.env.ADMIN_SECRET ?? '';

    if (!sessionSecret) {
      if (isProduction) errors.push('SESSION_SECRET — requerido en producción');
      else warnings.push('SESSION_SECRET no configurado (se usará valor por defecto inseguro en dev)');
    } else if (sessionSecret.length < 32) {
      warnings.push(`SESSION_SECRET es muy corto (${sessionSecret.length} chars). Mínimo recomendado: 32`);
    } else if (this.isWeakSecret(sessionSecret)) {
      warnings.push('SESSION_SECRET parece un valor de ejemplo. Usa uno generado aleatoriamente en producción');
    }

    if (!adminSecret) {
      if (isProduction) errors.push('ADMIN_SECRET — requerido en producción');
      else warnings.push('ADMIN_SECRET no configurado — el panel de administración estará DESHABILITADO');
    } else if (adminSecret.length < 20) {
      warnings.push(`ADMIN_SECRET es muy corto (${adminSecret.length} chars). Mínimo recomendado: 32`);
    } else if (this.isWeakSecret(adminSecret)) {
      warnings.push('ADMIN_SECRET parece un valor de ejemplo. Usa uno generado aleatoriamente en producción');
    }

    // ── Redis — advertencia si no responde (no bloqueante) ──────────────────
    if (!process.env.REDIS_HOST) {
      warnings.push('REDIS_HOST no configurado — usando localhost por defecto');
    }

    // ── Mostrar resultado ───────────────────────────────────────────────────
    if (warnings.length > 0) {
      this.logger.warn('=== CONFIGURACION INCOMPLETA ===');
      for (const w of warnings) this.logger.warn(`  (!  ${w}`);
      if (!adminSecret) {
        this.logger.warn('  Para crear clientes, configura ADMIN_SECRET en backend/.env');
        this.logger.warn('  Genera uno con: node -e "process.stdout.write(require(\'crypto\').randomBytes(40).toString(\'hex\'))"');
      }
      this.logger.warn('================================');
    }

    if (errors.length > 0) {
      this.logger.error('=== VARIABLES OBLIGATORIAS FALTANTES ===');
      for (const e of errors) this.logger.error(`  ERR  ${e}`);
      this.logger.error('');
      this.logger.error('  Crea o edita backend/.env con los valores correctos.');
      this.logger.error('  Guia: cp backend/.env.example backend/.env');
      this.logger.error('=========================================');
      // En producción, terminar el proceso. En desarrollo, solo alertar.
      if (isProduction) {
        process.exit(1);
      }
    }

    if (errors.length === 0 && warnings.length === 0) {
      this.logger.log('Variables de entorno validadas correctamente');
    }
  }

  private isWeakSecret(value: string): boolean {
    const weakPatterns = ['cambia', 'change', 'secret', 'example', 'test', 'dev-session', 'placeholder', '12345'];
    return weakPatterns.some(p => value.toLowerCase().includes(p));
  }
}
