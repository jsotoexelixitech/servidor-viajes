import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsObject,
  MaxLength,
  Min,
  Max,
  IsNumberString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class IniciarViajeDto {
  @ApiProperty({ description: 'Número de placa del vehículo', example: 'ABC-123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  numeroPlaca: string;

  @ApiProperty({ description: 'Nombre completo del conductor', example: 'Juan Pérez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombreConductor: string;

  @ApiProperty({ description: 'Modelo del vehículo', example: 'Toyota Corolla' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  modeloVehiculo: string;

  @ApiProperty({ description: 'Año del vehículo', example: '2020' })
  @IsNotEmpty()
  anioVehiculo: string | number;

  @ApiProperty({ description: 'Latitud del punto de inicio', example: 10.4806 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  latInicio: number;

  @ApiProperty({ description: 'Longitud del punto de inicio', example: -66.9036 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lngInicio: number;

  @ApiProperty({ description: 'Latitud del punto de destino', example: 10.4906 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  latDestino: number;

  @ApiProperty({ description: 'Longitud del punto de destino', example: -66.9136 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lngDestino: number;

  @ApiPropertyOptional({ description: 'Metadatos adicionales opcionales', example: { pasajeros: 2 } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
