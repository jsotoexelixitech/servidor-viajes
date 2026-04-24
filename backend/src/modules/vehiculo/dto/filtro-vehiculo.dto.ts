import { IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { TipoVehiculo } from '../entities/vehiculo.entity';

export class FiltroVehiculoDto {
  @ApiPropertyOptional({ example: 'ABC' })
  @IsOptional() @IsString()
  placa?: string;

  @ApiPropertyOptional({ example: 'Toyota' })
  @IsOptional() @IsString()
  marca?: string;

  @ApiPropertyOptional({ example: 'Corolla' })
  @IsOptional() @IsString()
  modelo?: string;

  @ApiPropertyOptional({ enum: TipoVehiculo })
  @IsOptional() @IsEnum(TipoVehiculo)
  tipoVehiculo?: TipoVehiculo;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 50;
}
