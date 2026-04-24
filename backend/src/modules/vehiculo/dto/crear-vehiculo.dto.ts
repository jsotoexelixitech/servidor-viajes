import {
  IsString, IsInt, IsOptional, IsEnum, IsBoolean,
  MaxLength, Min, Max, IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoVehiculo } from '../entities/vehiculo.entity';

export class CrearVehiculoDto {
  @ApiProperty({ example: 'ABC123' })
  @IsString() @MaxLength(20)
  placa: string;

  @ApiProperty({ example: 'Toyota' })
  @IsString() @MaxLength(100)
  marca: string;

  @ApiProperty({ example: 'Corolla' })
  @IsString() @MaxLength(100)
  modelo: string;

  @ApiProperty({ example: 2020 })
  @IsInt() @Min(1900) @Max(new Date().getFullYear() + 1)
  anio: number;

  @ApiPropertyOptional({ example: 'Blanco' })
  @IsOptional() @IsString() @MaxLength(40)
  color?: string;

  @ApiPropertyOptional({ enum: TipoVehiculo, default: TipoVehiculo.SEDAN })
  @IsOptional() @IsEnum(TipoVehiculo)
  tipoVehiculo?: TipoVehiculo;

  @ApiPropertyOptional({ example: 'V12345678' })
  @IsOptional() @IsString() @MaxLength(20)
  cedulaPropietario?: string;

  @ApiPropertyOptional({ example: 'Juan Pérez' })
  @IsOptional() @IsString() @MaxLength(150)
  nombrePropietario?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(100)
  capacidadPasajeros?: number;

  @ApiPropertyOptional({ example: '8XK123456' })
  @IsOptional() @IsString() @MaxLength(30)
  numeroSerial?: string;

  @ApiPropertyOptional({ example: 'MTR456789' })
  @IsOptional() @IsString() @MaxLength(30)
  numeroMotor?: string;

  @ApiPropertyOptional({ example: { asegurado: false } })
  @IsOptional() @IsObject()
  metadata?: Record<string, any>;
}
