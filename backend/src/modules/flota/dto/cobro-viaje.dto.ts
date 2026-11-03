import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject,
  IsOptional, IsString, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';

export const TIPOS_EVENTO = ['INICIO', 'FIN', 'CANCELACION'] as const;
export type TipoEventoViaje = (typeof TIPOS_EVENTO)[number];
export const CLASIFICACIONES = ['URBANO', 'EXTRA_URBANO'] as const;
export const REDONDEOS = ['NINGUNO', 'KM_ARRIBA', 'KM_CERCANO'] as const;

/** Evento de viaje de la plataforma (Ridery) para el cobro por viaje. */
export class EventoViajeDto {
  @ApiProperty({ example: 'RDY-000123', description: 'Id del viaje en la plataforma (único). Idempotencia.' })
  @IsString() @MaxLength(100)
  idViaje: string;

  @ApiProperty({ enum: TIPOS_EVENTO, example: 'INICIO' })
  @IsIn(TIPOS_EVENTO as unknown as string[])
  tipo: TipoEventoViaje;

  @ApiPropertyOptional({ description: 'Fecha/hora del evento ISO 8601. Si se omite, ahora.', example: '2026-11-01T14:05:00-04:00' })
  @IsOptional() @IsDateString()
  fecha?: string;

  @ApiPropertyOptional({ example: 'AB123CD', description: 'Obligatoria en INICIO (o en FIN si no hubo INICIO).' })
  @ValidateIf((o: EventoViajeDto) => o.tipo === 'INICIO')
  @IsString() @MaxLength(20)
  placa?: string;

  @ApiPropertyOptional({ example: 'V-12345678', description: 'Cédula del conductor: ubica su certificado en la póliza.' })
  @IsOptional() @IsString() @MaxLength(30)
  conductorDoc?: string;

  @ApiPropertyOptional({ example: 'José Pérez' })
  @IsOptional() @IsString() @MaxLength(150)
  conductorNombre?: string;

  @ApiPropertyOptional({ example: 8.4, description: 'INICIO: km estimados (devuelve monto estimado).' })
  @IsOptional() @IsNumber() @Min(0)
  kmEstimados?: number;

  @ApiPropertyOptional({ example: 9.1, description: 'FIN: km recorridos (si se omite se usan los estimados).' })
  @IsOptional() @IsNumber() @Min(0)
  km?: number;

  @ApiPropertyOptional({ enum: CLASIFICACIONES, description: 'Si se omite, se clasifica por los rangos de km configurados.' })
  @IsOptional() @IsIn(CLASIFICACIONES as unknown as string[])
  clasificacion?: 'URBANO' | 'EXTRA_URBANO';

  @ApiPropertyOptional({ example: { lat: 10.49, lng: -66.88, direccion: 'Altamira' } })
  @IsOptional() @IsObject()
  origen?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { lat: 10.5, lng: -66.9, direccion: 'Chacao' } })
  @IsOptional() @IsObject()
  destino?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'Pasajero canceló', description: 'CANCELACION: motivo.' })
  @IsOptional() @IsString() @MaxLength(200)
  motivo?: string;
}

/** Pago del monto devuelto por FIN. Genera el recibo del viaje sobre el certificado del conductor. */
export class PagoViajeDto {
  @ApiProperty({ example: 'RDY-000123' })
  @IsString() @MaxLength(100)
  idViaje: string;

  @ApiProperty({ example: 1, description: 'Debe coincidir con el monto devuelto al finalizar (±0,01).' })
  @IsNumber() @Min(0)
  monto: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional() @IsString() @MaxLength(4)
  moneda?: string;

  @ApiProperty({ example: 'PAY-778899', description: 'Referencia del pago en la plataforma.' })
  @IsString() @MaxLength(100)
  referencia: string;

  @ApiPropertyOptional({ example: 'WALLET' })
  @IsOptional() @IsString() @MaxLength(30)
  metodo?: string;

  @ApiPropertyOptional({ description: 'ISO 8601. Si se omite, ahora.' })
  @IsOptional() @IsDateString()
  fechaPago?: string;
}

export class TarifaDistanciaDto {
  @ApiProperty({ enum: CLASIFICACIONES })
  @IsIn(CLASIFICACIONES as unknown as string[])
  clasificacion: 'URBANO' | 'EXTRA_URBANO';

  @ApiPropertyOptional({ example: 'Urbano' })
  @IsOptional() @IsString() @MaxLength(60)
  nombre?: string;

  @ApiProperty({ example: 0 })
  @IsNumber() @Min(0)
  kmDesde: number;

  @ApiPropertyOptional({ example: 20, description: 'null = sin tope.', nullable: true })
  @IsOptional() @IsNumber() @Min(0)
  kmHasta?: number | null;

  @ApiProperty({ example: 0.1, description: 'Monto por km.' })
  @IsNumber() @Min(0)
  tarifaKm: number;

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional() @IsNumber() @Min(0)
  minimo?: number;

  @ApiPropertyOptional({ enum: REDONDEOS, example: 'KM_ARRIBA' })
  @IsOptional() @IsIn(REDONDEOS as unknown as string[])
  redondeo?: 'NINGUNO' | 'KM_ARRIBA' | 'KM_CERCANO';

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional() @IsString() @MaxLength(4)
  moneda?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  activa?: boolean;
}

export class GuardarTarifasDto {
  @ApiProperty({ type: [TarifaDistanciaDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2)
  @ValidateNested({ each: true }) @Type(() => TarifaDistanciaDto)
  tarifas: TarifaDistanciaDto[];
}

export class CotizarDistanciaDto {
  @ApiProperty({ example: 12.3 })
  @IsNumber() @Min(0)
  km: number;

  @ApiPropertyOptional({ enum: CLASIFICACIONES })
  @IsOptional() @IsIn(CLASIFICACIONES as unknown as string[])
  clasificacion?: 'URBANO' | 'EXTRA_URBANO';
}

export class CertificadoDto {
  @ApiPropertyOptional({ example: '18-1-1130480881', description: 'Por defecto, la póliza de la configuración.' })
  @IsOptional() @IsString() @MaxLength(30)
  cnpoliza?: string;

  @ApiPropertyOptional({ example: 3, description: "Si no viene, se asigna el siguiente número de la póliza (numeración Nexus)." })
  @IsOptional() @IsInt() @Min(0)
  ccerti?: number;

  @ApiPropertyOptional({ example: 'AB123CD' })
  @IsOptional() @IsString() @MaxLength(20)
  placa?: string;

  @ApiPropertyOptional({ example: 'V-12345678' })
  @IsOptional() @IsString() @MaxLength(30)
  conductorDoc?: string;

  @ApiPropertyOptional({ example: 'José Pérez' })
  @IsOptional() @IsString() @MaxLength(150)
  conductorNombre?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  activo?: boolean;
}

/** Fase 1: registrar una póliza de flota YA emitida por La Mundial (se valida con nest-api; no escribe en Sis2000). */
export class RegistrarPolizaDto {
  @ApiProperty({ example: '18-1-1130480881' })
  @IsString() @MaxLength(30)
  cnpoliza: string;

  @ApiPropertyOptional({ example: 'Ridery Venezuela, C.A.' })
  @IsOptional() @IsString() @MaxLength(150)
  tomadorNombre?: string;

  @ApiPropertyOptional({ example: 'J-12345678-9' })
  @IsOptional() @IsString() @MaxLength(20)
  tomadorRif?: string;

  @ApiPropertyOptional({ example: false, description: 'Registrar aunque nest-api no pueda validarla.' })
  @IsOptional() @IsBoolean()
  forzar?: boolean;
}

/** Opción (a): crear la póliza de flota en Sis2000 vía nest-api (sp_flota_crear_poliza_nexus) y registrarla. */
export class CrearPolizaFlotaDto {
  @ApiProperty({ example: 'J-12345678-9', description: 'Cédula/RIF del tomador (Ridery); debe existir en maclient.' })
  @IsString() @MaxLength(20)
  tomadorRif: string;

  @ApiPropertyOptional({ example: 'Ridery Venezuela, C.A.' })
  @IsOptional() @IsString() @MaxLength(150)
  tomadorNombre?: string;

  @ApiProperty({ example: 'RIDER1', description: 'Plan de la flota en Sis2000.' })
  @IsString() @MaxLength(10)
  cplan: string;

  @ApiPropertyOptional({ example: 18, description: 'Ramo (18 = automóvil). Por defecto 18.' })
  @IsOptional() @IsInt() @Min(1)
  cramo?: number;

  @ApiProperty({ example: '2026-11-01' })
  @IsDateString()
  fdesde: string;

  @ApiProperty({ example: '2027-11-01' })
  @IsDateString()
  fhasta: string;

  @ApiPropertyOptional({ example: 80080 })
  @IsOptional() @IsInt()
  cproductor?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @IsInt()
  csucur?: number;

  @ApiPropertyOptional({ example: 'USD', description: "USD / VES (o '$' / 'Bs'). Por defecto USD." })
  @IsOptional() @IsString() @MaxLength(4)
  moneda?: string;
}

export class AnularReciboDto {
  @ApiProperty({ example: 'Viaje reversado por la plataforma' })
  @IsString() @MaxLength(250)
  motivo: string;
}
