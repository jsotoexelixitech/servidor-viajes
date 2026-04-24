import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { CAMPOS_INTERNOS_SISTEMA } from '../../modules/seguro/seguro.service';

/**
 * Interceptor de transformación de campos.
 *
 * La configuración del tenant define:
 *   fieldMappings = {
 *     "placa": "numPlaca",       // "placa" es como lo llama La Mundial, "numPlaca" es como lo envía la empresa
 *     "fano":  "year",
 *     "cmarca": "brandCode",
 *     "latInicio": "startLat",   // campos de nuestro sistema
 *     ...
 *   }
 *
 * La empresa envía:   { "numPlaca": "ABC-123", "year": 2020, "brandCode": "083", "startLat": 10.48 }
 * Después del transform: { "placa": "ABC-123", "fano": 2020, "cmarca": "083", "latInicio": 10.48 }
 *
 * Después se aplican los defaultValues del tenant para campos que no llegaron.
 * Los campos sin mapeo que no son de La Mundial van a metadata.
 */
@Injectable()
export class FieldMappingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(FieldMappingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const tenant = request.tenant;
    const config = tenant?.config ?? {};
    const mappings: Record<string, string> = config.fieldMappings ?? {};
    const defaults: Record<string, any> = config.defaultValues ?? {};

    if (!request.body) return next.handle();

    const originalBody: Record<string, any> = request.body;
    const transformed: Record<string, any> = {};
    const consumedKeys = new Set<string>();

    // Construir mapa inverso: nombre_empresa → nombre_la_mundial (o interno)
    // mappings = { "placa": "numPlaca" }  →  reverso = { "numPlaca": "placa" }
    const reversoMap: Record<string, string> = {};
    for (const [laMundialKey, empresaKey] of Object.entries(mappings)) {
      if (empresaKey && empresaKey.trim()) {
        reversoMap[empresaKey.trim()] = laMundialKey;
      }
    }

    // Aplicar transformación
    for (const [empresaKey, value] of Object.entries(originalBody)) {
      if (reversoMap[empresaKey]) {
        // Tiene mapeo definido → renombrar al nombre de La Mundial
        transformed[reversoMap[empresaKey]] = value;
        consumedKeys.add(empresaKey);
      } else {
        // No tiene mapeo → puede venir ya con el nombre correcto de La Mundial o ser desconocido
        // Lo pasamos tal cual (si La Mundial lo espera con ese nombre, funcionará)
        transformed[empresaKey] = value;
        consumedKeys.add(empresaKey);
      }
    }

    // Aplicar defaults para campos faltantes
    for (const [key, defaultValue] of Object.entries(defaults)) {
      if (transformed[key] === undefined || transformed[key] === null || transformed[key] === '') {
        transformed[key] = defaultValue;
      }
    }

    const keysAntes = Object.keys(originalBody).join(', ');
    const keysDespues = Object.keys(transformed).join(', ');
    if (keysAntes !== keysDespues) {
      this.logger.debug(`FieldMapping [${tenant?.nombre}]: {${keysAntes}} → {${keysDespues}}`);
    }

    request.body = transformed;
    return next.handle();
  }
}
