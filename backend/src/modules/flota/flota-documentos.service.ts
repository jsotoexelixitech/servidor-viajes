import {
  BadRequestException, HttpStatus, Injectable, Logger, NotFoundException, OnModuleDestroy, PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlotaCertificado } from './entities/flota-certificado.entity';
import { FlotaPoliza } from './entities/flota-poliza.entity';
import { FlotaService } from './flota.service';
import {
  errorParaIntegrador, FlotaExpedienteClient, NexusExpedienteError, PersonaExpediente, RegistroExpedientePayload,
} from './flota-expediente.client';
import { normalizarDoc } from './flota-cobro-viaje.service';

/** Máximo del archivo (contrato de la API de documentos: 10 MB). */
export const MAX_ARCHIVO_DOCUMENTO = 10 * 1024 * 1024;
/** Conductores por póliza que acepta Nexus para Trayecto Seguro. */
export const MAX_CONDUCTORES_EXPEDIENTE = 500;
export const TIPOS_DOCUMENTO_FLOTA = ['rif', 'cedula', 'pasaporte'] as const;
export type TipoDocumentoFlota = (typeof TIPOS_DOCUMENTO_FLOTA)[number];

/** Reintentos del registro en Nexus si falla (después: POST /api/flota/documentos/sincronizar). */
const REINTENTOS_MS = [30_000, 120_000, 600_000];
const ESPERA_MS = 2_000;

/** Integrador (dueño de la póliza en Nexus): la flota que la usa. */
export function integradorFlota(tenantId: string): string {
  return `flota:${tenantId}`;
}

/**
 * Número comparable de un documento, igual que Nexus (documentoComparable): sin prefijo V/E/J/G/C/P,
 * sin separadores ni ceros a la izquierda. El pasaporte conserva las letras (P-EM2849387 → EM2849387).
 */
export function documentoComparable(v?: string | null): string {
  let s = String(v ?? '').trim().toUpperCase().replace(/^P[-\s]+/, '').replace(/[^A-Z0-9]/g, '');
  if (/^[VEJGPC]\d+$/.test(s)) s = s.slice(1);
  return s.replace(/^0+(?=.)/, '');
}

/** Requisito del conductor en Nexus (conductor_<número>, máx. 32 caracteres). */
export function requisitoDeConductor(doc?: string | null): string | null {
  const n = documentoComparable(doc);
  return n ? `conductor_${n}`.slice(0, 32) : null;
}

/** V/E/J/G/C/P del documento (prefijo), o null. */
function tipoDocDe(doc?: string | null): string | null {
  const m = /^([VEJGCP])/.exec(normalizarDoc(doc) ?? '');
  return m ? m[1] : null;
}

/**
 * Body del registro en Nexus: producto `trayecto`, requisito `rif` de la empresa + un conductor por cada
 * certificado ACTIVO con documento (sin repetir: un conductor con dos vehículos es un solo documento).
 */
export function armarRegistroTrayecto(params: {
  tenantId: string;
  cnpoliza: string;
  cplan?: string | null;
  tomadorRif?: string | null;
  tomadorNombre?: string | null;
  certificados: Pick<FlotaCertificado, 'conductorDoc' | 'conductorNombre' | 'activo' | 'ccerti'>[];
  canal?: { ccanalalt?: string | null; xcanalVenta?: string | null };
}): RegistroExpedientePayload {
  const personas: PersonaExpediente[] = [];
  const vistos = new Set<string>();
  const activos = [...params.certificados].filter((c) => c.activo).sort((a, b) => a.ccerti - b.ccerti);
  for (const c of activos) {
    const req = requisitoDeConductor(c.conductorDoc);
    if (!req || vistos.has(req) || !c.conductorDoc) continue;
    if (personas.length >= MAX_CONDUCTORES_EXPEDIENTE) break;
    vistos.add(req);
    personas.push({
      tipoDoc: tipoDocDe(c.conductorDoc),
      documento: c.conductorDoc.trim().slice(0, 32),
      nombre: c.conductorNombre?.trim().slice(0, 150) || null,
    });
  }
  const rif = params.tomadorRif?.trim();
  return {
    integrador: integradorFlota(params.tenantId),
    producto: 'trayecto',
    cnpoliza: params.cnpoliza,
    cramo: 18,
    cplan: params.cplan?.trim().slice(0, 16) || null,
    canal: {
      ccanalalt: params.canal?.ccanalalt?.trim() || null,
      xcanalVenta: params.canal?.xcanalVenta?.trim() || 'TRAYECTO SEGURO',
    },
    tomador: rif
      ? { tipoDoc: tipoDocDe(rif) ?? 'J', documento: rif.slice(0, 32), nombre: params.tomadorNombre?.trim().slice(0, 150) || null }
      : null,
    personas,
  };
}

/** PDF, JPG, PNG o WEBP por contenido (no por la extensión que manda el cliente). */
export function tipoArchivo(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export interface ArchivoSubido {
  buffer: Buffer;
  originalname?: string;
  size: number;
}

export interface SubirDocumentoInput {
  tipo: TipoDocumentoFlota;
  conductorDoc?: string;
  certificadoId?: string;
}

/** Envío en lote: máximo de archivos por llamada y campos multipart aceptados para el archivo. */
export const MAX_ARCHIVOS_LOTE = 10;
export const CAMPOS_ARCHIVO = ['archivo', 'archivos', 'file'] as const;

/** Resultado de un archivo del lote (orden = el de los archivos recibidos). */
export type ResultadoArchivoFlota = {
  indice: number;
  archivo: string | null;
  tipo: string;
  conductorDoc?: string | null;
  certificadoId?: string;
} & ({ ok: true; estado: string; documento?: string | null; ccerti?: number } | { ok: false; status: number; message: string });

/**
 * Valida el campo `items` (JSON array alineado por índice con los archivos):
 * [{ tipo: 'rif' } | { tipo: 'cedula'|'pasaporte', conductorDoc?, certificadoId? }]. Devuelve los items o el
 * mensaje del error de forma del lote (→ 400 sin procesar ningún archivo).
 */
export function itemsDelLote(raw: unknown, cantidadArchivos: number): SubirDocumentoInput[] | string {
  if (cantidadArchivos === 0) return 'Envíe al menos un archivo (campo archivos, archivo o file).';
  if (cantidadArchivos > MAX_ARCHIVOS_LOTE) return `Máximo ${MAX_ARCHIVOS_LOTE} archivos por envío.`;
  if (raw == null || String(raw).trim() === '') {
    return 'items es obligatorio cuando se envía más de un archivo (JSON array, uno por archivo).';
  }
  let lista: unknown;
  try {
    lista = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return 'items debe ser un JSON array válido.';
  }
  if (!Array.isArray(lista)) return 'items debe ser un JSON array.';
  if (lista.length !== cantidadArchivos) {
    return `items trae ${lista.length} elemento(s) y se enviaron ${cantidadArchivos} archivo(s); deben coincidir en cantidad y orden.`;
  }
  const items: SubirDocumentoInput[] = [];
  for (let i = 0; i < lista.length; i++) {
    const it = lista[i] as Record<string, unknown> | null;
    if (!it || typeof it !== 'object' || Array.isArray(it)) {
      return `items[${i}] debe ser un objeto { tipo, conductorDoc?, certificadoId? }.`;
    }
    const extra = Object.keys(it).find((k) => !['tipo', 'conductorDoc', 'certificadoId'].includes(k));
    if (extra) return `items[${i}].${extra} no es un campo permitido (tipo, conductorDoc, certificadoId).`;
    if (!(TIPOS_DOCUMENTO_FLOTA as readonly unknown[]).includes(it.tipo)) {
      return `items[${i}].tipo inválido. Use: rif, cedula, pasaporte.`;
    }
    const item: SubirDocumentoInput = { tipo: it.tipo as TipoDocumentoFlota };
    if (it.conductorDoc != null) {
      if (typeof it.conductorDoc !== 'string' || it.conductorDoc.length > 30) {
        return `items[${i}].conductorDoc debe ser texto de máximo 30 caracteres.`;
      }
      item.conductorDoc = it.conductorDoc;
    }
    if (it.certificadoId != null) {
      if (typeof it.certificadoId !== 'string' || !isUUID(it.certificadoId)) return `items[${i}].certificadoId debe ser un UUID.`;
      item.certificadoId = it.certificadoId;
    }
    items.push(item);
  }
  return items;
}

/**
 * Documentos del expediente de la póliza de flota (Trayecto Seguro) en Nexus:
 * - registra / re-registra la póliza con sus conductores activos (al registrar la póliza y al cambiar certificados);
 * - consulta el estado de los documentos y sube el RIF de la empresa o la cédula / pasaporte de cada conductor.
 * Un fallo de Nexus nunca rompe el alta de certificados ni los viajes: se registra en el log y se reintenta.
 */
@Injectable()
export class FlotaDocumentosService implements OnModuleDestroy {
  private readonly logger = new Logger(FlotaDocumentosService.name);
  private readonly pendientes = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(FlotaPoliza) private readonly polizaRepo: Repository<FlotaPoliza>,
    @InjectRepository(FlotaCertificado) private readonly certRepo: Repository<FlotaCertificado>,
    private readonly flota: FlotaService,
    private readonly nexus: FlotaExpedienteClient,
    private readonly config: ConfigService,
  ) {}

  onModuleDestroy() {
    for (const t of this.pendientes.values()) clearTimeout(t);
    this.pendientes.clear();
  }

  private async cnpolizaActual(tenantId: string): Promise<string> {
    const cfg = await this.flota.getConfig(tenantId);
    if (!cfg.cnpoliza) throw new NotFoundException('La flota no tiene póliza configurada.');
    return cfg.cnpoliza;
  }

  /** Registra (o actualiza) la póliza actual de la flota en Nexus con sus conductores activos. */
  async sincronizar(tenantId: string) {
    this.nexus.exigirConfiguracion();
    const cfg = await this.flota.getConfig(tenantId);
    const cnpoliza = cfg.cnpoliza;
    if (!cnpoliza) throw new NotFoundException('La flota no tiene póliza configurada.');
    const [poliza, certificados] = await Promise.all([
      this.polizaRepo.findOne({ where: { tenantId, cnpoliza } }),
      this.certRepo.find({ where: { tenantId, cnpoliza, activo: true }, order: { ccerti: 'ASC' } }),
    ]);
    const body = armarRegistroTrayecto({
      tenantId,
      cnpoliza,
      cplan: poliza?.cplan ?? cfg.cplan ?? null,
      tomadorRif: poliza?.tomadorRif ?? null,
      tomadorNombre: poliza?.tomadorNombre ?? null,
      certificados,
      canal: {
        ccanalalt: this.config.get<string>('FLOTA_EXPEDIENTES_CCANALALT') || null,
        xcanalVenta: this.config.get<string>('FLOTA_EXPEDIENTES_CANAL') || null,
      },
    });
    const conDoc = new Set(certificados.map((c) => requisitoDeConductor(c.conductorDoc)).filter(Boolean)).size;
    if (conDoc > MAX_CONDUCTORES_EXPEDIENTE) {
      this.logger.warn(`[documentos] ${cnpoliza}: ${conDoc} conductores; Nexus admite ${MAX_CONDUCTORES_EXPEDIENTE}.`);
    }
    const r = await this.nexus.registrar(body);
    return {
      cnpoliza,
      conductores: body.personas.length,
      creado: r?.creado ?? false,
      actualizado: r?.actualizado ?? false,
    };
  }

  /**
   * Re-registro en segundo plano tras un cambio (certificados, póliza): agrupa los cambios seguidos (2 s) y,
   * si Nexus falla, reintenta a los 30 s, 2 min y 10 min. Nunca lanza.
   */
  programar(tenantId: string, intento = 0, demoraMs = ESPERA_MS): void {
    if (!this.nexus.configurado()) return;
    const previo = this.pendientes.get(tenantId);
    if (previo) clearTimeout(previo);
    const t = setTimeout(() => {
      this.pendientes.delete(tenantId);
      this.sincronizar(tenantId)
        .then((r) => this.logger.log(`[documentos] póliza ${r.cnpoliza} sincronizada en Nexus (${r.conductores} conductores).`))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (intento < REINTENTOS_MS.length) {
            this.logger.warn(`[documentos] no se pudo registrar la póliza en Nexus (${msg}); reintento ${intento + 1}.`);
            this.programar(tenantId, intento + 1, REINTENTOS_MS[intento]);
          } else {
            this.logger.error(
              `[documentos] no se pudo registrar la póliza en Nexus tras ${intento + 1} intentos (${msg}). ` +
              'Use POST /api/flota/documentos/sincronizar.',
            );
          }
        });
    }, demoraMs);
    t.unref?.();
    this.pendientes.set(tenantId, t);
  }

  /**
   * Ejecuta en Nexus; si la póliza todavía no está registrada (404) o Nexus aún no tiene al conductor
   * (400 «…conductor…», con `conductor`), registra la póliza y repite una vez.
   */
  private async conRegistro<T>(tenantId: string, fn: () => Promise<T>, conductor = false): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const repetir = err instanceof NexusExpedienteError &&
        (err.status === 404 || (conductor && err.status === 400 && /conductor/i.test(err.message)));
      if (!repetir) throw err;
      await this.sincronizar(tenantId);
      return fn();
    }
  }

  /** Estado de los documentos de la póliza actual; cada conductor con su documento, nombre y certificados. */
  async estado(tenantId: string) {
    try {
      const cnpoliza = await this.cnpolizaActual(tenantId);
      const integrador = integradorFlota(tenantId);
      const r = await this.conRegistro(tenantId, () => this.nexus.estado(integrador, cnpoliza));
      const certs = await this.certRepo.find({ where: { tenantId, cnpoliza, activo: true }, order: { ccerti: 'ASC' } });
      const documentos = (r.documentos ?? []).map((d) => {
        if (d.tipo === 'rif' && !d.documento) return { requisito: 'rif', ...d };
        const suyos = certs.filter((c) => documentoComparable(c.conductorDoc) === d.documento);
        return {
          requisito: 'conductor',
          ...d,
          conductorDoc: suyos[0]?.conductorDoc ?? null,
          conductorNombre: suyos[0]?.conductorNombre ?? null,
          certificados: suyos.map((c) => ({ id: c.id, ccerti: c.ccerti, placa: c.placa })),
        };
      });
      return { cnpoliza: r.cnpoliza, estado: r.estado, documentos };
    } catch (err) {
      throw errorParaIntegrador(err);
    }
  }

  /** Conductor (documento como está en el certificado) por certificadoId o conductorDoc; solo activos de la póliza. */
  async conductorDe(tenantId: string, cnpoliza: string, dto: SubirDocumentoInput): Promise<FlotaCertificado> {
    if (dto.certificadoId) {
      const c = await this.certRepo.findOne({ where: { id: dto.certificadoId, tenantId } });
      if (!c || c.cnpoliza !== cnpoliza || !c.activo) {
        throw new NotFoundException('El certificado no existe o no está activo en la póliza de la flota.');
      }
      if (!c.conductorDoc) throw new BadRequestException('El certificado no tiene el documento del conductor.');
      if (dto.conductorDoc && documentoComparable(dto.conductorDoc) !== documentoComparable(c.conductorDoc)) {
        throw new BadRequestException('conductorDoc no coincide con el conductor del certificado.');
      }
      return c;
    }
    const buscado = documentoComparable(dto.conductorDoc);
    if (!buscado) throw new BadRequestException('Indique conductorDoc o certificadoId para la cédula o el pasaporte del conductor.');
    const activos = await this.certRepo.find({ where: { tenantId, cnpoliza, activo: true }, order: { ccerti: 'ASC' } });
    const c = activos.find((x) => documentoComparable(x.conductorDoc) === buscado);
    if (!c) throw new NotFoundException('El conductor no tiene certificado activo en la póliza de la flota.');
    return c;
  }

  /** Sube el RIF de la empresa o la cédula / pasaporte de un conductor (proxy a Nexus). */
  async subir(tenantId: string, archivo: ArchivoSubido | undefined, dto: SubirDocumentoInput) {
    try {
      if (!archivo?.buffer?.length) throw new BadRequestException('Falta el archivo (campo archivo o file).');
      if (archivo.size > MAX_ARCHIVO_DOCUMENTO) throw new PayloadTooLargeException('El archivo supera el máximo de 10 MB.');
      const mimetype = tipoArchivo(archivo.buffer);
      if (!mimetype) throw new UnsupportedMediaTypeException('Formato no permitido. Use PDF, JPG, PNG o WEBP.');
      this.nexus.exigirConfiguracion();
      const cnpoliza = await this.cnpolizaActual(tenantId);
      let documento: string | null = null;
      let cert: FlotaCertificado | null = null;
      if (dto.tipo === 'rif') {
        if (dto.conductorDoc || dto.certificadoId) {
          throw new BadRequestException('El RIF es de la empresa: no envíe conductorDoc ni certificadoId.');
        }
      } else {
        cert = await this.conductorDe(tenantId, cnpoliza, dto);
        documento = cert.conductorDoc;
      }
      const nombre = String(archivo.originalname || 'documento').replace(/[^\w.\- ]/g, '_').slice(0, 120) || 'documento';
      const r = await this.conRegistro(
        tenantId,
        () => this.nexus.subir(integradorFlota(tenantId), cnpoliza, { buffer: archivo.buffer, nombre, mimetype }, dto.tipo, documento),
        // Conductor recién agregado que Nexus aún no tiene: se re-registra la póliza y se repite.
        dto.tipo !== 'rif',
      );
      return {
        cnpoliza,
        tipo: r.tipo,
        estado: r.estado,
        ...(cert
          ? { documento: r.documento ?? documentoComparable(cert.conductorDoc), conductorDoc: cert.conductorDoc, certificadoId: cert.id, ccerti: cert.ccerti }
          : {}),
      };
    } catch (err) {
      throw errorParaIntegrador(err);
    }
  }

  /**
   * Varios documentos en un envío. Configuración y póliza se validan una vez (error → se lanza, nada se
   * procesa); cada archivo pasa por `subir` (mismas validaciones y el mismo respaldo: si Nexus no tiene la
   * póliza o al conductor, se registra y se repite) y su error queda en su resultado sin afectar a los demás.
   * En serie, para que ese re-registro corra una sola vez y no saturar Nexus/OCR.
   * httpStatus: 201 todos ok · 207 mezcla · todos fallan → el status del primer error.
   */
  async subirLote(tenantId: string, entradas: Array<SubirDocumentoInput & { archivo: ArchivoSubido }>) {
    let cnpoliza: string;
    try {
      this.nexus.exigirConfiguracion();
      cnpoliza = await this.cnpolizaActual(tenantId);
    } catch (err) {
      throw errorParaIntegrador(err);
    }
    const resultados: ResultadoArchivoFlota[] = [];
    for (const [indice, { archivo, ...dto }] of entradas.entries()) {
      const base = {
        indice,
        archivo: archivo?.originalname || null,
        tipo: dto.tipo,
        ...(dto.conductorDoc ? { conductorDoc: dto.conductorDoc } : {}),
        ...(dto.certificadoId ? { certificadoId: dto.certificadoId } : {}),
      };
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { cnpoliza: _poliza, ...r } = await this.subir(tenantId, archivo, dto);
        resultados.push({ ...base, ...r, ok: true });
      } catch (err) {
        const e = errorParaIntegrador(err);
        resultados.push({ ...base, ok: false, status: e.getStatus(), message: e.message });
      }
    }
    const fallidos = resultados.filter((r) => !r.ok);
    const httpStatus =
      fallidos.length === 0
        ? HttpStatus.CREATED
        : fallidos.length < resultados.length
          ? 207 // Multi-Status
          : (fallidos[0] as { status: number }).status;
    return {
      httpStatus,
      data: { cnpoliza, recibidos: resultados.length - fallidos.length, fallidos: fallidos.length, resultados },
    };
  }
}
