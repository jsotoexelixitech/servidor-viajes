import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Redis } from 'ioredis';
import { Viaje } from '../viaje/entities/viaje.entity';
import { VIAJE_QUEUE, VIAJE_JOB_REINTENTAR_POLIZA } from '../viaje/viaje.service';

/**
 * PolizaGuardianService — Red de seguridad para emisión de pólizas.
 *
 * Problema que resuelve:
 *   Si BullMQ falla (Redis caído, crash del servidor, etc.), los jobs de reintento
 *   pueden perderse. Este servicio escanea la BD cada 5 minutos buscando viajes
 *   con póliza sin emitir y los re-encola automáticamente.
 *
 * Protección contra ejecución duplicada en cluster:
 *   Usa un distributed lock en Redis (SET NX EX) para garantizar que solo UN
 *   worker del cluster ejecuta el escaneo por ciclo, incluso con 8+ workers.
 *   Si Redis no está disponible, el lock falla abierto (el primer worker ejecuta).
 *
 * Cobertura:
 *   - estadoPoliza = 'ERROR':   Primer error, BullMQ debería retomar, pero por si acaso.
 *   - estadoPoliza = 'CRITICO': BullMQ agotó reintentos → escáner da otra oportunidad.
 *   - estadoPoliza = 'EMITIENDO' >5min: El proceso murió a mitad → rescatar.
 */
@Injectable()
export class PolizaGuardianService {
  private readonly logger = new Logger(PolizaGuardianService.name);

  private readonly MAX_INTENTOS_GUARDIAN = 50;
  private readonly MIN_ESPERA_ENTRE_REINTENTOS_MS = 4 * 60 * 1000; // 4 minutos

  // Lock distribuido: expira en 4 min para que el próximo ciclo (5min) siempre ejecute
  private readonly LOCK_KEY = 'guardian:poliza:lock';
  private readonly LOCK_TTL_SECONDS = 240; // 4 minutos

  constructor(
    @InjectRepository(Viaje)
    private readonly viajeRepo: Repository<Viaje>,
    @InjectQueue(VIAJE_QUEUE)
    private readonly viajeQueue: Queue,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  /**
   * Adquiere un distributed lock en Redis usando SET NX EX.
   * Retorna true si este worker adquirió el lock (puede ejecutar).
   * Retorna false si otro worker ya tiene el lock (saltar este ciclo).
   */
  private async acquireLock(): Promise<boolean> {
    try {
      const workerId = `${process.pid}-${Date.now()}`;
      const result = await this.redis.set(
        this.LOCK_KEY,
        workerId,
        'EX', this.LOCK_TTL_SECONDS,
        'NX', // Solo setear si NO existe (atómico)
      );
      return result === 'OK';
    } catch {
      // Redis no disponible — ejecutar de todas formas (fallback seguro)
      return true;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async escanearPolizasPendientes(): Promise<void> {
    // Distributed lock: solo un worker del cluster ejecuta por ciclo
    const acquired = await this.acquireLock();
    if (!acquired) {
      return; // Otro worker ya está ejecutando este ciclo
    }

    const ahora = new Date();
    const hace5min = new Date(ahora.getTime() - this.MIN_ESPERA_ENTRE_REINTENTOS_MS);

    try {
      const viajesPendientes = await this.viajeRepo.find({
        where: [
          { estadoPoliza: 'ERROR' as any },
          { estadoPoliza: 'CRITICO' as any },
          { estadoPoliza: 'EMITIENDO' as any, creadoEn: LessThan(hace5min) },
        ],
        select: ['id', 'tenantId', 'estadoPoliza', 'polizaIntentos', 'polizaUltimoIntento', 'creadoEn', 'numeroPlaca'],
        take: 100,
      });

      if (viajesPendientes.length === 0) return;

      let rescatados = 0;
      let omitidos = 0;
      let enColaYa = 0;

      for (const viaje of viajesPendientes) {
        if (viaje.polizaUltimoIntento && viaje.polizaUltimoIntento > hace5min) {
          omitidos++;
          continue;
        }

        if ((viaje.polizaIntentos ?? 0) >= this.MAX_INTENTOS_GUARDIAN) {
          this.logger.error(
            `🚨 [GUARDIAN-CRÍTICO] Viaje ${viaje.id} | placa=${viaje.numeroPlaca}` +
            ` | ${viaje.polizaIntentos} intentos agotados.` +
            ` REQUIERE INTERVENCIÓN MANUAL en /api/admin/polizas-criticas`,
          );
          omitidos++;
          continue;
        }

        const jobExistente = await this.viajeQueue.getJob(`poliza-${viaje.id}`).catch(() => null);
        if (jobExistente) {
          enColaYa++;
          continue;
        }

        try {
          // jobId fijo por viaje para prevenir duplicados si el lock falla
          await this.viajeQueue.add(
            VIAJE_JOB_REINTENTAR_POLIZA,
            { viajeId: viaje.id, tenantId: viaje.tenantId },
            {
              attempts: 5,
              backoff: { type: 'exponential', delay: 30_000 },
              removeOnComplete: true,
              removeOnFail: false,
              delay: 5_000,
              jobId: `guardian-${viaje.id}`, // ID estable → BullMQ ignora duplicados
            },
          );

          await this.viajeRepo.update(viaje.id, {
            polizaUltimoIntento: new Date(),
            estadoPoliza: 'ERROR' as any,
          });

          rescatados++;
          this.logger.warn(
            `[Guardian] 🔄 Rescatando viaje ${viaje.id} | placa=${viaje.numeroPlaca}` +
            ` | estado=${viaje.estadoPoliza} | intentos=${viaje.polizaIntentos}`,
          );
        } catch (queueErr) {
          this.logger.error(`[Guardian] No se pudo re-encolar viaje ${viaje.id}: ${queueErr.message}`);
        }
      }

      if (rescatados > 0 || viajesPendientes.length > omitidos + enColaYa) {
        this.logger.warn(
          `[Guardian] Ciclo completado (PID ${process.pid}): ${rescatados} rescatados | ${enColaYa} ya en cola | ${omitidos} omitidos`,
        );
      }
    } catch (err) {
      this.logger.error(`[Guardian] Error en escaneo: ${err.message}`);
    }
  }

  async obtenerResumenCriticos(): Promise<{
    total: number;
    criticos: number;
    errores: number;
    atascados: number;
    detalle: Partial<Viaje>[];
  }> {
    const hace10min = new Date(Date.now() - 10 * 60 * 1000);

    const [criticos, errores, atascados] = await Promise.all([
      this.viajeRepo.count({ where: { estadoPoliza: 'CRITICO' as any } }),
      this.viajeRepo.count({ where: { estadoPoliza: 'ERROR' as any } }),
      this.viajeRepo.count({ where: { estadoPoliza: 'EMITIENDO' as any, creadoEn: LessThan(hace10min) } }),
    ]);

    const detalle = criticos + errores + atascados > 0
      ? await this.viajeRepo.find({
          where: [
            { estadoPoliza: 'CRITICO' as any },
            { estadoPoliza: 'ERROR' as any },
            { estadoPoliza: 'EMITIENDO' as any, creadoEn: LessThan(hace10min) },
          ],
          select: ['id', 'tenantId', 'numeroPlaca', 'estadoPoliza', 'polizaIntentos', 'polizaError', 'polizaUltimoIntento', 'creadoEn'],
          order: { creadoEn: 'DESC' },
          take: 200,
        })
      : [];

    return { total: criticos + errores + atascados, criticos, errores, atascados, detalle };
  }
}
