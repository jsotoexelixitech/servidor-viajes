import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Body de Nexus POST /api/expedientes/integracion/registro (registroIntegracionSchema). */
export interface RegistroExpedientePayload {
  integrador: string;
  producto: 'trayecto';
  cnpoliza: string;
  cramo?: number | null;
  cplan?: string | null;
  canal?: { ccanalalt?: string | null; xcanalVenta?: string | null } | null;
  tomador?: PersonaExpediente | null;
  personas: PersonaExpediente[];
}

export interface PersonaExpediente {
  tipoDoc?: string | null;
  documento: string;
  nombre?: string | null;
  apellido?: string | null;
}

/** Documento del expediente según Nexus GET /api/expedientes/integracion/polizas/:cnpoliza. */
export interface DocumentoExpedienteNexus {
  tipo: string;
  documento?: string;
  estado: 'pendiente' | 'recibido' | 'validado' | 'por_corregir';
  motivo?: string;
}

export interface EstadoExpedienteNexus {
  cnpoliza: string;
  estado: 'completo' | 'incompleto';
  documentos: DocumentoExpedienteNexus[];
}

export interface ArchivoExpediente {
  buffer: Buffer;
  nombre: string;
  mimetype: string;
}

/** Error que devolvió Nexus (status HTTP y mensaje), para mapearlo a la respuesta de la flota. */
export class NexusExpedienteError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const RUTA = '/api/expedientes/integracion';
const TIMEOUT_MS = 20000;
const TIMEOUT_CARGA_MS = 60000;

/**
 * Cliente de la API de documentos del expediente de Nexus (nexus-api, interna servidor → servidor).
 * Variables: FLOTA_EXPEDIENTES_URL (o NEXUS_API_URL) y FLOTA_EXPEDIENTES_KEY (header x-expediente-key,
 * la EXPEDIENTES_INTEGRACION_KEY de nexus-api). Sin URL o sin clave, la API de documentos responde 503
 * y el resto del servidor sigue igual.
 */
@Injectable()
export class FlotaExpedienteClient {
  constructor(private readonly config: ConfigService) {}

  private conexion(): { base: string; key: string } | null {
    const base = (this.config.get<string>('FLOTA_EXPEDIENTES_URL') || this.config.get<string>('NEXUS_API_URL') || '')
      .trim()
      .replace(/\/$/, '');
    const key = (this.config.get<string>('FLOTA_EXPEDIENTES_KEY') || '').trim();
    return base && key ? { base, key } : null;
  }

  configurado(): boolean {
    return this.conexion() !== null;
  }

  /** 503 claro si falta la configuración. */
  exigirConfiguracion(): void {
    this.obligatoria();
  }

  private obligatoria(): { base: string; key: string } {
    const c = this.conexion();
    if (!c) {
      throw new ServiceUnavailableException(
        'La API de documentos no está configurada en este servidor (FLOTA_EXPEDIENTES_URL / FLOTA_EXPEDIENTES_KEY).',
      );
    }
    return c;
  }

  registrar(body: RegistroExpedientePayload): Promise<{ id: number; creado: boolean; actualizado?: boolean }> {
    const { base, key } = this.obligatoria();
    return this.pedir(`${base}${RUTA}/registro`, {
      method: 'POST',
      headers: { 'x-expediente-key': key, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, TIMEOUT_MS);
  }

  estado(integrador: string, cnpoliza: string): Promise<EstadoExpedienteNexus> {
    const { base, key } = this.obligatoria();
    return this.pedir(`${base}${RUTA}/polizas/${encodeURIComponent(cnpoliza)}`, {
      method: 'GET',
      headers: { 'x-expediente-key': key, 'x-integrador': integrador },
    }, TIMEOUT_MS);
  }

  subir(
    integrador: string,
    cnpoliza: string,
    archivo: ArchivoExpediente,
    tipo: string,
    documento?: string | null,
  ): Promise<{ tipo: string; documento?: string; estado: 'recibido' }> {
    const { base, key } = this.obligatoria();
    const form = new FormData();
    form.append('tipo', tipo);
    if (documento) form.append('documento', documento);
    form.append('file', new Blob([new Uint8Array(archivo.buffer)], { type: archivo.mimetype }), archivo.nombre);
    return this.pedir(`${base}${RUTA}/polizas/${encodeURIComponent(cnpoliza)}/documentos`, {
      method: 'POST',
      headers: { 'x-expediente-key': key, 'x-integrador': integrador },
      body: form,
    }, TIMEOUT_CARGA_MS);
  }

  /** Llama a Nexus y devuelve `data`; cualquier respuesta no 2xx → NexusExpedienteError (status 0 = sin respuesta). */
  private async pedir<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new NexusExpedienteError(0, `Nexus no respondió: ${(err as Error)?.message ?? 'error'}`);
    }
    let body: { data?: unknown; message?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* sin JSON */
    }
    if (!res.ok) throw new NexusExpedienteError(res.status, String(body.message || `Nexus respondió ${res.status}.`));
    return body.data as T;
  }
}

/**
 * Error de Nexus → respuesta de la flota. Los 4xx de negocio (400, 404, 409, 413, 415) se devuelven tal cual;
 * clave rechazada (401/403), 5xx o sin respuesta → 502 (problema entre servidores, no del integrador).
 */
export function errorParaIntegrador(err: unknown): HttpException {
  if (err instanceof HttpException) return err;
  if (err instanceof NexusExpedienteError) {
    if ([400, 404, 409, 413, 415, 422].includes(err.status)) return new HttpException(err.message, err.status);
    if (err.status === 429) return new HttpException('Demasiadas peticiones. Intente de nuevo en un minuto.', 429);
    return new HttpException(
      'No se pudo comunicar con el servicio de documentos. Intente de nuevo en unos minutos.',
      HttpStatus.BAD_GATEWAY,
    );
  }
  return new HttpException('Error inesperado con el servicio de documentos.', HttpStatus.BAD_GATEWAY);
}
