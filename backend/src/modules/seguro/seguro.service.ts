import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LaMundialService, LaMundialEmisionPayload, LaMundialEmisionResult } from './lamundial.service';
import { Viaje } from '../viaje/entities/viaje.entity';
import { Tenant } from '../tenant/entities/tenant.entity';

/** Campos de La Mundial que van al seguro (excluyendo internos del sistema) */
export const LA_MUNDIAL_CAMPOS = [
  'placa', 'fano', 'cmarca', 'cmodelo', 'cversion', 'color',
  'serial_carroceria', 'serial_motor', 'ccategoria_uso', 'ntoneladas',
  'nombre_tomador', 'apellido_tomador', 'rif_tomador', 'tipo_cedula_tomador',
  'fnac_tomador', 'telefono_tomador', 'correo_tomador',
  'estado_tomador', 'ciudad_tomador', 'direccion_tomador',
  'sexo_tomador', 'estado_civil_tomador',
];

/** Campos internos de nuestro sistema (coordenadas, etc.) */
export const CAMPOS_INTERNOS_SISTEMA = [
  'latInicio', 'lngInicio', 'latDestino', 'lngDestino', 'nombreConductor', 'metadata',
];

@Injectable()
export class SeguroService {
  private readonly logger = new Logger(SeguroService.name);

  constructor(
    private readonly laMundialService: LaMundialService,
    @InjectRepository(Viaje)
    private readonly viajeRepo: Repository<Viaje>,
  ) {}

  /**
   * Emite una póliza RCV para un viaje.
   * Combina los datos del body (ya transformados al esquema de La Mundial)
   * con la configuración fija del tenant.
   */
  async emitirPoliza(
    bodyTransformado: Record<string, any>,
    tenant: Tenant,
  ): Promise<LaMundialEmisionResult> {
    const seguroConfig = tenant.config?.seguroConfig;
    const defaults = tenant.config?.defaultValues ?? {};

    if (!seguroConfig?.baseUrl) {
      throw new BadRequestException(
        'Este tenant no tiene configurado el servicio de seguros. Configure primero en PUT /api/tenant/me/seguro',
      );
    }

    // Construir payload fusionando: defaults < bodyTransformado < config fija
    const payload: Partial<LaMundialEmisionPayload> = {
      // 1. Defaults del tenant para campos opcionales
      ...defaults,

      // 2. Campos del viaje (ya en formato La Mundial)
      ...bodyTransformado,

      // 3. Parámetros fijos del tenant (siempre prevalecen)
      cramo: seguroConfig.cramo,
      plan: seguroConfig.plan,
      frecuencia: seguroConfig.frecuencia,
      fecha_emision: new Date().toISOString().split('T')[0], // hoy YYYY-MM-DD
      dec_persona_politica: defaults.dec_persona_politica ?? 0,
      dec_term_y_cod: defaults.dec_term_y_cod ?? 1,
    };

    if (seguroConfig.productor) payload.productor = seguroConfig.productor;
    if (seguroConfig.cusuario) payload.cusuario = seguroConfig.cusuario;

    // El titular es igual al tomador si no se proporcionan campos de titular
    if (!payload.rif_titular) payload.rif_titular = payload.rif_tomador;
    if (!payload.nombre_titular) payload.nombre_titular = payload.nombre_tomador;
    if (!payload.apellido_titular) payload.apellido_titular = payload.apellido_tomador;
    if (!payload.telefono_titular) payload.telefono_titular = payload.telefono_tomador;
    if (!payload.correo_titular) payload.correo_titular = payload.correo_tomador;
    if (!payload.estado_titular) payload.estado_titular = payload.estado_tomador;
    if (!payload.ciudad_titular) payload.ciudad_titular = payload.ciudad_tomador;
    if (!payload.direccion_titular) payload.direccion_titular = payload.direccion_tomador;
    if (!payload.tipo_cedula_titular) payload.tipo_cedula_titular = payload.tipo_cedula_tomador ?? 'V';

    // Los campos de La Mundial usan "marca", "modelo", "version" (no cm*)
    // createEmissionAuto usa "marca", "modelo", "version" pero INMA usa "cmarca", "cmodelo", "cversion"
    if (!payload['marca'] && payload['cmarca']) payload['marca'] = payload['cmarca'];
    if (!payload['modelo'] && payload['cmodelo']) payload['modelo'] = payload['cmodelo'];
    if (!payload['version'] && payload['cversion']) payload['version'] = payload['cversion'];

    // Validar campos mínimos requeridos
    const camposRequeridos: (keyof LaMundialEmisionPayload)[] = [
      'placa', 'fano', 'marca', 'modelo', 'version',
      'nombre_tomador', 'rif_tomador', 'fnac_tomador',
      'estado_tomador', 'ciudad_tomador',
    ];
    const faltantes = camposRequeridos.filter(c => !payload[c]);
    if (faltantes.length > 0) {
      throw new BadRequestException(
        `Faltan campos requeridos para emitir la póliza: ${faltantes.join(', ')}. ` +
        'Configura el mapeo de campos o los valores por defecto en PUT /api/tenant/me/seguro',
      );
    }

    this.logger.log(
      `[Seguro] Emitiendo póliza tenant=${tenant.nombre} placa=${payload.placa} plan=${payload.plan}`,
    );

    return this.laMundialService.emitirPoliza(
      seguroConfig.baseUrl,
      payload as LaMundialEmisionPayload,
      seguroConfig.authToken,
    );
  }

  /**
   * Marca la póliza como finalizada en nuestro sistema.
   * TODO: Cuando La Mundial proporcione endpoint de cancelación, llamarlo aquí.
   */
  async finalizarPoliza(viaje: Viaje, tenant: Tenant): Promise<void> {
    if (!viaje.cnpoliza) {
      this.logger.warn(`[Seguro] Viaje ${viaje.id} no tiene póliza asociada, omitiendo cancelación.`);
      return;
    }

    this.logger.log(
      `[Seguro] Finalizando póliza ${viaje.cnpoliza} para viaje ${viaje.id} tenant=${tenant.nombre}`,
    );

    // TODO: Llamar al endpoint de cancelación de La Mundial cuando esté disponible.
    // const seguroConfig = tenant.config?.seguroConfig;
    // await this.laMundialService.cancelarPoliza(seguroConfig.baseUrl, viaje.cnpoliza, seguroConfig.authToken);

    this.logger.log(`[Seguro] Póliza ${viaje.cnpoliza} marcada como finalizada.`);
  }

  /**
   * Verifica de forma asíncrona que una póliza emitida realmente existe en La Mundial.
   * Se llama con un delay de 30s después de la emisión exitosa para detectar casos donde
   * La Mundial devolvió éxito pero la póliza no quedó registrada en su sistema.
   *
   * NO bloquea el response al cliente — es fire-and-forget con logging.
   */
  verificarEmisionAsync(cnpoliza: string, tenant: Tenant, delayMs = 30_000): void {
    const seguroConfig = tenant.config?.seguroConfig;
    if (!seguroConfig?.baseUrl || !cnpoliza) return;

    setTimeout(async () => {
      try {
        const confirmada = await this.laMundialService.verificarPoliza(
          seguroConfig.baseUrl,
          cnpoliza,
          seguroConfig.authToken,
        );
        if (!confirmada) {
          // Actualizar estado a ERROR para que el Guardian la rescate
          await this.viajeRepo.update(
            { cnpoliza },
            { estadoPoliza: 'ERROR' as any, polizaError: 'Verificación post-emisión: póliza no confirmada en La Mundial' },
          );
        }
      } catch (err) {
        this.logger.warn(`[Seguro] Error en verificación post-emisión de ${cnpoliza}: ${err.message}`);
      }
    }, delayMs);
  }

  /** Reintenta la emisión para un viaje que falló */
  async reintentarEmision(viajeId: string, tenant: Tenant): Promise<void> {
    const viaje = await this.viajeRepo.findOne({ where: { id: viajeId, tenantId: tenant.id } });
    if (!viaje) return;
    if (viaje.estadoPoliza === 'ACTIVA') {
      this.logger.log(`[Seguro] Viaje ${viajeId} ya tiene póliza activa, omitiendo reintento.`);
      return;
    }

    try {
      const bodyReconstruido = viaje.metadata?.bodyOriginal ?? {};
      const resultado = await this.emitirPoliza(bodyReconstruido, tenant);
      await this.viajeRepo.update(viajeId, {
        cnpoliza: resultado.cnpoliza,
        cnrecibo: resultado.cnrecibo,
        urlPolizaPDF: resultado.urlpoliza,
        estadoPoliza: 'ACTIVA',
        polizaError: null,
      });
    } catch (err) {
      await this.viajeRepo.update(viajeId, {
        estadoPoliza: 'ERROR',
        polizaError: err.message,
      });
    }
  }
}
