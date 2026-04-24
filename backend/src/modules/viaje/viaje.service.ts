import {
  Injectable, Logger, NotFoundException, InternalServerErrorException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Viaje, EstadoViaje } from './entities/viaje.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SeguroService, CAMPOS_INTERNOS_SISTEMA } from '../seguro/seguro.service';

export const VIAJE_QUEUE = 'viaje-webhook';
export const VIAJE_JOB_ENVIAR = 'enviar-webhook';
export const VIAJE_JOB_REINTENTAR_POLIZA = 'reintentar-poliza';

@Injectable()
export class ViajeService {
  private readonly logger = new Logger(ViajeService.name);

  constructor(
    @InjectRepository(Viaje)
    private readonly viajeRepo: Repository<Viaje>,
    @InjectQueue(VIAJE_QUEUE)
    private readonly viajeQueue: Queue,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly seguroService: SeguroService,
  ) {}

  /**
   * Inicia un viaje con las siguientes garantías:
   *
   * 1. IDEMPOTENCIA — Si se recibe el mismo evento dos veces (misma placa + tenant + misma
   *    ventana de tiempo), devuelve el viaje existente sin crear uno nuevo ni emitir otra póliza.
   *
   * 2. DEDUPLICACIÓN — No se permite más de un viaje ACTIVO por placa y tenant.
   *    Si la placa ya tiene un viaje en curso, se rechaza con 409.
   *
   * 3. EMISIÓN SINCRÓNICA con fallback asíncrono — Intenta emitir la póliza en línea.
   *    Si La Mundial falla (timeout, error, circuit breaker abierto), el viaje se guarda
   *    de igual forma y se encolan reintentos automáticos con backoff exponencial.
   *
   * 4. TRANSACCIÓN — La persistencia en BD usa transacciones para garantizar
   *    consistencia ante caídas.
   */
  async iniciar(body: Record<string, any>, tenant: Tenant, idempotencyKey?: string): Promise<Viaje> {
    const placa = (body.placa ?? body.numeroPlaca ?? '').toString().toUpperCase().trim();

    // ── Generar clave de idempotencia si no viene en el header ──────────────
    const iKey = idempotencyKey?.trim() ||
      createHash('sha256').update(`${tenant.id}::${placa}::${Math.floor(Date.now() / 60_000)}`).digest('hex');

    // ── 1. IDEMPOTENCIA — ¿Ya existe un viaje con esta clave? ───────────────
    const existente = await this.viajeRepo
      .createQueryBuilder('v')
      .where('v.tenantId = :tenantId', { tenantId: tenant.id })
      .andWhere(`v.metadata->>'idempotencyKey' = :iKey`, { iKey })
      .getOne();
    if (existente) {
      this.logger.warn(`[Idempotencia] Viaje duplicado detectado key=${iKey.substring(0, 16)} → devolviendo existente id=${existente.id}`);
      return existente;
    }

    // ── 2. DEDUPLICACIÓN — ¿Ya hay un viaje activo para esta placa? ─────────
    if (placa) {
      const viajeActivo = await this.viajeRepo.findOne({
        where: {
          tenantId: tenant.id,
          numeroPlaca: placa,
          estado: EstadoViaje.INICIADO,
        },
      });
      if (viajeActivo) {
        this.logger.warn(`[Deduplicación] Placa ${placa} ya tiene viaje activo id=${viajeActivo.id}`);
        throw new ConflictException(
          `La placa ${placa} ya tiene un viaje en curso (id: ${viajeActivo.id}). ` +
          'Finalice el viaje anterior antes de iniciar uno nuevo.',
        );
      }
    }

    // ── 3. PERSISTIR el viaje (estado: EMITIENDO) ───────────────────────────
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let viaje: Viaje;
    try {
      viaje = queryRunner.manager.create(Viaje, {
        tenantId: tenant.id,
        numeroPlaca: placa || null,
        nombreConductor: body.nombreConductor ?? body.nombre_tomador ?? null,
        modeloVehiculo: body.cmodelo ?? body.modeloVehiculo ?? null,
        anioVehiculo: String(body.fano ?? body.anioVehiculo ?? ''),
        latInicio: this.toFloat(body.latInicio),
        lngInicio: this.toFloat(body.lngInicio),
        latDestino: this.toFloat(body.latDestino),
        lngDestino: this.toFloat(body.lngDestino),
        estado: EstadoViaje.INICIADO,
        estadoPoliza: 'EMITIENDO',
        polizaIntentos: 0,
        metadata: {
          idempotencyKey: iKey,
          bodyOriginal: this.extraerCamposLaMundial(body),
        },
      });

      viaje = await queryRunner.manager.save(Viaje, viaje);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error al guardar viaje: ${err.message}`, err.stack);
      throw new InternalServerErrorException('No se pudo registrar el viaje. Intente nuevamente.');
    } finally {
      await queryRunner.release();
    }

    // ── 4. EMITIR PÓLIZA (sincrónico con fallback asíncrono) ────────────────
    try {
      const bodyLaMundial = this.extraerCamposLaMundial(body);
      const poliza = await this.seguroService.emitirPoliza(bodyLaMundial, tenant);

      await this.viajeRepo.update(viaje.id, {
        cnpoliza: poliza.cnpoliza,
        cnrecibo: poliza.cnrecibo,
        urlPolizaPDF: poliza.urlpoliza,
        estadoPoliza: 'ACTIVA',
        polizaIntentos: 1,
        polizaError: null,
      });

      viaje.cnpoliza = poliza.cnpoliza;
      viaje.cnrecibo = poliza.cnrecibo;
      viaje.urlPolizaPDF = poliza.urlpoliza;
      viaje.estadoPoliza = 'ACTIVA';

      this.logger.log(`✅ Viaje ${viaje.id} | Póliza ${poliza.cnpoliza} | Placa ${placa}`);

      // Verificación post-emisión asíncrona a los 30s:
      // Confirma que La Mundial realmente registró la póliza (sin bloquear response)
      this.seguroService.verificarEmisionAsync(poliza.cnpoliza, tenant);
    } catch (err) {
      // La Mundial falló → guardar error, encolar reintento, NO fallar el viaje
      const errMsg = err?.response?.message ?? err.message;
      this.logger.error(`⚠️ Emisión falló para viaje ${viaje.id}: ${errMsg} → encolando reintento`);

      await this.viajeRepo.update(viaje.id, {
        estadoPoliza: 'ERROR',
        polizaError: errMsg,
        polizaIntentos: 1,
      });
      viaje.estadoPoliza = 'ERROR';
      viaje.polizaError = errMsg;

      // ── CAPA 1 DE SEGURO: reintentos automáticos hasta 3 horas ─────────────
      // Backoff exponencial: 10s → 20s → 40s → 80s → 160s → 320s → 640s → 1280s → 2560s → 5120s
      // Total cobertura: ~3 horas de reintentos continuos si La Mundial está caída.
      // Si todos fallan, la CAPA 2 (cron scanner) rescata el viaje cada 5 minutos.
      try {
        await this.viajeQueue.add(
          VIAJE_JOB_REINTENTAR_POLIZA,
          { viajeId: viaje.id, tenantId: tenant.id },
          {
            attempts: 10,
            backoff: { type: 'exponential', delay: 10_000 },
            removeOnComplete: true,
            removeOnFail: false,     // mantener en cola para auditoría
            delay: 10_000,           // primer reintento a los 10s
            jobId: `poliza-${viaje.id}`,  // previene duplicados en cola
          },
        );
      } catch (queueErr) {
        // Redis no disponible — el cron scanner de Capa 2 tomará el relevo
        this.logger.error(
          `⚠️ No se pudo encolar reintento para viaje ${viaje.id}: ${queueErr.message}` +
          ` — el escáner periódico lo rescatará en ≤5 minutos`,
        );
      }
    }

    // Webhook externo adicional (si el tenant lo tiene configurado)
    if (tenant.webhookUrl) {
      await this.viajeQueue.add(
        VIAJE_JOB_ENVIAR,
        { viajeId: viaje.id, tenantId: tenant.id, webhookUrl: tenant.webhookUrl, webhookSecret: tenant.webhookSecret },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true },
      ).catch(err => this.logger.warn(`No se pudo encolar webhook externo: ${err.message}`));
    }

    return this.viajeRepo.findOne({ where: { id: viaje.id } });
  }

  /**
   * Finaliza un viaje: notifica a La Mundial y elimina los datos temporales.
   */
  async finalizar(idViaje: string, tenant: Tenant): Promise<{ mensaje: string; idViaje: string; cnpoliza?: string }> {
    const viaje = await this.viajeRepo.findOne({ where: { id: idViaje, tenantId: tenant.id } });
    if (!viaje) throw new NotFoundException(`Viaje ${idViaje} no encontrado.`);

    const cnpoliza = viaje.cnpoliza;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.seguroService.finalizarPoliza(viaje, tenant);
      await queryRunner.manager.delete(Viaje, { id: idViaje, tenantId: tenant.id });
      await queryRunner.commitTransaction();

      this.logger.log(`🏁 Viaje ${idViaje} finalizado | Póliza: ${cnpoliza ?? 'sin póliza'} | Tenant: ${tenant.nombre}`);
      return { mensaje: 'Viaje finalizado y datos eliminados.', idViaje, ...(cnpoliza && { cnpoliza }) };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error al finalizar viaje ${idViaje}: ${err.message}`, err.stack);
      throw new InternalServerErrorException('No se pudo finalizar el viaje.');
    } finally {
      await queryRunner.release();
    }
  }

  async enviar(idViaje: string, forzarReenvio: boolean, tenant: Tenant): Promise<{ mensaje: string }> {
    const viaje = await this.viajeRepo.findOne({ where: { id: idViaje, tenantId: tenant.id } });
    if (!viaje) throw new NotFoundException(`Viaje ${idViaje} no encontrado.`);

    if (viaje.webhookEnviado && !forzarReenvio) {
      return { mensaje: 'Ya fue enviado. Use forzarReenvio=true.' };
    }

    await this.viajeQueue.add(
      VIAJE_JOB_ENVIAR,
      { viajeId: viaje.id, tenantId: tenant.id, webhookUrl: tenant.webhookUrl, webhookSecret: tenant.webhookSecret, manual: true },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, priority: 1 },
    );

    return { mensaje: 'Envío encolado.' };
  }

  async obtener(id: string, tenant: Tenant): Promise<Viaje> {
    const viaje = await this.viajeRepo.findOne({ where: { id, tenantId: tenant.id } });
    if (!viaje) throw new NotFoundException(`Viaje ${id} no encontrado.`);
    return viaje;
  }

  async listar(tenant: Tenant, page = 1, limit = 50): Promise<{ data: Viaje[]; total: number }> {
    const [data, total] = await this.viajeRepo.findAndCount({
      where: { tenantId: tenant.id },
      order: { creadoEn: 'DESC' },
      skip: (page - 1) * limit,
      take: Math.min(limit, 100),
    });
    return { data, total };
  }

  private toFloat(val: any): number | null {
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }

  private extraerCamposLaMundial(body: Record<string, any>): Record<string, any> {
    const resultado: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!CAMPOS_INTERNOS_SISTEMA.includes(key)) {
        resultado[key] = value;
      }
    }
    return resultado;
  }
}
