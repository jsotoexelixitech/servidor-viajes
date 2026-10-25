import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { In, Repository } from 'typeorm';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { FlotaConfig, ModalidadCobro, ModoCierre } from './entities/flota-config.entity';
import { EstadoViajeFlota, FlotaViaje } from './entities/flota-viaje.entity';
import { EstadoCierre, FlotaCierre } from './entities/flota-cierre.entity';
import {
  CancelarViajeDto, ConfigCobroDto, FinViajeDto, InicioViajeDto, SimularDto,
} from './dto/flota.dto';

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Estados de cierre que aún se pueden recalcular o regenerar (el simulado no tocó Sis2000). */
const EDITABLES = [EstadoCierre.BORRADOR, EstadoCierre.ERROR, EstadoCierre.RECIBO_SIMULADO];

/** Rango del mes: desde = día 1, hasta = día 1 del mes siguiente (exclusivo). */
function rangoMes(periodo: string): { desde: string; hasta: string; desdeD: Date; hastaD: Date } {
  const [y, m] = periodo.split('-').map(Number);
  const desdeD = new Date(Date.UTC(y, m - 1, 1));
  const hastaD = new Date(Date.UTC(y, m, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { desde: iso(desdeD), hasta: iso(hastaD), desdeD, hastaD };
}

function periodoActual(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function periodoAnterior(): string {
  const d = new Date();
  const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, '0')}`;
}

const NOMBRES = ['José Pérez', 'María González', 'Luis Rodríguez', 'Ana Martínez', 'Carlos Hernández',
  'Daniela López', 'Pedro Díaz', 'Gabriela Torres', 'Andrés Rojas', 'Valentina Suárez',
  'Miguel Castillo', 'Paola Ramírez', 'Jorge Mendoza', 'Carla Silva', 'Ricardo Flores'];
const ZONAS = ['Altamira', 'Chacao', 'Las Mercedes', 'El Rosal', 'Los Palos Grandes', 'La Castellana',
  'Sabana Grande', 'Bello Monte', 'El Cafetal', 'La Trinidad', 'Los Dos Caminos', 'El Hatillo'];

@Injectable()
export class FlotaService {
  private readonly logger = new Logger(FlotaService.name);

  constructor(
    @InjectRepository(FlotaConfig) private readonly configRepo: Repository<FlotaConfig>,
    @InjectRepository(FlotaViaje) private readonly viajeRepo: Repository<FlotaViaje>,
    @InjectRepository(FlotaCierre) private readonly cierreRepo: Repository<FlotaCierre>,
    private readonly config: ConfigService,
  ) {}

  // ── Configuración de cobro ────────────────────────────────────────────────

  async getConfig(tenantId: string): Promise<FlotaConfig> {
    const actual = await this.configRepo.findOne({
      where: { tenantId, activa: true },
      order: { creadoEn: 'DESC' },
    });
    if (actual) return actual;
    // Sin configuración todavía: valores por defecto (no se guardan hasta que se edite).
    return this.configRepo.create({
      tenantId,
      cnpoliza: this.config.get<string>('FLOTA_CNPOLIZA_DEFAULT') || '18-1-1130480881',
      cplan: this.config.get<string>('FLOTA_CPLAN_DEFAULT') || null,
      modalidad: ModalidadCobro.TIEMPO,
      tarifa: '0',
      moneda: 'USD',
      minimoPorViaje: '0',
      redondearUnidad: true,
      modoCierre: ModoCierre.MANUAL,
      diaCierre: 1,
      activa: true,
    });
  }

  async setConfig(tenantId: string, dto: ConfigCobroDto, usuario?: string): Promise<FlotaConfig> {
    await this.configRepo.update({ tenantId, activa: true }, { activa: false });
    const nueva = this.configRepo.create({
      tenantId,
      cnpoliza: dto.cnpoliza.trim(),
      cplan: dto.cplan?.trim() || null,
      modalidad: dto.modalidad as ModalidadCobro,
      tarifa: String(dto.tarifa),
      moneda: (dto.moneda || 'USD').toUpperCase(),
      minimoPorViaje: String(dto.minimoPorViaje ?? 0),
      redondearUnidad: dto.redondearUnidad ?? true,
      modoCierre: dto.modoCierre as ModoCierre,
      diaCierre: dto.diaCierre ?? 1,
      activa: true,
      creadoPor: usuario ?? null,
    });
    return this.configRepo.save(nueva);
  }

  historialConfig(tenantId: string) {
    return this.configRepo.find({ where: { tenantId }, order: { creadoEn: 'DESC' }, take: 20 });
  }

  /** Costo de un viaje con la configuración dada. */
  calcularCosto(cfg: FlotaConfig, minutos: number, km: number): number {
    let unidades = cfg.modalidad === ModalidadCobro.KM ? km : minutos;
    if (cfg.redondearUnidad) unidades = Math.ceil(unidades - 1e-9);
    const costo = Math.max(unidades * num(cfg.tarifa), num(cfg.minimoPorViaje));
    return r2(costo);
  }

  // ── Viajes (lo que manda la plataforma) ──────────────────────────────────

  async iniciarViaje(tenantId: string, dto: InicioViajeDto, simulado = false): Promise<FlotaViaje> {
    const existente = await this.viajeRepo.findOne({ where: { tenantId, idExterno: dto.idExterno } });
    if (existente) return existente; // idempotente
    const viaje = this.viajeRepo.create({
      tenantId,
      idExterno: dto.idExterno,
      placa: dto.placa.trim().toUpperCase(),
      conductorDoc: dto.conductorDoc?.trim() || null,
      conductorNombre: dto.conductorNombre?.trim() || null,
      estado: EstadoViajeFlota.INICIADO,
      inicio: dto.inicio ? new Date(dto.inicio) : new Date(),
      origen: dto.origen ?? null,
      simulado,
    });
    return this.viajeRepo.save(viaje);
  }

  async finalizarViaje(tenantId: string, dto: FinViajeDto): Promise<FlotaViaje> {
    const viaje = await this.viajeRepo.findOne({ where: { tenantId, idExterno: dto.idExterno } });
    if (!viaje) throw new NotFoundException(`Viaje ${dto.idExterno} no existe (debe iniciarse primero).`);
    if (viaje.estado === EstadoViajeFlota.FINALIZADO) return viaje; // idempotente
    if (viaje.estado === EstadoViajeFlota.CANCELADO) {
      throw new BadRequestException(`Viaje ${dto.idExterno} está cancelado.`);
    }
    const fin = dto.fin ? new Date(dto.fin) : new Date();
    if (fin.getTime() < new Date(viaje.inicio).getTime()) {
      throw new BadRequestException('La hora de fin es anterior al inicio del viaje.');
    }
    const minutos = r2((fin.getTime() - new Date(viaje.inicio).getTime()) / 60000);
    const km = num(dto.km);
    const cfg = await this.getConfig(tenantId);
    viaje.fin = fin;
    viaje.minutos = String(minutos);
    viaje.km = String(km);
    viaje.destino = dto.destino ?? null;
    viaje.costo = String(this.calcularCosto(cfg, minutos, km));
    viaje.moneda = cfg.moneda;
    viaje.configId = cfg.id ?? null;
    viaje.estado = EstadoViajeFlota.FINALIZADO;
    return this.viajeRepo.save(viaje);
  }

  async cancelarViaje(tenantId: string, dto: CancelarViajeDto): Promise<FlotaViaje> {
    const viaje = await this.viajeRepo.findOne({ where: { tenantId, idExterno: dto.idExterno } });
    if (!viaje) throw new NotFoundException(`Viaje ${dto.idExterno} no existe.`);
    if (viaje.estado === EstadoViajeFlota.FINALIZADO) {
      throw new BadRequestException('No se puede cancelar un viaje finalizado.');
    }
    viaje.estado = EstadoViajeFlota.CANCELADO;
    viaje.fin = new Date();
    viaje.costo = '0';
    return this.viajeRepo.save(viaje);
  }

  /** Feed: últimos eventos de viaje (más recientes primero). */
  async feed(tenantId: string, limit = 50, estado?: string) {
    const qb = this.viajeRepo.createQueryBuilder('v')
      .where('v.tenant_id = :tenantId', { tenantId })
      .orderBy('COALESCE(v.fin, v.inicio)', 'DESC')
      .limit(Math.min(Math.max(limit, 1), 500));
    if (estado) qb.andWhere('v.estado = :estado', { estado });
    return qb.getMany();
  }

  /** Resumen del mes: totales y detalle por conductor (participación = prorrateo del recibo). */
  async resumen(tenantId: string, periodo = periodoActual()) {
    const { desdeD, hastaD, desde, hasta } = rangoMes(periodo);
    const finalizados = await this.viajeRepo.createQueryBuilder('v')
      .where('v.tenant_id = :tenantId', { tenantId })
      .andWhere('v.estado = :estado', { estado: EstadoViajeFlota.FINALIZADO })
      .andWhere('v.fin >= :desde AND v.fin < :hasta', { desde: desdeD, hasta: hastaD })
      .getMany();
    const enCurso = await this.viajeRepo.count({ where: { tenantId, estado: EstadoViajeFlota.INICIADO } });

    const total = finalizados.reduce((a, v) => a + num(v.costo), 0);
    const porConductor = new Map<string, {
      conductorDoc: string | null; conductorNombre: string; placas: Set<string>;
      viajes: number; km: number; minutos: number; costo: number;
    }>();
    for (const v of finalizados) {
      const key = v.conductorDoc || v.conductorNombre || v.placa;
      const c = porConductor.get(key) ?? {
        conductorDoc: v.conductorDoc, conductorNombre: v.conductorNombre || '(sin nombre)',
        placas: new Set<string>(), viajes: 0, km: 0, minutos: 0, costo: 0,
      };
      c.placas.add(v.placa);
      c.viajes += 1;
      c.km += num(v.km);
      c.minutos += num(v.minutos);
      c.costo += num(v.costo);
      porConductor.set(key, c);
    }
    const conductores = [...porConductor.values()]
      .map((c) => ({
        conductorDoc: c.conductorDoc,
        conductorNombre: c.conductorNombre,
        placas: [...c.placas],
        viajes: c.viajes,
        km: r2(c.km),
        minutos: r2(c.minutos),
        costo: r2(c.costo),
        participacion: total > 0 ? r2((c.costo / total) * 100) : 0,
      }))
      .sort((a, b) => b.costo - a.costo);

    const cfg = await this.getConfig(tenantId);
    return {
      periodo, desde, hasta,
      cnpoliza: cfg.cnpoliza,
      moneda: cfg.moneda,
      totalViajes: finalizados.length,
      totalKm: r2(finalizados.reduce((a, v) => a + num(v.km), 0)),
      totalMinutos: r2(finalizados.reduce((a, v) => a + num(v.minutos), 0)),
      totalMonto: r2(total),
      enCurso,
      conductores,
    };
  }

  // ── Simulador (pruebas sin Ridery) ───────────────────────────────────────

  async simular(tenantId: string, dto: SimularDto) {
    const cantidad = dto.cantidad ?? 50;
    const periodo = dto.periodo ?? periodoActual();
    const nCond = Math.min(dto.conductores ?? 8, NOMBRES.length);
    const enCurso = dto.enCurso ?? 0;
    const { desdeD, hastaD } = rangoMes(periodo);
    const ahora = Date.now();
    const limite = Math.min(hastaD.getTime(), ahora);
    if (limite <= desdeD.getTime()) throw new BadRequestException('El período no puede ser futuro.');

    const conductores = Array.from({ length: nCond }, (_, i) => ({
      doc: `V${String(10000000 + i * 1234567).slice(0, 8)}`,
      nombre: NOMBRES[i],
      placa: `SIM${String(100 + i).padStart(3, '0')}${String.fromCharCode(65 + (i % 26))}`,
    }));
    const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

    let creados = 0;
    for (let i = 0; i < cantidad; i++) {
      const c = pick(conductores);
      const duracionMin = 5 + Math.random() * 50;
      const inicioMs = desdeD.getTime() + Math.random() * Math.max(limite - desdeD.getTime() - duracionMin * 60000, 1);
      const idExterno = `SIM-${randomUUID()}`;
      await this.iniciarViaje(tenantId, {
        idExterno, placa: c.placa, conductorDoc: c.doc, conductorNombre: c.nombre,
        inicio: new Date(inicioMs).toISOString(), origen: { direccion: pick(ZONAS) },
      }, true);
      await this.finalizarViaje(tenantId, {
        idExterno,
        fin: new Date(inicioMs + duracionMin * 60000).toISOString(),
        km: r2(1.5 + duracionMin * (0.25 + Math.random() * 0.35)),
        destino: { direccion: pick(ZONAS) },
      });
      creados += 1;
    }
    for (let i = 0; i < enCurso; i++) {
      const c = pick(conductores);
      await this.iniciarViaje(tenantId, {
        idExterno: `SIM-${randomUUID()}`, placa: c.placa, conductorDoc: c.doc, conductorNombre: c.nombre,
        inicio: new Date(ahora - Math.random() * 20 * 60000).toISOString(), origen: { direccion: pick(ZONAS) },
      }, true);
    }
    return { periodo, finalizados: creados, enCurso, conductores: nCond };
  }

  /** Borra los viajes simulados que no entraron en un cierre con recibo. */
  async borrarSimulados(tenantId: string) {
    // Solo se conservan los simulados que quedaron en un recibo REAL (no debería pasar, pero no se tocan).
    const reales = (await this.cierreRepo.find({
      where: { tenantId, estado: EstadoCierre.RECIBO_GENERADO }, select: ['id'],
    })).map((c) => c.id);
    const qb = this.viajeRepo.createQueryBuilder().delete().from(FlotaViaje)
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('simulado = true');
    if (reales.length) qb.andWhere('(cierre_id IS NULL OR cierre_id NOT IN (:...reales))', { reales });
    const res = await qb.execute();
    return { borrados: res.affected ?? 0 };
  }

  // ── Cierres mensuales y recibo ───────────────────────────────────────────

  listarCierres(tenantId: string) {
    return this.cierreRepo.find({ where: { tenantId }, order: { periodo: 'DESC' }, take: 24 });
  }

  /** Calcula (o recalcula) el cierre del mes. Solo se puede recalcular mientras esté en BORRADOR/ERROR. */
  async calcularCierre(tenantId: string, periodo: string): Promise<FlotaCierre> {
    const existente = await this.cierreRepo.findOne({ where: { tenantId, periodo } });
    if (existente && !EDITABLES.includes(existente.estado)) {
      throw new BadRequestException(`El cierre ${periodo} ya tiene recibo (${existente.cnrecibo}).`);
    }
    const r = await this.resumen(tenantId, periodo);
    const cierre = existente ?? this.cierreRepo.create({ tenantId, periodo });
    Object.assign(cierre, {
      cnpoliza: r.cnpoliza,
      desde: r.desde,
      hasta: r.hasta,
      totalViajes: r.totalViajes,
      totalKm: String(r.totalKm),
      totalMinutos: String(r.totalMinutos),
      monto: String(r.totalMonto),
      moneda: r.moneda,
      estado: EstadoCierre.BORRADOR,
      error: null,
    });
    return this.cierreRepo.save(cierre);
  }

  async generarRecibo(tenantId: string, cierreId: string, modo: 'SIMULADO' | 'REAL' = 'SIMULADO') {
    const cierre = await this.cierreRepo.findOne({ where: { id: cierreId, tenantId } });
    if (!cierre) throw new NotFoundException('Cierre no encontrado.');
    if (!EDITABLES.includes(cierre.estado)) {
      throw new BadRequestException(`El cierre ${cierre.periodo} ya tiene recibo (${cierre.cnrecibo}).`);
    }
    if (num(cierre.monto) <= 0) throw new BadRequestException('El cierre no tiene monto a cobrar.');

    const cfg = await this.getConfig(tenantId);
    const payload = {
      cnpoliza: cierre.cnpoliza,
      mprima: num(cierre.monto),
      fdesde: cierre.desde,
      fhasta: cierre.hasta,
      cplan: cfg.cplan || undefined,
      ifrecuencia: 'A', // un solo recibo por el total del mes
    };

    if (modo === 'REAL') {
      if (this.config.get<string>('FLOTA_RECIBO_REAL') !== '1') {
        throw new BadRequestException('El recibo real está desactivado (FLOTA_RECIBO_REAL=1 para activarlo).');
      }
      const base = (this.config.get<string>('NEST_API_URL') || '').replace(/\/$/, '');
      const apikey = this.config.get<string>('NEST_API_KEY') || '';
      if (!base || !apikey) throw new BadRequestException('Falta NEST_API_URL o NEST_API_KEY.');
      try {
        const { data } = await axios.post(`${base}/api/endosos/recibos`, payload, {
          headers: { apikey, 'Content-Type': 'application/json' },
          timeout: 60000,
        });
        const cnrecibo = data?.cnrecibo ?? data?.data?.cnrecibo ?? data?.result?.cnrecibo ?? null;
        cierre.estado = EstadoCierre.RECIBO_GENERADO;
        cierre.cnrecibo = cnrecibo ? String(cnrecibo) : null;
        cierre.respuesta = { payload, respuesta: data };
      } catch (err) {
        const e = err as { response?: { status?: number; data?: unknown }; message?: string };
        cierre.estado = EstadoCierre.ERROR;
        cierre.error = JSON.stringify(e.response?.data ?? e.message ?? 'Error desconocido').slice(0, 2000);
        cierre.respuesta = { payload, status: e.response?.status ?? null };
        await this.cierreRepo.save(cierre);
        throw new BadRequestException(`nest-api rechazó el recibo: ${cierre.error}`);
      }
    } else {
      cierre.estado = EstadoCierre.RECIBO_SIMULADO;
      cierre.cnrecibo = `SIM-${cierre.periodo}-${Math.floor(1000 + Math.random() * 9000)}`;
      cierre.respuesta = { simulado: true, payload, nota: 'No se llamó a Sis2000.' };
    }
    cierre.generadoEn = new Date();
    cierre.error = null;
    await this.cierreRepo.save(cierre);

    // Marcar los viajes del período como incluidos en este cierre.
    const { desdeD, hastaD } = rangoMes(cierre.periodo);
    const ids = (await this.viajeRepo.createQueryBuilder('v')
      .select('v.id', 'id')
      .where('v.tenant_id = :tenantId', { tenantId })
      .andWhere('v.estado = :estado', { estado: EstadoViajeFlota.FINALIZADO })
      .andWhere('v.fin >= :desde AND v.fin < :hasta', { desde: desdeD, hasta: hastaD })
      .getRawMany<{ id: string }>()).map((r) => r.id);
    if (ids.length) await this.viajeRepo.update({ id: In(ids) }, { cierreId: cierre.id });
    return cierre;
  }

  /** Detalle del cierre (resumen por conductor del período). */
  async detalleCierre(tenantId: string, cierreId: string) {
    const cierre = await this.cierreRepo.findOne({ where: { id: cierreId, tenantId } });
    if (!cierre) throw new NotFoundException('Cierre no encontrado.');
    return { cierre, resumen: await this.resumen(tenantId, cierre.periodo) };
  }

  /** Cierre automático: todos los días a la 01:30; corre si hoy es el día de cierre configurado. */
  @Cron('0 30 1 * * *')
  async cierreAutomatico() {
    const hoy = new Date().getUTCDate();
    const configs = await this.configRepo.find({ where: { activa: true, modoCierre: ModoCierre.AUTO } });
    const modo = this.config.get<string>('FLOTA_RECIBO_REAL') === '1' ? 'REAL' : 'SIMULADO';
    for (const cfg of configs) {
      if (cfg.diaCierre !== hoy) continue;
      const periodo = periodoAnterior();
      try {
        const existente = await this.cierreRepo.findOne({ where: { tenantId: cfg.tenantId, periodo } });
        if (existente && !EDITABLES.includes(existente.estado)) continue;
        const cierre = await this.calcularCierre(cfg.tenantId, periodo);
        if (num(cierre.monto) > 0) await this.generarRecibo(cfg.tenantId, cierre.id, modo);
        this.logger.log(`Cierre automático ${periodo} tenant=${cfg.tenantId} monto=${cierre.monto} modo=${modo}`);
      } catch (err) {
        this.logger.error(`Cierre automático ${periodo} tenant=${cfg.tenantId}: ${(err as Error).message}`);
      }
    }
  }
}
