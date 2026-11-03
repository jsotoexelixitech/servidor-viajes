import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EstadoViajeFlota, FlotaViaje } from './entities/flota-viaje.entity';
import {
  ClasificacionDistancia, FlotaTarifaDistancia, RedondeoKm,
} from './entities/flota-tarifa-distancia.entity';
import { FlotaCertificado, OrigenCertificado } from './entities/flota-certificado.entity';
import { EstadoReciboViaje, FlotaPagoViaje } from './entities/flota-pago-viaje.entity';
import {
  CertificadoDto, CotizarDistanciaDto, EventoViajeDto, GuardarTarifasDto, PagoViajeDto,
} from './dto/cobro-viaje.dto';
import { FlotaService } from './flota.service';
import { FlotaSis2000Client, monedaSis2000, ReciboCertificadoPayload } from './flota-sis2000.client';
import { FlotaRecibosService } from './flota-recibos.service';

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const isoDia = (d: Date) => d.toISOString().slice(0, 10);
const TOLERANCIA = 0.01;

/** V-12.345.678 → V12345678 */
export function normalizarDoc(doc?: string | null): string | null {
  const s = String(doc ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s || null;
}

export interface TarifaCalculo {
  clasificacion: ClasificacionDistancia;
  nombre: string;
  km: number;
  kmCobrados: number;
  tarifaKm: number;
  minimo: number;
  minimoAplicado: boolean;
  monto: number;
  moneda: string;
}

const NOMBRES: Record<ClasificacionDistancia, string> = {
  [ClasificacionDistancia.URBANO]: 'Urbano',
  [ClasificacionDistancia.EXTRA_URBANO]: 'Extra urbano',
};

/** Monto de un viaje con las tarifas por distancia (función pura, se prueba sola). */
export function calcularMontoDistancia(
  tarifas: Pick<FlotaTarifaDistancia, 'clasificacion' | 'nombre' | 'kmDesde' | 'kmHasta' | 'tarifaKm' | 'minimo' | 'redondeo' | 'moneda' | 'activa'>[],
  km: number,
  clasificacion?: string | null,
): TarifaCalculo {
  const activas = tarifas.filter((t) => t.activa !== false);
  const t = clasificacion
    ? activas.find((x) => x.clasificacion === clasificacion)
    : activas.find((x) => km >= num(x.kmDesde) - 1e-9 && (x.kmHasta == null || km < num(x.kmHasta)));
  if (!t) {
    throw new UnprocessableEntityException(
      clasificacion
        ? `No hay tarifa activa para la clasificación ${clasificacion}.`
        : `Ningún rango de distancia cubre ${km} km. Revise la clasificación urbano / extra urbano.`,
    );
  }
  let kmCobrados = km;
  if (t.redondeo === RedondeoKm.KM_ARRIBA) kmCobrados = Math.ceil(km - 1e-9);
  else if (t.redondeo === RedondeoKm.KM_CERCANO) kmCobrados = Math.round(km);
  const bruto = kmCobrados * num(t.tarifaKm);
  const minimo = num(t.minimo);
  const monto = r2(Math.max(bruto, minimo));
  return {
    clasificacion: t.clasificacion,
    nombre: t.nombre,
    km: r3(km),
    kmCobrados: r3(kmCobrados),
    tarifaKm: num(t.tarifaKm),
    minimo,
    minimoAplicado: minimo > bruto,
    monto,
    moneda: t.moneda,
  };
}

/**
 * Cobro por viaje (Ridery): evento de viaje → monto por km según urbano / extra urbano →
 * pago de la plataforma → recibo del viaje sobre el certificado del conductor en la póliza de flota.
 */
@Injectable()
export class FlotaCobroViajeService {
  private readonly logger = new Logger(FlotaCobroViajeService.name);

  constructor(
    @InjectRepository(FlotaViaje) private readonly viajeRepo: Repository<FlotaViaje>,
    @InjectRepository(FlotaTarifaDistancia) private readonly tarifaRepo: Repository<FlotaTarifaDistancia>,
    @InjectRepository(FlotaCertificado) private readonly certRepo: Repository<FlotaCertificado>,
    @InjectRepository(FlotaPagoViaje) private readonly pagoRepo: Repository<FlotaPagoViaje>,
    private readonly flota: FlotaService,
    private readonly sis2000: FlotaSis2000Client,
    private readonly recibos: FlotaRecibosService,
  ) {}

  // ── Tarifas por distancia (mantenimiento) ────────────────────────────────

  /** Tarifas guardadas; si la flota no tiene, valores por defecto (no se guardan hasta editar). */
  async getTarifas(tenantId: string): Promise<FlotaTarifaDistancia[]> {
    const rows = await this.tarifaRepo.find({ where: { tenantId }, order: { kmDesde: 'ASC' } });
    if (rows.length) return rows;
    return [
      this.tarifaRepo.create({
        tenantId, clasificacion: ClasificacionDistancia.URBANO, nombre: NOMBRES.URBANO,
        kmDesde: '0', kmHasta: '20', tarifaKm: '0', minimo: '0', redondeo: RedondeoKm.KM_ARRIBA, moneda: 'USD', activa: true,
      }),
      this.tarifaRepo.create({
        tenantId, clasificacion: ClasificacionDistancia.EXTRA_URBANO, nombre: NOMBRES.EXTRA_URBANO,
        kmDesde: '20', kmHasta: null, tarifaKm: '0', minimo: '0', redondeo: RedondeoKm.KM_ARRIBA, moneda: 'USD', activa: true,
      }),
    ];
  }

  async guardarTarifas(tenantId: string, dto: GuardarTarifasDto, usuario?: string): Promise<FlotaTarifaDistancia[]> {
    const vistas = new Set<string>();
    for (const t of dto.tarifas) {
      if (vistas.has(t.clasificacion)) throw new BadRequestException(`Clasificación repetida: ${t.clasificacion}.`);
      vistas.add(t.clasificacion);
      if (t.kmHasta != null && t.kmHasta <= t.kmDesde) {
        throw new BadRequestException(`${t.clasificacion}: "km hasta" debe ser mayor que "km desde".`);
      }
    }
    const activas = dto.tarifas.filter((t) => t.activa !== false).sort((a, b) => a.kmDesde - b.kmDesde);
    for (let i = 1; i < activas.length; i++) {
      const prev = activas[i - 1];
      if (prev.kmHasta == null || prev.kmHasta > activas[i].kmDesde) {
        throw new BadRequestException(`Los rangos de ${prev.clasificacion} y ${activas[i].clasificacion} se solapan.`);
      }
    }
    const monedas = new Set(activas.map((t) => (t.moneda || 'USD').toUpperCase()));
    if (monedas.size > 1) throw new BadRequestException('Todas las tarifas activas deben usar la misma moneda.');

    for (const t of dto.tarifas) {
      const existente = await this.tarifaRepo.findOne({ where: { tenantId, clasificacion: t.clasificacion as ClasificacionDistancia } });
      const fila = existente ?? this.tarifaRepo.create({ tenantId, clasificacion: t.clasificacion as ClasificacionDistancia });
      Object.assign(fila, {
        nombre: t.nombre?.trim() || NOMBRES[t.clasificacion as ClasificacionDistancia],
        kmDesde: String(t.kmDesde),
        kmHasta: t.kmHasta == null ? null : String(t.kmHasta),
        tarifaKm: String(t.tarifaKm),
        minimo: String(t.minimo ?? 0),
        redondeo: (t.redondeo ?? RedondeoKm.KM_ARRIBA) as RedondeoKm,
        moneda: (t.moneda || 'USD').toUpperCase(),
        activa: t.activa ?? true,
        actualizadoPor: usuario ?? null,
      });
      await this.tarifaRepo.save(fila);
    }
    return this.getTarifas(tenantId);
  }

  async cotizar(tenantId: string, dto: CotizarDistanciaDto): Promise<TarifaCalculo> {
    return calcularMontoDistancia(await this.getTarifas(tenantId), dto.km, dto.clasificacion);
  }

  // ── Certificados (conductor → certificado de la póliza) ───────────────────

  async listarCertificados(tenantId: string, cnpoliza?: string) {
    const poliza = cnpoliza || (await this.flota.getConfig(tenantId)).cnpoliza;
    return this.certRepo.find({ where: { tenantId, cnpoliza: poliza }, order: { ccerti: 'ASC' } });
  }

  async guardarCertificado(tenantId: string, dto: CertificadoDto): Promise<FlotaCertificado> {
    const cnpoliza = dto.cnpoliza?.trim() || (await this.flota.getConfig(tenantId)).cnpoliza;
    // Sin ccerti: siguiente número de la póliza (numeración Nexus; en Sis2000 se asociará al crear los SP).
    const ccerti = dto.ccerti ?? num(await this.certRepo.maximum('ccerti', { tenantId, cnpoliza })) + 1;
    const existente = await this.certRepo.findOne({ where: { tenantId, cnpoliza, ccerti } });
    const fila = existente ?? this.certRepo.create({ tenantId, cnpoliza, ccerti, origen: OrigenCertificado.MANUAL });
    if (dto.placa !== undefined) fila.placa = dto.placa.trim().toUpperCase() || null;
    if (dto.conductorDoc !== undefined) {
      fila.conductorDoc = dto.conductorDoc.trim() || null;
      fila.conductorDocNorm = normalizarDoc(dto.conductorDoc);
    }
    if (dto.conductorNombre !== undefined) fila.conductorNombre = dto.conductorNombre.trim() || null;
    fila.activo = dto.activo ?? fila.activo ?? true;
    return this.certRepo.save(fila);
  }

  async desactivarCertificado(tenantId: string, id: string) {
    const fila = await this.certRepo.findOne({ where: { id, tenantId } });
    if (!fila) throw new NotFoundException('Certificado no encontrado.');
    fila.activo = false;
    return this.certRepo.save(fila);
  }

  /** Trae los certificados de la póliza desde Sis2000 (nest-api) y los guarda/actualiza. */
  async sincronizarCertificados(tenantId: string) {
    const { cnpoliza } = await this.flota.getConfig(tenantId);
    let lista;
    try {
      lista = await this.sis2000.certificadosPoliza(cnpoliza);
    } catch (err) {
      const e = err as { response?: { status?: number; data?: unknown }; message?: string };
      throw new BadRequestException(
        `No se pudieron leer los certificados de ${cnpoliza} en nest-api: ${JSON.stringify(e.response?.data ?? e.message).slice(0, 500)}`,
      );
    }
    let nuevos = 0;
    let actualizados = 0;
    for (const c of lista) {
      const ccerti = Number(c.ccerti);
      if (!Number.isFinite(ccerti)) continue;
      const existente = await this.certRepo.findOne({ where: { tenantId, cnpoliza, ccerti } });
      const fila = existente ?? this.certRepo.create({ tenantId, cnpoliza, ccerti });
      fila.placa = c.xplaca?.trim().toUpperCase() || fila.placa || null;
      fila.conductorDoc = c.cid_asegurado?.trim() || fila.conductorDoc || null;
      fila.conductorDocNorm = normalizarDoc(fila.conductorDoc);
      fila.conductorNombre = c.xconductor?.trim() || c.xasegurado?.trim() || fila.conductorNombre || null;
      fila.istatcer = c.istatcer?.trim() || null;
      // vhcerti.istatcer: V/E = vigente/emitido; P = pendiente; N = anulado.
      fila.activo = ['V', 'E'].includes(String(c.istatcer ?? '').trim().toUpperCase());
      fila.origen = OrigenCertificado.SIS2000;
      await this.certRepo.save(fila);
      if (existente) actualizados += 1; else nuevos += 1;
    }
    return { cnpoliza, leidos: lista.length, nuevos, actualizados };
  }

  /** Certificado activo del conductor (por documento) o, si no, del vehículo (por placa). */
  async resolverCertificado(tenantId: string, cnpoliza: string, doc?: string | null, placa?: string | null) {
    const docNorm = normalizarDoc(doc);
    if (docNorm) {
      const c = await this.certRepo.findOne({ where: { tenantId, cnpoliza, conductorDocNorm: docNorm, activo: true } });
      if (c) return c;
    }
    const p = placa?.trim().toUpperCase();
    if (p) {
      const c = await this.certRepo.findOne({ where: { tenantId, cnpoliza, placa: p, activo: true } });
      if (c) return c;
    }
    return null;
  }

  // ── Evento de viaje (Ridery) ─────────────────────────────────────────────

  async evento(tenantId: string, dto: EventoViajeDto) {
    switch (dto.tipo) {
      case 'INICIO': return this.inicio(tenantId, dto);
      case 'FIN': return this.fin(tenantId, dto);
      case 'CANCELACION': return this.cancelacion(tenantId, dto);
      default: throw new BadRequestException('tipo debe ser INICIO, FIN o CANCELACION.');
    }
  }

  private async buscar(tenantId: string, idViaje: string) {
    return this.viajeRepo.findOne({ where: { tenantId, idExterno: idViaje } });
  }

  private validarModo(v: FlotaViaje) {
    if (v.modoCobro !== 'POR_VIAJE') {
      throw new ConflictException(`El viaje ${v.idExterno} se registró para el cierre mensual (/flota/viajes/inicio), no para cobro por viaje.`);
    }
  }

  private async inicio(tenantId: string, dto: EventoViajeDto) {
    const existente = await this.buscar(tenantId, dto.idViaje);
    if (existente) {
      this.validarModo(existente);
      return this.respuesta(existente, true);
    }
    if (!dto.placa) throw new BadRequestException('placa es obligatoria en INICIO.');
    const cfg = await this.flota.getConfig(tenantId);
    const cert = await this.resolverCertificado(tenantId, cfg.cnpoliza, dto.conductorDoc, dto.placa);
    const viaje = this.viajeRepo.create({
      tenantId,
      idExterno: dto.idViaje,
      placa: dto.placa.trim().toUpperCase(),
      conductorDoc: dto.conductorDoc?.trim() || null,
      conductorNombre: dto.conductorNombre?.trim() || null,
      estado: EstadoViajeFlota.INICIADO,
      inicio: dto.fecha ? new Date(dto.fecha) : new Date(),
      origen: dto.origen ?? null,
      modoCobro: 'POR_VIAJE',
      cnpoliza: cfg.cnpoliza,
      ccerti: cert?.ccerti ?? null,
      clasificacion: dto.clasificacion ?? null,
    });
    if (dto.kmEstimados != null) {
      const calc = calcularMontoDistancia(await this.getTarifas(tenantId), dto.kmEstimados, dto.clasificacion);
      viaje.kmEstimados = String(calc.km);
      viaje.montoEstimado = String(calc.monto);
      viaje.clasificacion = calc.clasificacion;
      viaje.tarifaKm = String(calc.tarifaKm);
      viaje.moneda = calc.moneda;
    }
    return this.respuesta(await this.guardarNuevo(viaje), false);
  }

  private async fin(tenantId: string, dto: EventoViajeDto) {
    let viaje = await this.buscar(tenantId, dto.idViaje);
    if (!viaje) {
      // FIN sin INICIO previo: se acepta si trae la placa (el viaje se registra con inicio = fin).
      if (!dto.placa) throw new NotFoundException(`Viaje ${dto.idViaje} no existe: envíe INICIO primero o incluya la placa en FIN.`);
      await this.inicio(tenantId, { ...dto, tipo: 'INICIO', kmEstimados: undefined });
      viaje = (await this.buscar(tenantId, dto.idViaje)) as FlotaViaje;
    }
    this.validarModo(viaje);
    if (viaje.estado === EstadoViajeFlota.FINALIZADO) return this.respuesta(viaje, true);
    if (viaje.estado === EstadoViajeFlota.CANCELADO) throw new ConflictException(`El viaje ${dto.idViaje} está cancelado.`);

    const fin = dto.fecha ? new Date(dto.fecha) : new Date();
    if (fin.getTime() < new Date(viaje.inicio).getTime()) {
      throw new BadRequestException('La fecha de FIN es anterior al inicio del viaje.');
    }
    const km = dto.km ?? (viaje.kmEstimados != null ? num(viaje.kmEstimados) : undefined);
    if (km == null) throw new BadRequestException('km es obligatorio en FIN (no hubo km estimados en INICIO).');
    const calc = calcularMontoDistancia(await this.getTarifas(tenantId), km, dto.clasificacion ?? undefined);

    if (viaje.ccerti == null) {
      const cert = await this.resolverCertificado(tenantId, viaje.cnpoliza ?? (await this.flota.getConfig(tenantId)).cnpoliza, viaje.conductorDoc, viaje.placa);
      viaje.ccerti = cert?.ccerti ?? null;
    }
    viaje.fin = fin;
    viaje.minutos = String(r2((fin.getTime() - new Date(viaje.inicio).getTime()) / 60000));
    viaje.km = String(calc.km);
    viaje.clasificacion = calc.clasificacion;
    viaje.tarifaKm = String(calc.tarifaKm);
    viaje.costo = String(calc.monto);
    viaje.moneda = calc.moneda;
    viaje.destino = dto.destino ?? viaje.destino ?? null;
    viaje.estado = EstadoViajeFlota.FINALIZADO;
    viaje.estadoPago = calc.monto > 0 ? 'PENDIENTE' : null;
    const guardado = await this.viajeRepo.save(viaje);
    // Recibo propio PENDIENTE (Fase 1). Si falla, el FIN no se cae: el recibo se crea al pagar.
    await this.recibos.asegurarRecibo(guardado).catch((err: Error) =>
      this.logger.warn(`Recibo PENDIENTE del viaje ${guardado.idExterno}: ${err.message}`));
    return this.respuesta(guardado, false);
  }

  private async cancelacion(tenantId: string, dto: EventoViajeDto) {
    const viaje = await this.buscar(tenantId, dto.idViaje);
    if (!viaje) throw new NotFoundException(`Viaje ${dto.idViaje} no existe.`);
    this.validarModo(viaje);
    if (viaje.estado === EstadoViajeFlota.CANCELADO) return this.respuesta(viaje, true);
    if (viaje.estado === EstadoViajeFlota.FINALIZADO) {
      throw new ConflictException('No se puede cancelar un viaje finalizado.');
    }
    viaje.estado = EstadoViajeFlota.CANCELADO;
    viaje.fin = dto.fecha ? new Date(dto.fecha) : new Date();
    viaje.costo = '0';
    viaje.estadoPago = null;
    if (dto.motivo) viaje.destino = { ...(viaje.destino ?? {}), motivoCancelacion: dto.motivo };
    return this.respuesta(await this.viajeRepo.save(viaje), false);
  }

  /** Inserta el viaje; si otro request lo insertó en paralelo (único tenant+idExterno), devuelve ese. */
  private async guardarNuevo(viaje: FlotaViaje): Promise<FlotaViaje> {
    try {
      return await this.viajeRepo.save(viaje);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        const otro = await this.buscar(viaje.tenantId, viaje.idExterno);
        if (otro) return otro;
      }
      throw err;
    }
  }

  async estadoCobro(tenantId: string, idViaje: string) {
    const viaje = await this.buscar(tenantId, idViaje);
    if (!viaje) throw new NotFoundException(`Viaje ${idViaje} no existe.`);
    const pago = await this.pagoRepo.findOne({ where: { tenantId, idExterno: idViaje } });
    const recibo = await this.recibos.porViaje(tenantId, idViaje);
    return {
      ...this.respuesta(viaje, false),
      pago: pago ? this.resumenPago(pago) : null,
      reciboNexus: recibo ? {
        id: recibo.id, numero: recibo.numero, estado: recibo.estado, monto: num(recibo.monto), moneda: recibo.moneda,
        fechaCobro: recibo.fechaCobro, referenciaPago: recibo.referenciaPago,
        syncSis2000: recibo.syncSis2000, cnreciboSis2000: recibo.cnreciboSis2000,
      } : null,
    };
  }

  respuesta(v: FlotaViaje, duplicado: boolean) {
    const advertencias: string[] = [];
    if (v.modoCobro === 'POR_VIAJE' && v.ccerti == null && v.estado !== EstadoViajeFlota.CANCELADO) {
      advertencias.push('El conductor no tiene certificado activo en la póliza: el pago se registrará, pero el recibo quedará en ERROR hasta asociarlo.');
    }
    return {
      idViaje: v.idExterno,
      estado: v.estado,
      duplicado,
      inicio: v.inicio,
      fin: v.fin,
      placa: v.placa,
      conductorDoc: v.conductorDoc,
      clasificacion: v.clasificacion,
      tarifaKm: v.tarifaKm != null ? num(v.tarifaKm) : null,
      kmEstimados: v.kmEstimados != null ? num(v.kmEstimados) : null,
      montoEstimado: v.montoEstimado != null ? num(v.montoEstimado) : null,
      km: v.estado === EstadoViajeFlota.FINALIZADO ? num(v.km) : null,
      minutos: v.estado === EstadoViajeFlota.FINALIZADO ? num(v.minutos) : null,
      /** Monto a pagar por el viaje (solo en FIN). */
      monto: v.estado === EstadoViajeFlota.FINALIZADO ? num(v.costo) : null,
      moneda: v.moneda,
      estadoPago: v.estadoPago,
      certificado: v.ccerti != null ? { cnpoliza: v.cnpoliza, ccerti: v.ccerti } : null,
      advertencias,
    };
  }

  // ── Pago y recibo por viaje ──────────────────────────────────────────────

  async pagar(tenantId: string, dto: PagoViajeDto) {
    const viaje = await this.buscar(tenantId, dto.idViaje);
    if (!viaje) throw new NotFoundException(`Viaje ${dto.idViaje} no existe.`);
    this.validarModo(viaje);
    if (viaje.estado !== EstadoViajeFlota.FINALIZADO) {
      throw new ConflictException(`El viaje ${dto.idViaje} está ${viaje.estado}: solo se paga un viaje finalizado.`);
    }
    const esperado = num(viaje.costo);
    if (esperado <= 0) throw new UnprocessableEntityException('El viaje no tiene monto a cobrar.');
    if (Math.abs(r2(dto.monto) - esperado) > TOLERANCIA) {
      throw new UnprocessableEntityException({
        message: `El monto pagado (${dto.monto}) no coincide con el monto del viaje (${esperado} ${viaje.moneda}).`,
        montoEsperado: esperado,
        moneda: viaje.moneda,
      });
    }
    if (dto.moneda && viaje.moneda && dto.moneda.toUpperCase() !== viaje.moneda.toUpperCase()) {
      throw new UnprocessableEntityException(`La moneda del pago (${dto.moneda}) no coincide con la del viaje (${viaje.moneda}).`);
    }

    let pago = await this.pagoRepo.findOne({ where: { tenantId, idExterno: dto.idViaje } });
    if (pago && pago.estado !== EstadoReciboViaje.ERROR) {
      if (pago.referencia === dto.referencia) return this.respuestaPago(viaje, pago, true);
      throw new ConflictException(`El viaje ${dto.idViaje} ya fue pagado con la referencia ${pago.referencia}.`);
    }
    if (pago) {
      // Reintento después de un recibo con ERROR: se conserva el pago y se vuelve a generar el recibo.
      pago.referencia = dto.referencia;
      pago.metodo = dto.metodo ?? pago.metodo;
      pago.intentos += 1;
    } else {
      pago = this.pagoRepo.create({
        tenantId,
        viajeId: viaje.id,
        idExterno: viaje.idExterno,
        monto: String(esperado),
        moneda: viaje.moneda || 'USD',
        referencia: dto.referencia,
        metodo: dto.metodo ?? null,
        fechaPago: dto.fechaPago ? new Date(dto.fechaPago) : new Date(),
        estado: EstadoReciboViaje.ERROR,
        modo: 'NEXUS',
        intentos: 1,
      });
      try {
        pago = await this.pagoRepo.save(pago);
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          const otro = await this.pagoRepo.findOne({ where: { tenantId, idExterno: dto.idViaje } });
          if (otro && otro.referencia === dto.referencia) return this.respuestaPago(viaje, otro, true);
          throw new ConflictException(`El viaje ${dto.idViaje} ya tiene un pago en proceso.`);
        }
        throw err;
      }
    }

    viaje.estadoPago = 'PAGADO';
    await this.viajeRepo.save(viaje);
    pago = await this.generarRecibo(viaje, pago);
    return this.respuestaPago(viaje, pago, false);
  }

  /** Reintenta el recibo de un pago que quedó en ERROR (desde la pantalla). */
  async reintentarRecibo(tenantId: string, pagoId: string) {
    let pago = await this.pagoRepo.findOne({ where: { id: pagoId, tenantId } });
    if (!pago) throw new NotFoundException('Pago no encontrado.');
    if (pago.estado !== EstadoReciboViaje.ERROR) {
      throw new ConflictException(`El recibo ya está ${pago.estado} (${pago.cnrecibo ?? '—'}).`);
    }
    const viaje = await this.viajeRepo.findOne({ where: { id: pago.viajeId, tenantId } });
    if (!viaje) throw new NotFoundException('Viaje del pago no encontrado.');
    pago.intentos += 1;
    pago = await this.generarRecibo(viaje, pago);
    return this.respuestaPago(viaje, pago, false);
  }

  listarPagos(tenantId: string, limit = 100) {
    return this.pagoRepo.find({
      where: { tenantId },
      order: { creadoEn: 'DESC' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  /** Arma el recibo del viaje y lo genera: REAL vía nest-api (FLOTA_RECIBO_REAL=1) o SIMULADO. */
  private async generarRecibo(viaje: FlotaViaje, pago: FlotaPagoViaje): Promise<FlotaPagoViaje> {
    const cnpoliza = viaje.cnpoliza || (await this.flota.getConfig(viaje.tenantId)).cnpoliza;
    let ccerti = viaje.ccerti;
    if (ccerti == null) {
      const cert = await this.resolverCertificado(viaje.tenantId, cnpoliza, viaje.conductorDoc, viaje.placa);
      if (cert) {
        ccerti = cert.ccerti;
        viaje.ccerti = ccerti;
        await this.viajeRepo.save(viaje);
      }
    }
    pago.cnpoliza = cnpoliza;
    pago.ccerti = ccerti;
    const real = this.sis2000.reciboRealActivo();
    pago.modo = real ? 'REAL' : 'NEXUS';

    if (ccerti == null) {
      pago.estado = EstadoReciboViaje.ERROR;
      pago.error = `El conductor ${viaje.conductorDoc ?? ''} / placa ${viaje.placa} no tiene certificado activo en la póliza ${cnpoliza}. ` +
        'Asócielo en "Certificados" y reintente el recibo.';
      pago.payload = null;
      return this.pagoRepo.save(pago);
    }

    const inicio = new Date(viaje.inicio);
    const fin = viaje.fin ? new Date(viaje.fin) : inicio;
    const payload: ReciboCertificadoPayload = {
      cnpoliza,
      ccerti,
      mprima: num(pago.monto),
      cmoneda: monedaSis2000(pago.moneda),
      fdesde: isoDia(inicio),
      fhasta: isoDia(fin),
      creferencia: `VIAJE:${viaje.idExterno}`.slice(0, 120),
      xobservacion: `Viaje ${viaje.idExterno} · ${viaje.clasificacion ?? ''} ${num(viaje.km)} km · pago ${pago.referencia}`.slice(0, 250),
      cusuario: this.sis2000.cusuario(),
    };
    pago.payload = { ...payload, endpoint: `POST ${this.sis2000.rutaRecibo(cnpoliza, ccerti)}` };

    // Recibo propio (flota_recibos): COBRADO con la referencia del pago, en ambos modos.
    if (!pago.id) pago = await this.pagoRepo.save(pago);
    let propio: Awaited<ReturnType<FlotaRecibosService['cobrar']>> = null;
    try {
      propio = await this.recibos.cobrar(viaje, {
        id: pago.id, referencia: pago.referencia, metodo: pago.metodo, fechaPago: pago.fechaPago, monto: pago.monto, moneda: pago.moneda,
      });
    } catch (err) {
      pago.estado = EstadoReciboViaje.ERROR;
      pago.error = `Recibo Nexus: ${(err as Error).message}`.slice(0, 2000);
      return this.pagoRepo.save(pago);
    }

    if (real) {
      try {
        const r = await this.sis2000.crearReciboCertificado(payload);
        pago.estado = EstadoReciboViaje.RECIBO_GENERADO;
        pago.cnrecibo = r.cnrecibo;
        pago.crecibo = r.crecibo;
        pago.respuesta = { yaExistia: r.yaExistia, respuesta: r.data as Record<string, unknown> };
        pago.error = null;
        if (propio) await this.recibos.marcarSync(propio, true, { cnrecibo: r.cnrecibo, crecibo: r.crecibo });
      } catch (err) {
        const e = err as { response?: { status?: number; data?: unknown }; message?: string };
        pago.estado = EstadoReciboViaje.ERROR;
        pago.error = `nest-api ${e.response?.status ?? ''}: ${JSON.stringify(e.response?.data ?? e.message ?? 'Error desconocido')}`.slice(0, 2000);
        pago.respuesta = { status: e.response?.status ?? null };
        this.logger.warn(`Recibo por viaje ${viaje.idExterno} falló: ${pago.error}`);
        if (propio) await this.recibos.marcarSync(propio, false, { error: pago.error });
      }
    } else if (!propio) {
      pago.estado = EstadoReciboViaje.ERROR;
      pago.error = `No se pudo numerar el recibo del viaje ${viaje.idExterno} (sin monto o sin certificado).`;
    } else {
      // Fase 1: número propio de Nexus (flota_recibos); queda sync_sis2000=PENDIENTE hasta que existan los SP.
      pago.estado = EstadoReciboViaje.RECIBO_NEXUS;
      pago.cnrecibo = propio.numero;
      pago.crecibo = null;
      pago.respuesta = {
        nexus: true, reciboId: propio.id, syncSis2000: propio.syncSis2000,
        nota: 'Recibo propio de Nexus, pendiente de sincronizar con Sis2000 (FLOTA_RECIBO_REAL=0).',
      };
      pago.error = null;
    }
    return this.pagoRepo.save(pago);
  }

  private resumenPago(p: FlotaPagoViaje) {
    return {
      id: p.id,
      referencia: p.referencia,
      monto: num(p.monto),
      moneda: p.moneda,
      fechaPago: p.fechaPago,
      intentos: p.intentos,
      recibo: {
        estado: p.estado,
        modo: p.modo,
        cnpoliza: p.cnpoliza,
        ccerti: p.ccerti,
        cnrecibo: p.cnrecibo,
        crecibo: p.crecibo,
        error: p.error,
      },
    };
  }

  private respuestaPago(viaje: FlotaViaje, pago: FlotaPagoViaje, duplicado: boolean) {
    return {
      idViaje: viaje.idExterno,
      estadoPago: viaje.estadoPago,
      duplicado,
      pago: this.resumenPago(pago),
    };
  }
}
