import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/** Lo que se manda a nest-api para generar el recibo de UN viaje sobre el certificado del conductor. */
export interface ReciboCertificadoPayload {
  cnpoliza: string;
  ccerti: number;
  /** Prima del recibo en la moneda de cmoneda. */
  mprima: number;
  /** Moneda Sis2000: '$' (USD) o 'Bs'. */
  cmoneda: string;
  /** Vigencia del recibo (YYYY-MM-DD). */
  fdesde: string;
  fhasta: string;
  /** Idempotencia en Sis2000: un recibo por referencia (VIAJE:<idViaje>). */
  creferencia: string;
  xobservacion: string;
  cusuario: number;
}

export interface ReciboCertificadoResultado {
  cnrecibo: string | null;
  crecibo: string | null;
  yaExistia: boolean;
  data: unknown;
}

export interface CertificadoSis2000 {
  ccerti: number;
  xplaca: string | null;
  xconductor: string | null;
  cid_asegurado: string | null;
  xasegurado: string | null;
  istatcer: string | null;
  cplan?: string | null;
  fdesde?: string | null;
  fhasta?: string | null;
  /** Cantidad de recibos (adrecibos) del certificado. */
  recibos?: number | null;
}

/** Cabecera de la póliza (adpoliza, último período) según nest-api GET /api/flota/polizas/:cnpoliza. */
export interface PolizaSis2000 {
  cpoliza?: string | number | null;
  cnpoliza: string;
  cramo?: number | string | null;
  cplan?: string | null;
  fanopol?: number | null;
  fmespol?: number | null;
  itipopol?: string | null;
  ifrecuencia?: string | null;
  cmoneda?: string | null;
  istatpol?: string | null;
  fdesde?: string | null;
  fhasta?: string | null;
  casegurado?: string | number | null;
  ctenedor?: string | number | null;
  cproductor?: string | number | null;
}

/** Recibo de un certificado (adrecibos) según nest-api GET …/certificados/:ccerti/recibos. */
export interface ReciboSis2000 {
  crecibo: string | number;
  cnrecibo: string | null;
  ccerti: number;
  itiporec: string | null;
  iestadorec: string | null;
  fdesde: string | null;
  fhasta: string | null;
  mprimabruta: number | null;
  mprimabrutaext: number | null;
  cmoneda: string | null;
  fingreso: string | null;
}

/** Sis2000 usa '$' y 'Bs'; la plataforma manda ISO (USD/VES). */
export function monedaSis2000(moneda: string | null | undefined): string {
  const m = String(moneda || 'USD').trim().toUpperCase();
  if (m === 'USD' || m === '$') return '$';
  if (m === 'VES' || m === 'BS' || m === 'VEF') return 'Bs';
  return m;
}

/**
 * Cliente de nest-api (La Mundial / Sis2000) para la póliza de flota por viaje.
 * Contrato: módulo `flota` de nest-api (rama feat/flota-ridery):
 *   GET  /api/flota/polizas/:cnpoliza                               → póliza + certificados (vhcerti)
 *   POST /api/flota/polizas/:cnpoliza/certificados/:ccerti/recibos  → sp_crear_recibo_certificado_nexus
 * Solo se usa con FLOTA_RECIBO_REAL=1; si no, el recibo es SIMULADO.
 */
@Injectable()
export class FlotaSis2000Client {
  constructor(private readonly config: ConfigService) {}

  reciboRealActivo(): boolean {
    return this.config.get<string>('FLOTA_RECIBO_REAL') === '1';
  }

  cusuario(): number {
    const n = Number(this.config.get<string>('FLOTA_CUSUARIO') || 1);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  /** Ruta que se llamaría (también se guarda en el recibo simulado). */
  rutaRecibo(cnpoliza: string, ccerti: number): string {
    return `/api/flota/polizas/${encodeURIComponent(cnpoliza)}/certificados/${ccerti}/recibos`;
  }

  private conexion(): { base: string; apikey: string } {
    const base = (this.config.get<string>('NEST_API_URL') || '').replace(/\/$/, '');
    const apikey = this.config.get<string>('NEST_API_KEY') || '';
    if (!base || !apikey) throw new BadRequestException('Falta NEST_API_URL o NEST_API_KEY.');
    return { base, apikey };
  }

  async crearReciboCertificado(p: ReciboCertificadoPayload): Promise<ReciboCertificadoResultado> {
    const { base, apikey } = this.conexion();
    const { cnpoliza, ccerti, ...body } = p;
    const { data } = await axios.post(`${base}${this.rutaRecibo(cnpoliza, ccerti)}`, body, {
      headers: { apikey, 'Content-Type': 'application/json' },
      timeout: 60000,
    });
    const d = (data?.data ?? data) as Record<string, unknown>;
    return {
      cnrecibo: d?.cnrecibo != null ? String(d.cnrecibo).trim() : null,
      crecibo: d?.crecibo != null ? String(d.crecibo) : null,
      yaExistia: Boolean(d?.yaExistia),
      data,
    };
  }

  async certificadosPoliza(cnpoliza: string): Promise<CertificadoSis2000[]> {
    return (await this.polizaFlota(cnpoliza, 30000)).certificados;
  }

  /** ¿Hay conexión con nest-api? Sin ella la póliza en vivo usa solo los datos locales. */
  conexionConfigurada(): boolean {
    return Boolean(this.config.get<string>('NEST_API_URL') && this.config.get<string>('NEST_API_KEY'));
  }

  /** Póliza de flota real (adpoliza + vhcerti) desde nest-api. Solo lectura. */
  async polizaFlota(
    cnpoliza: string,
    timeout = 8000,
  ): Promise<{ poliza: PolizaSis2000 | null; certificados: CertificadoSis2000[] }> {
    const { base, apikey } = this.conexion();
    const { data } = await axios.get(`${base}/api/flota/polizas/${encodeURIComponent(cnpoliza)}`, {
      headers: { apikey },
      timeout,
    });
    const d = (data?.data ?? data) as { poliza?: PolizaSis2000; certificados?: CertificadoSis2000[] };
    return { poliza: d?.poliza ?? null, certificados: Array.isArray(d?.certificados) ? d.certificados : [] };
  }

  /** Recibos reales (adrecibos) de un certificado. Solo lectura. */
  async recibosCertificado(cnpoliza: string, ccerti: number, timeout = 8000): Promise<ReciboSis2000[]> {
    const { base, apikey } = this.conexion();
    const { data } = await axios.get(`${base}${this.rutaRecibo(cnpoliza, ccerti)}`, { headers: { apikey }, timeout });
    const d = (data?.data ?? data) as { recibos?: ReciboSis2000[] };
    return Array.isArray(d?.recibos) ? d.recibos : [];
  }
}
