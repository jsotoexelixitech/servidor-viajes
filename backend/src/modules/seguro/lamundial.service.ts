import { Injectable, Logger, HttpException, HttpStatus, Inject } from '@nestjs/common';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { Redis } from 'ioredis';

export interface LaMundialEmisionPayload {
  poliza?: string;
  cramo: number; plan: string;
  tipo_cedula_tomador: string; rif_tomador: string | number;
  nombre_tomador: string; apellido_tomador: string;
  telefono_tomador: string; correo_tomador: string;
  sexo_tomador?: string; estado_civil_tomador?: string;
  fnac_tomador: string; estado_tomador: number; ciudad_tomador: number; direccion_tomador: string;
  tipo_cedula_titular: string; rif_titular: string | number;
  nombre_titular: string; apellido_titular: string;
  telefono_titular: string; correo_titular: string;
  sexo_titular?: string; estado_civil_titular?: string;
  fnac_titular?: string; estado_titular: number; ciudad_titular: number; direccion_titular: string;
  marca: string; modelo: string; version: string; fano: number;
  color: string; placa: string; serial_carroceria: string; serial_motor?: string;
  ccategoria_uso: number; npuestos?: number; ntoneladas?: number; iplaca?: string;
  Precargorcv?: number; dec_persona_politica: number | string; dec_term_y_cod: number | string;
  productor?: number; frecuencia: string; fecha_emision: string; cusuario?: string;
}

export interface LaMundialEmisionResult {
  cnpoliza: string; urlpoliza: string; cnrecibo: string; ncuota: number;
}

export interface LaMundialCotizacionParams {
  cmarca: string; cmodelo: string; cversion: string; fano: number;
  cplan: string; ccategoria_uso: number; ntoneladas?: number;
}

/** Estados del circuit breaker */
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitData {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
  successesInHalfOpen: number;
}

/**
 * LaMundialService — cliente HTTP con circuit breaker distribuido en Redis.
 *
 * El estado del circuit breaker se almacena en Redis en lugar de en memoria,
 * garantizando que todos los workers del cluster comparten el mismo estado.
 * Si un worker detecta que La Mundial falla, TODOS los workers dejan de llamarla
 * inmediatamente, evitando el problema de "8 workers × FAILURE_THRESHOLD fallos".
 *
 * Circuit Breaker:
 *  - CLOSED: funcionamiento normal
 *  - OPEN: La Mundial no responde → falla inmediatamente (sin esperar timeout)
 *         Se abre tras FAILURE_THRESHOLD fallos consecutivos
 *  - HALF_OPEN: después de RECOVERY_TIMEOUT ms, permite 1 petición de prueba
 *              Si tiene éxito → vuelve a CLOSED
 *              Si falla → vuelve a OPEN
 */
@Injectable()
export class LaMundialService {
  private readonly logger = new Logger(LaMundialService.name);
  private readonly clientCache = new Map<string, AxiosInstance>();

  private readonly FAILURE_THRESHOLD = 5;
  private readonly RECOVERY_TIMEOUT_MS = 30_000;
  private readonly HALF_OPEN_SUCCESS_NEEDED = 2;
  private readonly REQUEST_TIMEOUT_MS = 8_000;
  private readonly CB_TTL_SECONDS = 300; // Redis TTL: limpiar keys inactivos tras 5 min

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  private cbKey(baseUrl: string): string {
    // Clave Redis compartida entre todos los workers
    const safe = Buffer.from(baseUrl).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
    return `cb:lamundial:${safe}`;
  }

  private async getCircuit(baseUrl: string): Promise<CircuitData> {
    try {
      const raw = await this.redis.get(this.cbKey(baseUrl));
      if (raw) return JSON.parse(raw) as CircuitData;
    } catch {
      // Redis no disponible — fallback a CLOSED (no bloquear operación)
    }
    return { state: 'CLOSED', failures: 0, lastFailureTime: 0, successesInHalfOpen: 0 };
  }

  private async saveCircuit(baseUrl: string, data: CircuitData): Promise<void> {
    try {
      await this.redis.set(this.cbKey(baseUrl), JSON.stringify(data), 'EX', this.CB_TTL_SECONDS);
    } catch {
      // Redis no disponible — continuar sin persistir estado
    }
  }

  private async checkCircuit(baseUrl: string): Promise<void> {
    const cb = await this.getCircuit(baseUrl);

    if (cb.state === 'OPEN') {
      const elapsed = Date.now() - cb.lastFailureTime;
      if (elapsed >= this.RECOVERY_TIMEOUT_MS) {
        cb.state = 'HALF_OPEN';
        cb.successesInHalfOpen = 0;
        await this.saveCircuit(baseUrl, cb);
        this.logger.warn(`[CircuitBreaker] ${baseUrl} → HALF_OPEN (intentando recuperación)`);
      } else {
        const remaining = Math.ceil((this.RECOVERY_TIMEOUT_MS - elapsed) / 1000);
        throw new HttpException(
          {
            message: `La Mundial no disponible temporalmente. Reintento en ${remaining}s. La póliza se emitirá automáticamente cuando el servicio se recupere.`,
            circuitOpen: true,
            retryAfterSeconds: remaining,
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }
  }

  private async recordSuccess(baseUrl: string): Promise<void> {
    const cb = await this.getCircuit(baseUrl);
    if (cb.state === 'HALF_OPEN') {
      cb.successesInHalfOpen++;
      if (cb.successesInHalfOpen >= this.HALF_OPEN_SUCCESS_NEEDED) {
        cb.state = 'CLOSED';
        cb.failures = 0;
        this.logger.log(`[CircuitBreaker] ${baseUrl} → CLOSED (servicio recuperado ✅)`);
      }
    } else {
      cb.failures = 0;
    }
    await this.saveCircuit(baseUrl, cb);
  }

  private async recordFailure(baseUrl: string): Promise<void> {
    const cb = await this.getCircuit(baseUrl);
    cb.failures++;
    cb.lastFailureTime = Date.now();

    if (cb.state === 'HALF_OPEN' || cb.failures >= this.FAILURE_THRESHOLD) {
      cb.state = 'OPEN';
      this.logger.error(
        `[CircuitBreaker] ${baseUrl} → OPEN (${cb.failures} fallos consecutivos). Suspendiendo llamadas por ${this.RECOVERY_TIMEOUT_MS / 1000}s`,
      );
    }
    await this.saveCircuit(baseUrl, cb);
  }

  async getCircuitStatus(baseUrl: string): Promise<{ state: CircuitState; failures: number }> {
    const cb = await this.getCircuit(baseUrl);
    return { state: cb.state, failures: cb.failures };
  }

  private getClient(baseUrl: string, authToken?: string): AxiosInstance {
    const key = `${baseUrl}::${authToken ?? ''}`;
    if (!this.clientCache.has(key)) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      // La Mundial usa header "apikey" (minúsculas, sin Bearer)
      if (authToken) headers['apikey'] = authToken;

      const client = axios.create({
        baseURL: baseUrl,
        timeout: this.REQUEST_TIMEOUT_MS,
        headers,
      });
      this.clientCache.set(key, client);
    }
    return this.clientCache.get(key)!;
  }

  private async callWithCircuitBreaker<T>(
    baseUrl: string,
    fn: () => Promise<T>,
    context: string,
  ): Promise<T> {
    await this.checkCircuit(baseUrl);
    try {
      const result = await fn();
      await this.recordSuccess(baseUrl);
      return result;
    } catch (err) {
      if (err instanceof HttpException && (err.getResponse() as any)?.circuitOpen) throw err;

      const isNetworkError = err instanceof AxiosError &&
        (!err.response || err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT');

      if (isNetworkError) {
        await this.recordFailure(baseUrl);
      }

      if (err instanceof AxiosError) {
        const status = err.response?.status ?? 502;
        const msg = err.response?.data?.result?.result?.error
          ?? err.response?.data?.result?.error
          ?? err.response?.data?.message
          ?? err.message;
        this.logger.error(`[LaMundial] ${context}: HTTP ${status} - ${JSON.stringify(msg)}`);
        throw new HttpException(
          { message: `Error La Mundial (${context}): ${msg}`, laMundialStatus: status },
          status >= 400 && status < 500 ? HttpStatus.UNPROCESSABLE_ENTITY : HttpStatus.BAD_GATEWAY,
        );
      }
      throw err;
    }
  }

  async obtenerAnios(baseUrl: string, authToken?: string) {
    return this.callWithCircuitBreaker(baseUrl, async () => {
      const { data } = await this.getClient(baseUrl, authToken).post('/api/v1/inma/year', {});
      return data.result[0] as { min: number; max: number };
    }, 'obtenerAnios');
  }

  async obtenerMarcas(baseUrl: string, fano: number, authToken?: string) {
    return this.callWithCircuitBreaker(baseUrl, async () => {
      const { data } = await this.getClient(baseUrl, authToken).post('/api/v1/inma/marca', { fano });
      return data.result as { cmarca: string; xmarca: string }[];
    }, 'obtenerMarcas');
  }

  async obtenerModelos(baseUrl: string, fano: number, cmarca: string, authToken?: string) {
    return this.callWithCircuitBreaker(baseUrl, async () => {
      const { data } = await this.getClient(baseUrl, authToken).post('/api/v1/inma/modelo', { fano, cmarca });
      return data.result as { cmodelo: string; xmodelo: string }[];
    }, 'obtenerModelos');
  }

  async obtenerVersiones(baseUrl: string, fano: number, cmarca: string, cmodelo: string, authToken?: string) {
    return this.callWithCircuitBreaker(baseUrl, async () => {
      const { data } = await this.getClient(baseUrl, authToken).post('/api/v1/inma/version', { fano, cmarca, cmodelo });
      return data.result;
    }, 'obtenerVersiones');
  }

  async cotizar(baseUrl: string, params: LaMundialCotizacionParams, authToken?: string) {
    return this.callWithCircuitBreaker(baseUrl, async () => {
      const { data } = await this.getClient(baseUrl, authToken).post('/api/v1/external/getCotizacionAuto', params);
      return data.result;
    }, 'cotizar');
  }

  /** POST /createEmissionAuto — EMITE la póliza RCV */
  async emitirPoliza(baseUrl: string, payload: LaMundialEmisionPayload, authToken?: string): Promise<LaMundialEmisionResult> {
    return this.callWithCircuitBreaker(baseUrl, async () => {
      this.logger.log(`[LaMundial] Emitiendo → placa=${payload.placa} plan=${payload.plan} tomador=${payload.rif_tomador}`);

      const { data } = await this.getClient(baseUrl, authToken).post(
        '/api/v1/external/createEmissionAuto', payload,
      );

      if (!data.status) {
        const errMsg = data.result?.result?.error ?? data.result?.error ?? 'Error desconocido';
        throw new HttpException(
          { message: `La Mundial rechazó la emisión: ${errMsg}`, laMundialError: errMsg },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      this.logger.log(`[LaMundial] ✅ Póliza emitida: ${data.result.cnpoliza} placa=${payload.placa}`);
      return data.result as LaMundialEmisionResult;
    }, 'emitirPoliza');
  }

  async obtenerEstados(baseUrl: string, authToken?: string) {
    return this.callWithCircuitBreaker(baseUrl, async () => {
      const { data } = await this.getClient(baseUrl, authToken).get('/api/v1/valrep/state');
      return data.data?.state ?? [];
    }, 'obtenerEstados');
  }

  async obtenerCiudades(baseUrl: string, cestado: number, authToken?: string) {
    return this.callWithCircuitBreaker(baseUrl, async () => {
      const { data } = await this.getClient(baseUrl, authToken).post('/api/v1/valrep/city', { cestado });
      return data.data?.city ?? [];
    }, 'obtenerCiudades');
  }

  async resolverCodigoMarca(baseUrl: string, fano: number, xmarca: string, authToken?: string): Promise<string | null> {
    const marcas = await this.obtenerMarcas(baseUrl, fano, authToken);
    const found = marcas.find(m => m.xmarca.trim().toLowerCase() === xmarca.trim().toLowerCase());
    return found?.cmarca ?? null;
  }

  /**
   * Verifica que una póliza emitida realmente existe en La Mundial.
   * Se llama de forma asíncrona ~30s después de la emisión exitosa.
   * Si La Mundial no la encuentra, registra un log CRÍTICO para intervención.
   *
   * Retorna true si la póliza está vigente, false si no se puede confirmar.
   */
  async verificarPoliza(baseUrl: string, cnpoliza: string, authToken?: string): Promise<boolean> {
    try {
      const { data } = await this.getClient(baseUrl, authToken).post(
        '/api/v1/external/getPolizaAuto',
        { cnpoliza },
      );
      const vigente = data?.status === true && !!data?.result?.cnpoliza;
      if (vigente) {
        this.logger.log(`[LaMundial] ✅ Verificación post-emisión: póliza ${cnpoliza} confirmada vigente`);
      } else {
        this.logger.error(
          `[LaMundial] ⚠️ Verificación post-emisión: póliza ${cnpoliza} NO encontrada en La Mundial. ` +
          `Respuesta: ${JSON.stringify(data?.result)}`,
        );
      }
      return vigente;
    } catch (err) {
      // Si La Mundial no tiene endpoint de consulta o falla — no bloquear
      this.logger.warn(`[LaMundial] Verificación post-emisión de ${cnpoliza} no pudo completarse: ${err.message}`);
      return false;
    }
  }
}
