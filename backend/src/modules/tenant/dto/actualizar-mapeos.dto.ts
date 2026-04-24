import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** Los campos estándar internos que el servidor maneja */
export class FieldMappingsDto {
  @ApiPropertyOptional({ description: 'Nombre del campo "Número de placa" en tu sistema', example: 'placa' })
  @IsOptional() @IsString() @MaxLength(100)
  numeroPlaca?: string;

  @ApiPropertyOptional({ description: 'Nombre del campo "Nombre del conductor" en tu sistema', example: 'nombre_chofer' })
  @IsOptional() @IsString() @MaxLength(100)
  nombreConductor?: string;

  @ApiPropertyOptional({ description: 'Nombre del campo "Modelo del vehículo" en tu sistema', example: 'cmodelauto' })
  @IsOptional() @IsString() @MaxLength(100)
  modeloVehiculo?: string;

  @ApiPropertyOptional({ description: 'Nombre del campo "Año del vehículo" en tu sistema', example: 'anio' })
  @IsOptional() @IsString() @MaxLength(100)
  anioVehiculo?: string;

  @ApiPropertyOptional({ description: 'Nombre del campo "Latitud de inicio" en tu sistema', example: 'lat_inicio' })
  @IsOptional() @IsString() @MaxLength(100)
  latInicio?: string;

  @ApiPropertyOptional({ description: 'Nombre del campo "Longitud de inicio" en tu sistema', example: 'lng_inicio' })
  @IsOptional() @IsString() @MaxLength(100)
  lngInicio?: string;

  @ApiPropertyOptional({ description: 'Nombre del campo "Latitud de destino" en tu sistema', example: 'lat_destino' })
  @IsOptional() @IsString() @MaxLength(100)
  latDestino?: string;

  @ApiPropertyOptional({ description: 'Nombre del campo "Longitud de destino" en tu sistema', example: 'lng_destino' })
  @IsOptional() @IsString() @MaxLength(100)
  lngDestino?: string;
}

export class ActualizarMapeosDto {
  @ApiProperty({
    description: 'Mapeo de campos: clave = nombre interno del servidor, valor = nombre que usa TU sistema',
    type: FieldMappingsDto,
    example: {
      numeroPlaca: 'placa',
      nombreConductor: 'nombre_chofer',
      modeloVehiculo: 'cmodelauto',
      anioVehiculo: 'anio',
      latInicio: 'lat_i',
      lngInicio: 'lng_i',
      latDestino: 'lat_d',
      lngDestino: 'lng_d',
    },
  })
  @ValidateNested()
  @Type(() => FieldMappingsDto)
  fieldMappings: FieldMappingsDto;
}
