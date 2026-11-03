import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { EstadoViajeFlota, FlotaViaje } from './entities/flota-viaje.entity';
import { FlotaCertificado } from './entities/flota-certificado.entity';
import { EstadoReciboViaje, FlotaPagoViaje } from './entities/flota-pago-viaje.entity';
import { FlotaService } from './flota.service';
import {
  CertificadoSis2000, FlotaSis2000Client, PolizaSis2000, ReciboSis2000,
} from './flota-sis2000.client';
import { FlotaVivoBus } from './flota-vivo.bus';
import { EstadoReciboNexus, FlotaRecibo } from './entities/flota-recibo.entity';
import { FlotaPoliza } from './entities/flota-poliza.entity';

/**
 * "Póliza en vivo": el cuadro-recibo de la póliza de flota (mismo modelo que el PDF
 * "CUADRO - RECIBO DE PÓLIZA AUTOMOVIL" de nest-api: template_advhplantilla.html) armado con datos vivos:
 *   cabecera   → nest-api GET /api/flota/polizas/:cnpoliza (adpoliza + vhcerti) o, si no hay, la configuración local;
 *   por conductor (certificado) → DATOS DEL VEHÍCULO, COBERTURAS y RECIBOS DE PRIMAS = un recibo por viaje.
 * Solo lectura: no escribe nada ni en Postgres ni en Sis2000.
 */

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const txt = (v: unknown): string | null => (v == null || String(v).trim() === '' ? null : String(v).trim());

const ESTATUS_POLIZA: Record<string, string> = {
  V: 'VIGENTE', E: 'EMITIDA', P: 'PENDIENTE', A: 'ANULADA', N: 'ANULADA', C: 'CANCELADA', R: 'RENOVADA',
};
const ESTATUS_CERT: Record<string, string> = { V: 'VIGENTE', E: 'EMITIDO', P: 'PENDIENTE', N: 'ANULADO', A: 'ANULADO' };
const FRECUENCIA: Record<string, string> = {
  M: 'MENSUAL', T: 'TRIMESTRAL', S: 'SEMESTRAL', A: 'ANUAL', U: 'ÚNICA', B: 'BIMESTRAL', V: 'POR VIAJE',
};
const TIPO_POLIZA: Record<string, string> = { C: 'COLECTIVA (FLOTA)', I: 'INDIVIDUAL' };
const ESTADO_REC_SIS2000: Record<string, string> = { P: 'PENDIENTE', C: 'COBRADO', A: 'ANULADO' };

export const monedaLabel = (m?: string | null): string => {
  const s = String(m ?? 'USD').trim().toUpperCase();
  if (s === '$' || s === 'USD') return 'DÓLAR ($)';
  if (s === 'BS' || s === 'VES' || s === 'VEF') return 'BOLÍVARES (Bs)';
  return s;
};

/** Estado del recibo de un viaje en la vista (lo que ve operación). */
export type EstadoReciboVivo = 'EN_CURSO' | 'PENDIENTE' | 'PAGADO' | 'ERROR' | 'ANULADO';

export interface ReciboVivo {
  idViaje: string;
  /** N° de recibo: propio de Nexus (RDY-…, nace al finalizar el viaje), real de Sis2000 (FLOTA_RECIBO_REAL=1) o SIM-… (histórico). */
  nRecibo: string | null;
  crecibo: string | null;
  tipo: string;
  clasificacion: string | null;
  km: number | null;
  minutos: number | null;
  desde: Date;
  hasta: Date | null;
  fechaCobro: Date | null;
  moneda: string;
  prima: number;
  estado: EstadoReciboVivo;
  /** RECIBO_SIMULADO / RECIBO_GENERADO / ERROR (lo que pasó al generar el recibo). */
  estadoRecibo: EstadoReciboViaje | null;
  modo: 'SIMULADO' | 'REAL' | 'NEXUS' | null;
  /** Recibo propio (flota_recibos): PENDIENTE / COBRADO / ANULADO. */
  estadoNexus: EstadoReciboNexus | null;
  /** Subida a Sis2000 del recibo propio: PENDIENTE / OK / ERROR. */
  syncSis2000: string | null;
  cnreciboSis2000: string | null;
  referencia: string | null;
  metodo: string | null;
  error: string | null;
  /** Estado del recibo en Sis2000 (adrecibos.iestadorec), solo con recibo real y nest-api disponible. */
  estadoSis2000: string | null;
}

export interface TotalesVivo {
  viajes: number;
  enCurso: number;
  cancelados: number;
  km: number;
  pagados: number;
  primasCobradas: number;
  primasPendientes: number;
  recibosError: number;
  /** Recibos propios anulados (no suman primas). */
  anulados: number;
}

export interface CertificadoVivo {
  ccerti: number | null;
  placa: string | null;
  conductorDoc: string | null;
  conductorNombre: string | null;
  estatus: string;
  activo: boolean;
  origen: string;
  plan: string | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  recibosSis2000: number | null;
  ultimoMovimiento: Date | null;
  totales: TotalesVivo;
  coberturas: { nombre: string; suma: number | null; prima: number }[];
  recibos: ReciboVivo[];
}

export interface CoberturaConfig {
  nombre: string;
  suma: number | null;
  pct: number;
}

const COBERTURAS_DEFECTO: CoberturaConfig[] = [
  { nombre: 'RESPONSABILIDAD CIVIL DE VEHÍCULOS (POR VIAJE)', suma: null, pct: 100 },
];

/** FLOTA_COBERTURAS_JSON = [{"nombre":"…","suma":5000,"pct":100}] (pct = parte de la prima del viaje). */
export function leerCoberturas(raw?: string | null): CoberturaConfig[] {
  if (!raw) return COBERTURAS_DEFECTO;
  try {
    const arr = JSON.parse(raw) as Partial<CoberturaConfig>[];
    const ok = Array.isArray(arr)
      ? arr.filter((c) => c && txt(c.nombre)).map((c) => ({
        nombre: String(c.nombre).trim(),
        suma: c.suma == null ? null : num(c.suma),
        pct: c.pct == null ? 100 : num(c.pct),
      }))
      : [];
    return ok.length ? ok : COBERTURAS_DEFECTO;
  } catch {
    return COBERTURAS_DEFECTO;
  }
}

const totalesVacios = (): TotalesVivo => ({
  viajes: 0, enCurso: 0, cancelados: 0, km: 0, pagados: 0, primasCobradas: 0, primasPendientes: 0, recibosError: 0, anulados: 0,
});

function sumar(t: TotalesVivo, v: FlotaViaje, pago?: FlotaPagoViaje | null, propio?: FlotaRecibo | null) {
  if (v.estado === EstadoViajeFlota.CANCELADO) { t.cancelados += 1; return; }
  if (v.estado === EstadoViajeFlota.INICIADO) { t.enCurso += 1; return; }
  t.viajes += 1;
  t.km = r3(t.km + num(v.km));
  if (propio?.estado === EstadoReciboNexus.ANULADO) { t.anulados += 1; return; }
  if (pago) {
    t.pagados += 1;
    t.primasCobradas = r2(t.primasCobradas + num(pago.monto));
    if (pago.estado === EstadoReciboViaje.ERROR) t.recibosError += 1;
  } else {
    t.primasPendientes = r2(t.primasPendientes + num(v.costo));
  }
}

/** Recibo por viaje (función pura). Cancelados no generan recibo. */
export function reciboDeViaje(
  v: FlotaViaje,
  pago: FlotaPagoViaje | null | undefined,
  sis2000?: Map<string, ReciboSis2000>,
  propio?: FlotaRecibo | null,
): ReciboVivo | null {
  if (v.estado === EstadoViajeFlota.CANCELADO) return null;
  let estado: EstadoReciboVivo;
  if (v.estado === EstadoViajeFlota.INICIADO) estado = 'EN_CURSO';
  else if (propio?.estado === EstadoReciboNexus.ANULADO) estado = 'ANULADO';
  else if (!pago) estado = 'PENDIENTE';
  else if (pago.estado === EstadoReciboViaje.ERROR) estado = 'ERROR';
  else estado = 'PAGADO';
  const real = pago?.cnrecibo ? sis2000?.get(pago.cnrecibo) : undefined;
  return {
    idViaje: v.idExterno,
    // Con recibo REAL se muestra el de Sis2000; si no, el propio de Nexus (o el SIM-… histórico).
    nRecibo: (pago?.modo === 'REAL' ? pago.cnrecibo : null) ?? propio?.numero ?? pago?.cnrecibo ?? null,
    crecibo: pago?.crecibo ?? (real ? String(real.crecibo) : null),
    tipo: 'POR VIAJE',
    clasificacion: v.clasificacion,
    km: v.estado === EstadoViajeFlota.FINALIZADO ? num(v.km) : (v.kmEstimados != null ? num(v.kmEstimados) : null),
    minutos: v.estado === EstadoViajeFlota.FINALIZADO ? num(v.minutos) : null,
    desde: v.inicio,
    hasta: v.fin,
    fechaCobro: pago?.fechaPago ?? null,
    moneda: pago?.moneda ?? v.moneda ?? 'USD',
    prima: pago ? num(pago.monto) : (v.estado === EstadoViajeFlota.FINALIZADO ? num(v.costo) : num(v.montoEstimado)),
    estado,
    estadoRecibo: pago?.estado ?? null,
    modo: pago?.modo ?? (propio ? 'NEXUS' : null),
    estadoNexus: propio?.estado ?? null,
    syncSis2000: propio?.syncSis2000 ?? null,
    cnreciboSis2000: propio?.cnreciboSis2000 ?? null,
    referencia: pago?.referencia ?? null,
    metodo: pago?.metodo ?? null,
    error: pago?.error ?? null,
    estadoSis2000: real?.iestadorec ? (ESTADO_REC_SIS2000[real.iestadorec] ?? real.iestadorec) : null,
  };
}

/** Rango por defecto: el mes en curso. */
export function rangoFechas(desde?: string, hasta?: string): { desde: Date; hasta: Date } {
  const hoy = new Date();
  const d = desde && !Number.isNaN(Date.parse(desde)) ? new Date(`${desde.slice(0, 10)}T00:00:00`) : new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const h = hasta && !Number.isNaN(Date.parse(hasta)) ? new Date(`${hasta.slice(0, 10)}T23:59:59.999`) : new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59, 999);
  return { desde: d, hasta: h };
}

interface CacheSis2000 {
  en: number;
  ok: boolean;
  error: string | null;
  poliza: PolizaSis2000 | null;
  certificados: CertificadoSis2000[];
}

const CACHE_MS = 60_000;
const MAX_VIAJES = 3000;

@Injectable()
export class FlotaPolizaVivoService {
  private readonly logger = new Logger(FlotaPolizaVivoService.name);
  private readonly cache = new Map<string, CacheSis2000>();
  private readonly cacheRecibos = new Map<string, { en: number; recibos: ReciboSis2000[] }>();

  constructor(
    @InjectRepository(FlotaViaje) private readonly viajeRepo: Repository<FlotaViaje>,
    @InjectRepository(FlotaCertificado) private readonly certRepo: Repository<FlotaCertificado>,
    @InjectRepository(FlotaPagoViaje) private readonly pagoRepo: Repository<FlotaPagoViaje>,
    private readonly flota: FlotaService,
    private readonly sis2000: FlotaSis2000Client,
    private readonly bus: FlotaVivoBus,
    private readonly config: ConfigService,
    @InjectRepository(FlotaRecibo) private readonly reciboRepo?: Repository<FlotaRecibo>,
    @InjectRepository(FlotaPoliza) private readonly polizaRepo?: Repository<FlotaPoliza>,
  ) {}

  /** Póliza real desde nest-api, con caché de 60 s (también del error) para no golpear Sis2000 en cada consulta. */
  private async polizaSis2000(cnpoliza: string): Promise<CacheSis2000> {
    const c = this.cache.get(cnpoliza);
    if (c && Date.now() - c.en < CACHE_MS) return c;
    let nuevo: CacheSis2000;
    if (!this.sis2000.conexionConfigurada()) {
      nuevo = { en: Date.now(), ok: false, error: 'Sin conexión a nest-api (NEST_API_URL / NEST_API_KEY).', poliza: null, certificados: [] };
    } else {
      try {
        const r = await this.sis2000.polizaFlota(cnpoliza);
        nuevo = { en: Date.now(), ok: Boolean(r.poliza), error: r.poliza ? null : 'nest-api no devolvió la póliza.', ...r };
      } catch (err) {
        const e = err as { response?: { status?: number; data?: { message?: unknown } }; message?: string };
        const msg = e.response?.data?.message ?? e.message ?? 'error';
        nuevo = {
          en: Date.now(), ok: false, poliza: null, certificados: [],
          error: `nest-api ${e.response?.status ?? ''} ${Array.isArray(msg) ? msg.join(', ') : String(msg)}`.trim().slice(0, 300),
        };
        this.logger.warn(`Póliza en vivo ${cnpoliza}: ${nuevo.error}`);
      }
    }
    this.cache.set(cnpoliza, nuevo);
    return nuevo;
  }

  /** Recibos reales de los certificados con recibos REAL (solo con FLOTA_RECIBO_REAL=1 y nest-api arriba). */
  private async recibosReales(cnpoliza: string, ccertis: number[]): Promise<Map<string, ReciboSis2000>> {
    const mapa = new Map<string, ReciboSis2000>();
    for (const ccerti of ccertis.slice(0, 50)) {
      const k = `${cnpoliza}#${ccerti}`;
      let c = this.cacheRecibos.get(k);
      if (!c || Date.now() - c.en >= CACHE_MS) {
        try {
          c = { en: Date.now(), recibos: await this.sis2000.recibosCertificado(cnpoliza, ccerti) };
        } catch {
          c = { en: Date.now(), recibos: [] };
        }
        this.cacheRecibos.set(k, c);
      }
      for (const r of c.recibos) if (r.cnrecibo) mapa.set(String(r.cnrecibo).trim(), r);
    }
    return mapa;
  }

  async cuadro(tenantId: string, tenantNombre: string, q: { rev?: string; desde?: string; hasta?: string }) {
    const rev = this.bus.rev(tenantId);
    if (q.rev && q.rev === rev) return { rev, sinCambios: true as const };

    const cfg = await this.flota.getConfig(tenantId);
    const cnpoliza = cfg.cnpoliza;
    const { desde, hasta } = rangoFechas(q.desde, q.hasta);
    const reciboReal = this.sis2000.reciboRealActivo();

    const [sis, certsLocales, viajes] = await Promise.all([
      this.polizaSis2000(cnpoliza),
      this.certRepo.find({ where: { tenantId, cnpoliza }, order: { ccerti: 'ASC' } }),
      this.viajeRepo.find({
        where: { tenantId, modoCobro: 'POR_VIAJE', inicio: Between(desde, hasta) },
        order: { inicio: 'DESC' },
        take: MAX_VIAJES,
      }),
    ]);
    const pagos = viajes.length
      ? await this.pagoRepo.find({ where: { tenantId, viajeId: In(viajes.map((v) => v.id)) } })
      : [];
    const pagoPorViaje = new Map(pagos.map((p) => [p.viajeId, p]));
    const [propios, registro] = await Promise.all([
      viajes.length && this.reciboRepo
        ? this.reciboRepo.find({ where: { tenantId, viajeId: In(viajes.map((v) => v.id)) } })
        : Promise.resolve([] as FlotaRecibo[]),
      this.polizaRepo ? this.polizaRepo.findOne({ where: { tenantId, cnpoliza } }) : Promise.resolve(null),
    ]);
    const propioPorViaje = new Map(propios.map((r) => [r.viajeId, r]));
    const coberturasCfg = leerCoberturas(this.config.get<string>('FLOTA_COBERTURAS_JSON'));

    const ccertisReales = [...new Set(pagos.filter((p) => p.modo === 'REAL' && p.ccerti != null).map((p) => p.ccerti as number))];
    const recibosSis = reciboReal && sis.ok && ccertisReales.length
      ? await this.recibosReales(cnpoliza, ccertisReales)
      : new Map<string, ReciboSis2000>();

    // Certificados: unión de los locales (conductor → certificado) y los de Sis2000 (vhcerti).
    const sisPorCerti = new Map(sis.certificados.map((c) => [Number(c.ccerti), c]));
    const certs = new Map<string, CertificadoVivo>();
    const nuevoCert = (ccerti: number | null, base: Partial<CertificadoVivo>): CertificadoVivo => ({
      ccerti, placa: null, conductorDoc: null, conductorNombre: null, estatus: '—', activo: true, origen: 'MANUAL',
      plan: null, vigenciaDesde: null, vigenciaHasta: null, recibosSis2000: null, ultimoMovimiento: null,
      totales: totalesVacios(), coberturas: [], recibos: [], ...base,
    });
    for (const c of certsLocales) {
      const s = sisPorCerti.get(c.ccerti);
      const ist = txt(s?.istatcer) ?? txt(c.istatcer);
      certs.set(String(c.ccerti), nuevoCert(c.ccerti, {
        placa: c.placa ?? txt(s?.xplaca),
        conductorDoc: c.conductorDoc ?? txt(s?.cid_asegurado),
        conductorNombre: c.conductorNombre ?? txt(s?.xconductor) ?? txt(s?.xasegurado),
        estatus: ist ? (ESTATUS_CERT[ist.toUpperCase()] ?? ist) : (c.activo ? 'ACTIVO' : 'INACTIVO'),
        activo: c.activo,
        origen: c.origen,
        plan: txt(s?.cplan) ?? cfg.cplan ?? null,
        vigenciaDesde: txt(s?.fdesde),
        vigenciaHasta: txt(s?.fhasta),
        recibosSis2000: s?.recibos != null ? num(s.recibos) : null,
      }));
    }
    for (const s of sis.certificados) {
      const k = String(Number(s.ccerti));
      if (certs.has(k)) continue;
      const ist = txt(s.istatcer);
      certs.set(k, nuevoCert(Number(s.ccerti), {
        placa: txt(s.xplaca), conductorDoc: txt(s.cid_asegurado), conductorNombre: txt(s.xconductor) ?? txt(s.xasegurado),
        estatus: ist ? (ESTATUS_CERT[ist.toUpperCase()] ?? ist) : '—',
        activo: ['V', 'E'].includes(String(ist ?? '').toUpperCase()), origen: 'SIS2000',
        plan: txt(s.cplan), vigenciaDesde: txt(s.fdesde), vigenciaHasta: txt(s.fhasta),
        recibosSis2000: s.recibos != null ? num(s.recibos) : null,
      }));
    }

    // Viajes → recibo por viaje en el certificado del conductor (o en "sin certificado").
    const sinCert = nuevoCert(null, { estatus: 'SIN CERTIFICADO', activo: false, origen: '—' });
    const total = totalesVacios();
    for (const v of viajes) {
      const pago = pagoPorViaje.get(v.id) ?? null;
      const propio = propioPorViaje.get(v.id) ?? null;
      const ccerti = pago?.ccerti ?? propio?.ccerti ?? v.ccerti;
      let cert = ccerti != null ? certs.get(String(ccerti)) : undefined;
      if (!cert && ccerti != null) {
        cert = nuevoCert(ccerti, { placa: v.placa, conductorDoc: v.conductorDoc, conductorNombre: v.conductorNombre, estatus: 'NO ASOCIADO', activo: false, origen: '—' });
        certs.set(String(ccerti), cert);
      }
      const destino = cert ?? sinCert;
      if (!destino.conductorNombre && v.conductorNombre) destino.conductorNombre = v.conductorNombre;
      sumar(destino.totales, v, pago, propio);
      sumar(total, v, pago, propio);
      const mov = new Date(propio?.actualizadoEn ?? pago?.actualizadoEn ?? v.fin ?? v.inicio);
      if (!destino.ultimoMovimiento || mov > destino.ultimoMovimiento) destino.ultimoMovimiento = mov;
      const rec = reciboDeViaje(v, pago, recibosSis, propio);
      if (rec) destino.recibos.push(rec);
    }

    const moneda = viajes.find((v) => v.moneda)?.moneda ?? cfg.moneda ?? 'USD';
    const coberturas = (t: TotalesVivo) => coberturasCfg.map((c) => ({
      nombre: c.nombre, suma: c.suma, prima: r2((t.primasCobradas * c.pct) / 100),
    }));
    const lista = [...certs.values()];
    if (sinCert.recibos.length || sinCert.totales.cancelados) lista.push(sinCert);
    for (const c of lista) c.coberturas = coberturas(c.totales);
    lista.sort((a, b) => (b.ultimoMovimiento?.getTime() ?? 0) - (a.ultimoMovimiento?.getTime() ?? 0)
      || (a.ccerti ?? 1e9) - (b.ccerti ?? 1e9));

    const p = sis.poliza;
    const frec = txt(p?.ifrecuencia);
    const tipo = txt(p?.itipopol);
    const ist = txt(p?.istatpol);
    return {
      rev,
      sinCambios: false as const,
      generadoEn: new Date(),
      rango: { desde, hasta },
      fuente: sis.ok ? 'SIS2000' : 'LOCAL',
      sis2000: { ok: sis.ok, error: sis.error, consultadoEn: new Date(sis.en) },
      reciboReal,
      /** De dónde salen los números de recibo: Sis2000 (FLOTA_RECIBO_REAL=1) o Nexus (propios, pendientes de sincronizar). */
      recibosFuente: reciboReal ? 'SIS2000' : 'NEXUS',
      polizaRegistrada: registro ? { validada: registro.validada, registradaEn: registro.creadoEn } : null,
      truncado: viajes.length >= MAX_VIAJES,
      titulo: 'CUADRO - RECIBO DE PÓLIZA AUTOMÓVIL',
      empresa: {
        nombre: 'La Mundial de Seguros, C.A.',
        sudeaseg: this.config.get<string>('FLOTA_SUDEASEG_NRO') || '73',
        capitalSuscrito: this.config.get<string>('FLOTA_CAPITAL_SUSCRITO') || '70.000.000,00',
        capitalPagado: this.config.get<string>('FLOTA_CAPITAL_PAGADO') || this.config.get<string>('FLOTA_CAPITAL_SUSCRITO') || '70.000.000,00',
      },
      tomador: {
        nombre: registro?.tomadorNombre || this.config.get<string>('FLOTA_TOMADOR_NOMBRE') || tenantNombre,
        rif: registro?.tomadorRif || this.config.get<string>('FLOTA_TOMADOR_RIF') || (p?.ctenedor != null ? String(p.ctenedor) : null),
        asegurado: registro?.tomadorNombre || this.config.get<string>('FLOTA_TOMADOR_NOMBRE') || tenantNombre,
        rifAsegurado: registro?.tomadorRif || this.config.get<string>('FLOTA_TOMADOR_RIF') || (p?.casegurado != null ? String(p.casegurado) : null),
      },
      poliza: {
        cnpoliza: txt(p?.cnpoliza) ?? cnpoliza,
        ramo: this.config.get<string>('FLOTA_RAMO_NOMBRE') || 'AUTOMÓVIL',
        cramo: p?.cramo ?? null,
        plan: txt(p?.cplan) ?? cfg.cplan ?? null,
        tipoPoliza: tipo ? (TIPO_POLIZA[tipo.toUpperCase()] ?? tipo) : 'COLECTIVA (FLOTA)',
        tipoProducto: 'FLOTA POR USO · COBRO POR VIAJE',
        frecuencia: frec ? (FRECUENCIA[frec.toUpperCase()] ?? frec) : 'POR VIAJE',
        moneda: monedaLabel(txt(p?.cmoneda) ?? moneda),
        estatus: ist ? (ESTATUS_POLIZA[ist.toUpperCase()] ?? ist) : (sis.ok ? '—' : 'SIN CONFIRMAR EN SIS2000'),
        vigenciaDesde: txt(p?.fdesde),
        vigenciaHasta: txt(p?.fhasta),
        fechaEmision: txt(p?.fdesde),
        periodo: p?.fanopol != null ? `${p.fanopol}/${String(p.fmespol ?? '').padStart(2, '0')}` : null,
        sucursal: this.config.get<string>('FLOTA_SUCURSAL') || null,
        intermediario: this.config.get<string>('FLOTA_INTERMEDIARIO') || (p?.cproductor != null ? `PRODUCTOR ${p.cproductor}` : null),
        canal: this.config.get<string>('FLOTA_CANAL') || 'API RIDERY',
        polizaRel: null as string | null,
      },
      moneda,
      totales: { ...total, certificados: lista.filter((c) => c.ccerti != null).length, conductoresConViajes: lista.filter((c) => c.recibos.length).length },
      coberturas: coberturas(total),
      certificados: lista,
    };
  }
}
