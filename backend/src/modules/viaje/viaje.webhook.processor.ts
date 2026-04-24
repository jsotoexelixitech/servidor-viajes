import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import * as crypto from 'crypto';
import { Viaje } from './entities/viaje.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SeguroService } from '../seguro/seguro.service';
import { VIAJE_QUEUE, VIAJE_JOB_ENVIAR, VIAJE_JOB_REINTENTAR_POLIZA } from './viaje.service';

@Processor(VIAJE_QUEUE)
export class ViajeWebhookProcessor {
  private readonly logger = new Logger(ViajeWebhookProcessor.name);

  constructor(
    @InjectRepository(Viaje) private readonly viajeRepo: Repository<Viaje>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly configService: ConfigService,
    private readonly seguroService: SeguroService,
  ) {}

  /** Reintento automático de emisión de póliza cuando La Mundial falló */
  @Process({ name: VIAJE_JOB_REINTENTAR_POLIZA, concurrency: 10 })
  async handleReintentarPoliza(job: Job<{ viajeId: string; tenantId: string }>) {
    const { viajeId, tenantId } = job.data;
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId, activo: true } });
    if (!tenant) return;

    this.logger.log(`[Queue] Reintentando emisión de póliza viaje=${viajeId} intento=${job.attemptsMade + 1}`);

    const viaje = await this.viajeRepo.findOne({ where: { id: viajeId, tenantId } });
    if (!viaje || viaje.estadoPoliza === 'ACTIVA') return;

    const bodyOriginal = viaje.metadata?.bodyOriginal ?? {};

    try {
      const poliza = await this.seguroService.emitirPoliza(bodyOriginal, tenant);
      await this.viajeRepo.update(viajeId, {
        cnpoliza: poliza.cnpoliza,
        cnrecibo: poliza.cnrecibo,
        urlPolizaPDF: poliza.urlpoliza,
        estadoPoliza: 'ACTIVA',
        polizaError: null,
        polizaIntentos: (viaje.polizaIntentos || 0) + 1,
        polizaUltimoIntento: new Date(),
      });
      this.logger.log(`[Queue] ✅ Póliza emitida en reintento #${job.attemptsMade + 1}: ${poliza.cnpoliza} para viaje=${viajeId}`);
    } catch (err) {
      const intentos = (viaje.polizaIntentos || 0) + 1;
      await this.viajeRepo.update(viajeId, {
        estadoPoliza: 'ERROR',
        polizaError: err.message,
        polizaIntentos: intentos,
        polizaUltimoIntento: new Date(),
      });
      this.logger.error(`[Queue] Reintento #${job.attemptsMade + 1} fallido viaje=${viajeId}: ${err.message}`);
      throw err; // Bull reintentará según la configuración
    }
  }

  /** Envío al webhook externo adicional del tenant */
  @Process({ name: VIAJE_JOB_ENVIAR, concurrency: 50 })
  async handleEnviarWebhook(job: Job<{ viajeId: string; tenantId: string; webhookUrl?: string; webhookSecret?: string }>) {
    const { viajeId, tenantId, webhookUrl: tenantWebhookUrl, webhookSecret: tenantSecret } = job.data;

    const viaje = await this.viajeRepo.findOne({ where: { id: viajeId, tenantId } });
    if (!viaje) return;

    const targetUrl = tenantWebhookUrl || this.configService.get<string>('webhook.url');
    if (!targetUrl) return;

    const payload = {
      event: 'viaje.iniciado',
      timestamp: new Date().toISOString(),
      tenantId,
      data: {
        id: viaje.id,
        numeroPlaca: viaje.numeroPlaca,
        nombreConductor: viaje.nombreConductor,
        cnpoliza: viaje.cnpoliza,
        urlPolizaPDF: viaje.urlPolizaPDF,
        estadoPoliza: viaje.estadoPoliza,
        coordenadas: {
          inicio: { lat: Number(viaje.latInicio), lng: Number(viaje.lngInicio) },
          destino: { lat: Number(viaje.latDestino), lng: Number(viaje.lngDestino) },
        },
        creadoEn: viaje.creadoEn,
      },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Ridery-Event': 'viaje.iniciado',
      'X-Ridery-Delivery': String(job.id),
    };

    const secret = tenantSecret || this.configService.get<string>('webhook.secret');
    if (secret) {
      headers['X-Ridery-Signature'] = 'sha256=' + crypto
        .createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
    }

    try {
      await axios.post(targetUrl, payload, { headers, timeout: this.configService.get<number>('webhook.timeout') });
      await this.viajeRepo.update(viajeId, { webhookEnviado: true, webhookUltimoError: null });
      this.logger.log(`[Queue] Webhook enviado viaje=${viajeId}`);
    } catch (err) {
      const msg = err instanceof AxiosError ? `HTTP ${err.response?.status}: ${err.message}` : err.message;
      await this.viajeRepo.update(viajeId, { webhookIntentos: (viaje.webhookIntentos || 0) + 1, webhookUltimoError: msg });
      throw err;
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job, err: Error) {
    // Detectar si es el último intento (todos agotados)
    const isDefinitiveFail = job.attemptsMade >= (job.opts?.attempts ?? 1) - 1;

    if (job.name === VIAJE_JOB_REINTENTAR_POLIZA && isDefinitiveFail) {
      const { viajeId, tenantId } = job.data as { viajeId: string; tenantId: string };

      // Marcar como CRITICO — requiere atención humana inmediata
      await this.viajeRepo.update(viajeId, {
        estadoPoliza: 'CRITICO',
        polizaError: `[CRÍTICO] Todos los reintentos agotados (${job.attemptsMade + 1} intentos). Último error: ${err.message}`,
        polizaUltimoIntento: new Date(),
      });

      // Log de nivel CRITICAL — debe aparecer en cualquier sistema de alertas
      this.logger.error(
        `🚨 [CRÍTICO] PÓLIZA NO EMITIDA DESPUÉS DE ${job.attemptsMade + 1} INTENTOS` +
        ` | viaje=${viajeId} | tenant=${tenantId}` +
        ` | error=${err.message}` +
        ` | ACCIÓN REQUERIDA: revisar /api/admin/polizas-criticas`,
      );
    } else {
      this.logger.error(
        `[Queue] Job ${job.name} #${job.id} falló (intento ${job.attemptsMade + 1}): ${err.message}`,
      );
    }
  }
}
