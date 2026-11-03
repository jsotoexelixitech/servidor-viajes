import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlotaCertificado, OrigenCertificado } from './entities/flota-certificado.entity';
import { FlotaSis2000Client } from './flota-sis2000.client';
import { FlotaRecibosService } from './flota-recibos.service';
import { FlotaService } from './flota.service';
import { normalizarDoc } from './flota-cobro-viaje.service';
import type { EmitirLoteDto, FilaLoteDto } from './dto/cobro-viaje.dto';

/** Placa: 6 a 8 alfanuméricos (sin guiones ni espacios). */
export const PLACA_RE = /^[A-Z0-9]{6,8}$/;
/** Cédula/RIF: V, E o J + 5 a 10 dígitos (se aceptan guiones y puntos al escribirla). */
export const CEDULA_RE = /^[VEJ]\d{5,10}$/;

export const limpiarPlaca = (p?: string | null) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** V-31.234.567 → V-31234567 (formato con que se guarda en Sis2000). */
export const formatearCedula = (c?: string | null) => {
  const s = normalizarDoc(c) ?? '';
  return s ? `${s[0]}-${s.slice(1)}` : '';
};

export interface ResultadoFilaLote {
  fila: number;
  placa: string;
  cedula: string;
  nombre: string;
  ok: boolean;
  ccerti: number | null;
  yaExistia: boolean;
  origen: 'SIS2000' | 'NEXUS' | null;
  error: string | null;
}

/** Errores de validación de una fila (vacío = válida). Misma regla que la vista previa del front. */
export function validarFila(f: Partial<FilaLoteDto>): string[] {
  const errores: string[] = [];
  if (!PLACA_RE.test(limpiarPlaca(f.placa))) errores.push('Placa: 6 a 8 letras/números.');
  if (!CEDULA_RE.test(normalizarDoc(f.cedulaConductor) ?? '')) errores.push('Cédula: V, E o J + dígitos.');
  if (!String(f.nombreConductor ?? '').trim()) errores.push('Falta el nombre del conductor.');
  if (f.anio != null && (f.anio < 1950 || f.anio > new Date().getFullYear() + 1)) errores.push('Año fuera de rango.');
  return errores;
}

const codigo = (v?: string | null): number | undefined => (v && /^\d{1,9}$/.test(v.trim()) ? Number(v.trim()) : undefined);
const txtOpc = (v?: string | null, max = 30) => (v && v.trim() ? v.trim().toUpperCase().slice(0, max) : undefined);

/** Mensaje del SP / nest-api, legible para la pantalla. */
export function mensajeError(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { message?: unknown; error?: unknown } }; message?: string };
  const m = e.response?.data?.message ?? e.response?.data?.error ?? e.response?.data ?? e.message ?? 'Error desconocido';
  const s = Array.isArray(m) ? m.join(', ') : typeof m === 'string' ? m : JSON.stringify(m);
  return (e.response?.status ? `nest-api ${e.response.status}: ${s}` : s).slice(0, 500);
}

/**
 * Crear la flota desde un Excel (presentación): crea la póliza en Sis2000 (si hace falta) e incluye cada conductor
 * como certificado SIN recibo. Idempotente por placa + conductor dentro de la póliza (el SP también lo es).
 */
@Injectable()
export class FlotaLoteService {
  private readonly logger = new Logger(FlotaLoteService.name);

  constructor(
    @InjectRepository(FlotaCertificado) private readonly certRepo: Repository<FlotaCertificado>,
    private readonly sis2000: FlotaSis2000Client,
    private readonly recibos: FlotaRecibosService,
    private readonly flota: FlotaService,
  ) {}

  async emitir(tenantId: string, dto: EmitirLoteDto, usuario?: string) {
    let cnpoliza = dto.cnpoliza?.trim().toUpperCase();
    let polizaCreada: unknown = null;
    if (!cnpoliza) {
      if (!dto.poliza) throw new BadRequestException('Envíe cnpoliza (póliza ya creada) o los datos de la póliza a crear.');
      const r = await this.recibos.crearPoliza(tenantId, dto.poliza, usuario);
      cnpoliza = r.poliza.cnpoliza;
      polizaCreada = r;
    }
    // Con conexión a nest-api la inclusión es real en Sis2000 (como la póliza); sin ella, numeración Nexus.
    const real = this.sis2000.conexionConfigurada();
    const resultados: ResultadoFilaLote[] = [];
    let i = 0;
    for (const f of dto.filas ?? []) {
      i += 1;
      resultados.push(await this.incluirFila(tenantId, cnpoliza, f, i, real));
    }
    const ok = resultados.filter((r) => r.ok).length;
    return {
      cnpoliza,
      cnpolizaConfiguracion: (await this.flota.getConfig(tenantId)).cnpoliza,
      polizaCreada,
      inclusionSis2000: real,
      total: resultados.length,
      ok,
      fallidos: resultados.length - ok,
      resultados,
    };
  }

  private async incluirFila(tenantId: string, cnpoliza: string, f: FilaLoteDto, fila: number, real: boolean): Promise<ResultadoFilaLote> {
    const placa = limpiarPlaca(f.placa);
    const cedula = formatearCedula(f.cedulaConductor);
    const nombre = String(f.nombreConductor ?? '').trim().toUpperCase().slice(0, 100);
    const base = { fila, placa, cedula, nombre };
    const errores = validarFila(f);
    if (errores.length) return { ...base, ok: false, ccerti: null, yaExistia: false, origen: null, error: errores.join(' ') };

    const docNorm = normalizarDoc(cedula);
    const existente = await this.certRepo.findOne({ where: { tenantId, cnpoliza, placa, conductorDocNorm: docNorm ?? undefined, activo: true } });
    if (existente) {
      return {
        ...base, ok: true, ccerti: existente.ccerti, yaExistia: true,
        origen: existente.origen === OrigenCertificado.SIS2000 ? 'SIS2000' : 'NEXUS', error: null,
      };
    }
    const vehiculo = {
      serialCarroceria: txtOpc(f.serialCarroceria) ?? null, serialMotor: txtOpc(f.serialMotor) ?? null,
      anio: f.anio ?? null, marca: txtOpc(f.marca, 40) ?? null, modelo: txtOpc(f.modelo, 40) ?? null, color: txtOpc(f.color) ?? null,
    };
    let ccerti: number;
    try {
      if (real) {
        const r = await this.sis2000.incluirCertificado(cnpoliza, {
          xplaca: placa,
          xsercar: txtOpc(f.serialCarroceria),
          xsermot: txtOpc(f.serialMotor),
          cano: f.anio ?? undefined,
          cmarca: codigo(f.marca),
          cmodelo: codigo(f.modelo),
          xcolor: txtOpc(f.color),
          conductor: { cid: cedula.slice(0, 20), nombre },
          fdesde: new Date().toISOString().slice(0, 10),
          cusuario: this.sis2000.cusuario(),
        });
        ccerti = r.ccerti;
      } else {
        const max = await this.certRepo.maximum('ccerti', { tenantId, cnpoliza });
        ccerti = Number(max ?? 0) + 1;
      }
    } catch (err) {
      const error = mensajeError(err);
      this.logger.warn(`Lote ${cnpoliza} fila ${fila} (${placa}): ${error}`);
      return { ...base, ok: false, ccerti: null, yaExistia: false, origen: null, error };
    }
    const cert = (await this.certRepo.findOne({ where: { tenantId, cnpoliza, ccerti } }))
      ?? this.certRepo.create({ tenantId, cnpoliza, ccerti });
    Object.assign(cert, {
      placa, conductorDoc: cedula, conductorDocNorm: docNorm, conductorNombre: nombre, activo: true, vehiculo,
      origen: real ? OrigenCertificado.SIS2000 : OrigenCertificado.MANUAL,
    });
    await this.certRepo.save(cert);
    return { ...base, ok: true, ccerti, yaExistia: false, origen: real ? 'SIS2000' : 'NEXUS', error: null };
  }
}
