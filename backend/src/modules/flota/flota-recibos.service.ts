import {
  BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { EstadoReciboNexus, FlotaRecibo, SyncSis2000 } from './entities/flota-recibo.entity';
import { FlotaPoliza } from './entities/flota-poliza.entity';
import { FlotaCertificado } from './entities/flota-certificado.entity';
import { EstadoViajeFlota, FlotaViaje } from './entities/flota-viaje.entity';
import { FlotaService } from './flota.service';
import { FlotaSis2000Client } from './flota-sis2000.client';
import { ModalidadCobro, ModoCierre } from './entities/flota-config.entity';

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** RDY-18-1-1130480881-3-000001 */
export function numeroRecibo(prefijo: string, cnpoliza: string, ccerti: number, secuencia: number): string {
  return `${prefijo}-${cnpoliza}-${ccerti}-${String(secuencia).padStart(6, '0')}`;
}

/** Celda CSV (RFC 4180). */
const celda = (v: unknown): string => {
  if (v == null) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export interface FiltroRecibos {
  cnpoliza?: string;
  ccerti?: number;
  desde?: string;
  hasta?: string;
  estado?: string;
  sync?: string;
  limit?: number;
}

export interface RegistrarPolizaInput {
  cnpoliza: string;
  tomadorNombre?: string;
  tomadorRif?: string;
  /** Registrar aunque nest-api no pueda validarla (p. ej. en el 120 sin módulo flota). */
  forzar?: boolean;
}

/**
 * Fase 1 Ridery — lo que vive en NUESTRA base:
 * - Póliza registrada (emitida por La Mundial, validada por nest-api GET; no escribe en Sis2000).
 * - Recibo por viaje con numeración propia y estados PENDIENTE / COBRADO / ANULADO,
 *   listo para subirse a Sis2000 (`sync_sis2000`) cuando existan los SP.
 */
@Injectable()
export class FlotaRecibosService {
  constructor(
    @InjectRepository(FlotaRecibo) private readonly reciboRepo: Repository<FlotaRecibo>,
    @InjectRepository(FlotaPoliza) private readonly polizaRepo: Repository<FlotaPoliza>,
    @InjectRepository(FlotaCertificado) private readonly certRepo: Repository<FlotaCertificado>,
    private readonly flota: FlotaService,
    private readonly sis2000: FlotaSis2000Client,
    private readonly config: ConfigService,
  ) {}

  private prefijo(): string {
    return (this.config.get<string>('FLOTA_RECIBO_PREFIJO') || 'RDY').trim().toUpperCase().slice(0, 8);
  }

  // ── Póliza (opción b: registrar una póliza ya emitida por La Mundial) ──────

  async polizaActual(tenantId: string) {
    const cfg = await this.flota.getConfig(tenantId);
    const [registro, certificados] = await Promise.all([
      this.polizaRepo.findOne({ where: { tenantId, cnpoliza: cfg.cnpoliza } }),
      this.certRepo.count({ where: { tenantId, cnpoliza: cfg.cnpoliza } }),
    ]);
    return { cnpoliza: cfg.cnpoliza, cplan: cfg.cplan, registrada: Boolean(registro), registro, certificados };
  }

  async registrarPoliza(tenantId: string, dto: RegistrarPolizaInput, usuario?: string) {
    const cnpoliza = dto.cnpoliza?.trim().toUpperCase();
    if (!cnpoliza) throw new BadRequestException('cnpoliza es obligatorio.');

    let validada = false;
    let validacion: Record<string, unknown>;
    let cplan: string | null = null;
    if (!this.sis2000.conexionConfigurada()) {
      validacion = { error: 'Sin conexión a nest-api (NEST_API_URL / NEST_API_KEY).' };
    } else {
      try {
        const r = await this.sis2000.polizaFlota(cnpoliza, 15000);
        if (r.poliza) {
          validada = true;
          cplan = r.poliza.cplan ? String(r.poliza.cplan).trim() : null;
          validacion = { poliza: r.poliza as unknown as Record<string, unknown>, certificadosSis2000: r.certificados.length };
        } else {
          validacion = { error: `nest-api no encontró la póliza ${cnpoliza}.` };
        }
      } catch (err) {
        const e = err as { response?: { status?: number; data?: unknown }; message?: string };
        validacion = { error: `nest-api ${e.response?.status ?? ''}: ${JSON.stringify(e.response?.data ?? e.message).slice(0, 500)}` };
      }
    }
    if (!validada && !dto.forzar) {
      throw new UnprocessableEntityException({
        message: `No se pudo validar la póliza ${cnpoliza} en Sis2000: ${String(validacion.error)}. Envíe forzar=true para registrarla sin validar.`,
        validacion,
      });
    }

    await this.polizaRepo.update({ tenantId, activa: true }, { activa: false });
    const fila = (await this.polizaRepo.findOne({ where: { tenantId, cnpoliza } }))
      ?? this.polizaRepo.create({ tenantId, cnpoliza, origen: 'REGISTRADA' });
    if (dto.tomadorNombre !== undefined) fila.tomadorNombre = dto.tomadorNombre.trim() || null;
    if (dto.tomadorRif !== undefined) fila.tomadorRif = dto.tomadorRif.trim().toUpperCase() || null;
    fila.validada = validada;
    fila.validacion = validacion;
    fila.activa = true;
    fila.registradoPor = usuario ?? null;
    const guardada = await this.polizaRepo.save(fila);

    // La póliza registrada pasa a ser la de la flota (la configuración se versiona; tarifas y cierre se conservan).
    const cfg = await this.flota.getConfig(tenantId);
    if (cfg.cnpoliza !== cnpoliza || (cplan && cfg.cplan !== cplan)) {
      await this.flota.setConfig(tenantId, {
        cnpoliza,
        cplan: cplan ?? cfg.cplan ?? undefined,
        modalidad: (cfg.modalidad ?? ModalidadCobro.TIEMPO) as 'TIEMPO' | 'KM',
        tarifa: num(cfg.tarifa),
        moneda: cfg.moneda,
        minimoPorViaje: num(cfg.minimoPorViaje),
        redondearUnidad: cfg.redondearUnidad,
        modoCierre: (cfg.modoCierre ?? ModoCierre.MANUAL) as 'MANUAL' | 'AUTO',
        diaCierre: cfg.diaCierre,
      }, usuario);
    }
    return { poliza: guardada, validada, validacion };
  }

  // ── Recibos propios ────────────────────────────────────────────────────────

  porViaje(tenantId: string, idExterno: string) {
    return this.reciboRepo.findOne({ where: { tenantId, idExterno } });
  }

  /**
   * Crea el recibo PENDIENTE del viaje (al finalizar) si tiene monto y certificado. Idempotente: un recibo por viaje.
   * Devuelve null si todavía no se puede numerar (sin certificado o sin monto).
   */
  async asegurarRecibo(viaje: FlotaViaje): Promise<FlotaRecibo | null> {
    const existente = await this.porViaje(viaje.tenantId, viaje.idExterno);
    if (existente) return existente;
    if (viaje.estado !== EstadoViajeFlota.FINALIZADO || viaje.ccerti == null || num(viaje.costo) <= 0) return null;
    const cnpoliza = viaje.cnpoliza || (await this.flota.getConfig(viaje.tenantId)).cnpoliza;
    const prefijo = this.prefijo();
    for (let intento = 0; intento < 5; intento++) {
      const max = await this.reciboRepo.maximum('secuencia', { tenantId: viaje.tenantId, cnpoliza, ccerti: viaje.ccerti });
      const secuencia = num(max) + 1;
      const recibo = this.reciboRepo.create({
        tenantId: viaje.tenantId,
        numero: numeroRecibo(prefijo, cnpoliza, viaje.ccerti, secuencia),
        cnpoliza,
        ccerti: viaje.ccerti,
        secuencia,
        viajeId: viaje.id,
        idExterno: viaje.idExterno,
        monto: String(num(viaje.costo)),
        moneda: viaje.moneda || 'USD',
        fdesde: viaje.inicio,
        fhasta: viaje.fin ?? null,
        estado: EstadoReciboNexus.PENDIENTE,
        syncSis2000: SyncSis2000.PENDIENTE,
      });
      try {
        return await this.reciboRepo.save(recibo);
      } catch (err) {
        if ((err as { code?: string }).code !== '23505') throw err;
        // Otro request numeró en paralelo: si fue este mismo viaje, se devuelve; si no, se toma el siguiente número.
        const otro = await this.porViaje(viaje.tenantId, viaje.idExterno);
        if (otro) return otro;
      }
    }
    throw new ConflictException(`No se pudo numerar el recibo del viaje ${viaje.idExterno}; reintente.`);
  }

  /** Marca el recibo del viaje como COBRADO con la referencia del pago de la plataforma. */
  async cobrar(
    viaje: FlotaViaje,
    pago: { id?: string; referencia: string; metodo?: string | null; fechaPago?: Date | null; monto?: string; moneda?: string },
  ): Promise<FlotaRecibo | null> {
    const recibo = await this.asegurarRecibo(viaje);
    if (!recibo) return null;
    if (recibo.estado === EstadoReciboNexus.ANULADO) {
      throw new ConflictException(`El recibo ${recibo.numero} del viaje ${viaje.idExterno} está anulado.`);
    }
    if (recibo.estado === EstadoReciboNexus.COBRADO && recibo.referenciaPago === pago.referencia) return recibo;
    recibo.estado = EstadoReciboNexus.COBRADO;
    recibo.referenciaPago = pago.referencia;
    recibo.metodoPago = pago.metodo ?? null;
    recibo.fechaCobro = pago.fechaPago ?? new Date();
    recibo.pagoId = pago.id ?? recibo.pagoId ?? null;
    if (pago.monto != null) recibo.monto = String(num(pago.monto));
    if (pago.moneda) recibo.moneda = pago.moneda;
    return this.reciboRepo.save(recibo);
  }

  /** Resultado del recibo REAL (FLOTA_RECIBO_REAL=1): deja anotada la sincronización con Sis2000. */
  async marcarSync(recibo: FlotaRecibo, ok: boolean, datos: { cnrecibo?: string | null; crecibo?: string | null; error?: string | null }) {
    recibo.syncSis2000 = ok ? SyncSis2000.OK : SyncSis2000.ERROR;
    recibo.cnreciboSis2000 = datos.cnrecibo ?? recibo.cnreciboSis2000 ?? null;
    recibo.creciboSis2000 = datos.crecibo ?? recibo.creciboSis2000 ?? null;
    recibo.syncError = ok ? null : (datos.error ?? 'Error').slice(0, 2000);
    recibo.syncEn = new Date();
    return this.reciboRepo.save(recibo);
  }

  async anular(tenantId: string, id: string, motivo?: string) {
    const recibo = await this.reciboRepo.findOne({ where: { id, tenantId } });
    if (!recibo) throw new NotFoundException('Recibo no encontrado.');
    if (recibo.estado === EstadoReciboNexus.ANULADO) return recibo;
    if (!motivo?.trim()) throw new BadRequestException('motivo es obligatorio para anular.');
    if (recibo.syncSis2000 === SyncSis2000.OK) {
      throw new ConflictException(`El recibo ${recibo.numero} ya está en Sis2000 (${recibo.cnreciboSis2000}); anúlelo allá.`);
    }
    recibo.estado = EstadoReciboNexus.ANULADO;
    recibo.anuladoEn = new Date();
    recibo.motivoAnulacion = motivo.trim().slice(0, 250);
    return this.reciboRepo.save(recibo);
  }

  private async where(tenantId: string, f: FiltroRecibos): Promise<FindOptionsWhere<FlotaRecibo>> {
    const cnpoliza = f.cnpoliza?.trim() || (await this.flota.getConfig(tenantId)).cnpoliza;
    const w: FindOptionsWhere<FlotaRecibo> = { tenantId, cnpoliza };
    if (f.ccerti != null && Number.isFinite(f.ccerti)) w.ccerti = f.ccerti;
    const d = f.desde && !Number.isNaN(Date.parse(f.desde)) ? new Date(`${f.desde.slice(0, 10)}T00:00:00`) : null;
    const h = f.hasta && !Number.isNaN(Date.parse(f.hasta)) ? new Date(`${f.hasta.slice(0, 10)}T23:59:59.999`) : null;
    if (d && h) w.fdesde = Between(d, h);
    else if (d) w.fdesde = MoreThanOrEqual(d);
    else if (h) w.fdesde = LessThanOrEqual(h);
    const estados = (f.estado || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (estados.length) w.estado = In(estados) as never;
    const syncs = (f.sync || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (syncs.length) w.syncSis2000 = In(syncs) as never;
    return w;
  }

  async listar(tenantId: string, f: FiltroRecibos, max = 2000) {
    const where = await this.where(tenantId, f);
    const take = Math.min(Math.max(Number(f.limit) || 500, 1), max);
    const [recibos, total] = await this.reciboRepo.findAndCount({
      where, order: { fdesde: 'DESC', secuencia: 'DESC' }, take,
    });
    const totales = { PENDIENTE: 0, COBRADO: 0, ANULADO: 0, montoCobrado: 0, montoPendiente: 0 };
    for (const r of recibos) {
      totales[r.estado] = (totales[r.estado] ?? 0) + 1;
      if (r.estado === EstadoReciboNexus.COBRADO) totales.montoCobrado = Math.round((totales.montoCobrado + num(r.monto)) * 100) / 100;
      if (r.estado === EstadoReciboNexus.PENDIENTE) totales.montoPendiente = Math.round((totales.montoPendiente + num(r.monto)) * 100) / 100;
    }
    return { cnpoliza: where.cnpoliza as string, total, devueltos: recibos.length, totales, recibos };
  }

  /** CSV para entregar a La Mundial (un recibo por fila, con el conductor del certificado). */
  async csv(tenantId: string, f: FiltroRecibos): Promise<{ nombre: string; contenido: string }> {
    const { cnpoliza, recibos } = await this.listar(tenantId, { ...f, limit: f.limit ?? 50000 }, 50000);
    const certs = recibos.length
      ? await this.certRepo.find({ where: { tenantId, cnpoliza, ccerti: In([...new Set(recibos.map((r) => r.ccerti))]) } })
      : [];
    const porCert = new Map(certs.map((c) => [c.ccerti, c]));
    const cab = [
      'numero_recibo', 'cnpoliza', 'ccerti', 'secuencia', 'placa', 'conductor_doc', 'conductor_nombre', 'id_viaje',
      'fdesde', 'fhasta', 'monto', 'moneda', 'estado', 'fecha_cobro', 'referencia_pago', 'metodo_pago',
      'anulado_en', 'motivo_anulacion', 'sync_sis2000', 'cnrecibo_sis2000', 'creado_en',
    ];
    const filas = recibos.map((r) => {
      const c = porCert.get(r.ccerti);
      return [
        r.numero, r.cnpoliza, r.ccerti, r.secuencia, c?.placa, c?.conductorDoc, c?.conductorNombre, r.idExterno,
        r.fdesde, r.fhasta, num(r.monto).toFixed(2), r.moneda, r.estado, r.fechaCobro, r.referenciaPago, r.metodoPago,
        r.anuladoEn, r.motivoAnulacion, r.syncSis2000, r.cnreciboSis2000, r.creadoEn,
      ].map(celda).join(',');
    });
    const sufijo = [f.ccerti != null ? `cert${f.ccerti}` : null, f.desde?.slice(0, 10), f.hasta?.slice(0, 10)].filter(Boolean).join('_');
    return {
      nombre: `recibos_${cnpoliza}${sufijo ? `_${sufijo}` : ''}.csv`.replace(/[^\w.-]/g, '_'),
      contenido: `﻿${[cab.join(','), ...filas].join('\r\n')}\r\n`,
    };
  }

  /** Recibos de una lista de viajes (para la póliza en vivo). */
  deViajes(tenantId: string, viajeIds: string[]) {
    return viajeIds.length ? this.reciboRepo.find({ where: { tenantId, viajeId: In(viajeIds) } }) : Promise.resolve([]);
  }
}
