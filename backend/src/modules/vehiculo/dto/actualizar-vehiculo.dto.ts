import { PartialType } from '@nestjs/swagger';
import { CrearVehiculoDto } from './crear-vehiculo.dto';
import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ActualizarVehiculoDto extends PartialType(CrearVehiculoDto) {
  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  activo?: boolean;
}
