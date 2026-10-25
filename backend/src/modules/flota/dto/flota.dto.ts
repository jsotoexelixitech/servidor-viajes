import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString,
  Matches, Max, MaxLength, Min,
} from 'class-validator';

export class InicioViajeDto {
  @ApiProperty({ example: 'RDY-000123', description: 'Id del viaje en la plataforma (único).' })
  @IsString() @MaxLength(100)
  idExterno: string;

  @ApiProperty({ example: 'AB123CD' })
  @IsString() @MaxLength(20)
  placa: string;

  @ApiPropertyOptional({ example: 'V12345678' })
  @IsOptional() @IsString() @MaxLength(30)
  conductorDoc?: string;

  @ApiPropertyOptional({ example: 'José Pérez' })
  @IsOptional() @IsString() @MaxLength(150)
  conductorNombre?: string;

  @ApiPropertyOptional({ description: 'ISO 8601. Si se omite, ahora.' })
  @IsOptional() @IsDateString()
  inicio?: string;

  @ApiPropertyOptional({ example: { lat: 10.49, lng: -66.88, direccion: 'Altamira' } })
  @IsOptional() @IsObject()
  origen?: Record<string, unknown>;
}

export class FinViajeDto {
  @ApiProperty({ example: 'RDY-000123' })
  @IsString() @MaxLength(100)
  idExterno: string;

  @ApiPropertyOptional({ description: 'ISO 8601. Si se omite, ahora.' })
  @IsOptional() @IsDateString()
  fin?: string;

  @ApiPropertyOptional({ example: 12.4, description: 'Kilómetros recorridos.' })
  @IsOptional() @IsNumber() @Min(0)
  km?: number;

  @ApiPropertyOptional({ example: { lat: 10.5, lng: -66.9, direccion: 'Chacao' } })
  @IsOptional() @IsObject()
  destino?: Record<string, unknown>;
}

export class CancelarViajeDto {
  @ApiProperty({ example: 'RDY-000123' })
  @IsString() @MaxLength(100)
  idExterno: string;
}

export class ConfigCobroDto {
  @ApiProperty({ example: '18-1-1130480881' })
  @IsString() @MaxLength(30)
  cnpoliza: string;

  @ApiPropertyOptional({ example: 'LARA' })
  @IsOptional() @IsString() @MaxLength(10)
  cplan?: string;

  @ApiProperty({ enum: ['TIEMPO', 'KM'] })
  @IsIn(['TIEMPO', 'KM'])
  modalidad: 'TIEMPO' | 'KM';

  @ApiProperty({ example: 0.05, description: 'Monto por minuto (TIEMPO) o por km (KM).' })
  @IsNumber() @Min(0)
  tarifa: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional() @IsString() @MaxLength(4)
  moneda?: string;

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional() @IsNumber() @Min(0)
  minimoPorViaje?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  redondearUnidad?: boolean;

  @ApiProperty({ enum: ['MANUAL', 'AUTO'] })
  @IsIn(['MANUAL', 'AUTO'])
  modoCierre: 'MANUAL' | 'AUTO';

  @ApiPropertyOptional({ example: 1, description: 'Día del mes del cierre automático (1-28).' })
  @IsOptional() @IsInt() @Min(1) @Max(28)
  diaCierre?: number;
}

export class SimularDto {
  @ApiPropertyOptional({ example: 50, description: 'Cantidad de viajes a generar (máx. 2000).' })
  @IsOptional() @IsInt() @Min(1) @Max(2000)
  cantidad?: number;

  @ApiPropertyOptional({ example: '2026-11', description: 'Mes de los viajes. Por defecto, el actual.' })
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periodo?: string;

  @ApiPropertyOptional({ example: 8, description: 'Cantidad de conductores simulados.' })
  @IsOptional() @IsInt() @Min(1) @Max(200)
  conductores?: number;

  @ApiPropertyOptional({ example: 3, description: 'Viajes que quedan en curso (sin finalizar).' })
  @IsOptional() @IsInt() @Min(0) @Max(200)
  enCurso?: number;
}

export class CierreDto {
  @ApiProperty({ example: '2026-11' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periodo: string;
}

export class GenerarReciboDto {
  @ApiPropertyOptional({
    enum: ['SIMULADO', 'REAL'],
    description: 'SIMULADO no toca Sis2000. REAL llama a nest-api (requiere FLOTA_RECIBO_REAL=1).',
  })
  @IsOptional() @IsIn(['SIMULADO', 'REAL'])
  modo?: 'SIMULADO' | 'REAL';
}
