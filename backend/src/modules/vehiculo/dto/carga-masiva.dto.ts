import { IsArray, ArrayNotEmpty, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CrearVehiculoDto } from './crear-vehiculo.dto';

export class CargaMasivaVehiculosDto {
  @ApiProperty({ type: [CrearVehiculoDto], description: 'Máximo 1000 vehículos por carga' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CrearVehiculoDto)
  vehiculos: CrearVehiculoDto[];
}
