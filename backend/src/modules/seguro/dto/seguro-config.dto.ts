import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsNumber, IsOptional, IsEmail, IsIn, IsInt,
  Min, Max, MaxLength, IsNotEmpty, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Parámetros fijos del tenant con La Mundial (no cambian por viaje) */
export class SeguroConfigDto {
  @ApiProperty({ description: 'URL base de La Mundial', example: 'https://qaapisys2000.lamundialdeseguros.com' })
  @IsString() @IsNotEmpty()
  baseUrl: string;

  @ApiPropertyOptional({ description: 'Token de autenticación Bearer de La Mundial' })
  @IsOptional() @IsString()
  authToken?: string;

  @ApiProperty({ description: 'Código de ramo', example: 18 })
  @IsInt() @Type(() => Number)
  cramo: number;

  @ApiProperty({ description: 'Plan de póliza', example: 'RCVBAS' })
  @IsString() @IsNotEmpty() @MaxLength(6)
  plan: string;

  @ApiProperty({ description: 'Frecuencia de pago (A=Anual, S=Semestral, M=Mensual...)', example: 'A' })
  @IsString() @IsIn(['A', 'S', 'C', 'T', 'M'])
  frecuencia: string;

  @ApiPropertyOptional({ description: 'Código del productor en La Mundial', example: 80080 })
  @IsOptional() @IsInt() @Type(() => Number)
  productor?: number;

  @ApiPropertyOptional({ description: 'Código usuario que emite', example: '25221952' })
  @IsOptional() @IsString()
  cusuario?: string;
}

/** Valores por defecto para campos que la empresa NO envía en cada viaje */
export class DefaultValuesDto {
  @ApiPropertyOptional({ example: 'V' })  @IsOptional() @IsString() tipo_cedula_tomador?: string;
  @ApiPropertyOptional({ example: 'M' })  @IsOptional() @IsString() sexo_tomador?: string;
  @ApiPropertyOptional({ example: 'S' })  @IsOptional() @IsString() estado_civil_tomador?: string;
  @ApiPropertyOptional({ example: 1 })    @IsOptional() @IsInt() @Type(() => Number) estado_tomador?: number;
  @ApiPropertyOptional({ example: 128 })  @IsOptional() @IsInt() @Type(() => Number) ciudad_tomador?: number;
  @ApiPropertyOptional({ example: 'Venezuela' }) @IsOptional() @IsString() direccion_tomador?: string;
  @ApiPropertyOptional({ example: '1990-01-01' }) @IsOptional() @IsString() fnac_tomador?: string;
  @ApiPropertyOptional({ example: '' })   @IsOptional() @IsString() rif_tomador?: string;
  @ApiPropertyOptional({ example: '' })   @IsOptional() @IsString() nombre_tomador?: string;
  @ApiPropertyOptional({ example: '' })   @IsOptional() @IsString() apellido_tomador?: string;
  @ApiPropertyOptional({ example: '' })   @IsOptional() @IsString() telefono_tomador?: string;
  @ApiPropertyOptional({ example: '' })   @IsOptional() @IsString() correo_tomador?: string;
  @ApiPropertyOptional({ example: 'Negro' })  @IsOptional() @IsString() color?: string;
  @ApiPropertyOptional({ example: 11 })   @IsOptional() @IsInt() @Type(() => Number) ccategoria_uso?: number;
  @ApiPropertyOptional({ example: 0 })    @IsOptional() @IsInt() @Type(() => Number) ntoneladas?: number;
  @ApiPropertyOptional({ example: 0 })    @IsOptional() @IsInt() @Type(() => Number) dec_persona_politica?: number;
  @ApiPropertyOptional({ example: 1 })    @IsOptional() @IsInt() @Type(() => Number) dec_term_y_cod?: number;
  @ApiPropertyOptional({ example: 'N' })  @IsOptional() @IsString() iplaca?: string;
}

/**
 * Mapeo de campos: La clave es el nombre del campo en La Mundial (destino fijo),
 * el valor es cómo lo llama la empresa en su sistema (origen variable).
 *
 * Ejemplo: { "placa": "numPlaca", "fano": "year", "cmarca": "brandCode" }
 *
 * Significa: cuando la empresa envíe "numPlaca", nosotros lo enviamos a La Mundial como "placa".
 * Si la empresa ya usa el mismo nombre que La Mundial, no es necesario mapearlo.
 */
export class FieldMappingsLaMundialDto {
  // Vehículo
  @ApiPropertyOptional({ description: '"placa" de La Mundial ← nombre en tu sistema', example: 'numPlaca' })
  @IsOptional() @IsString() placa?: string;

  @ApiPropertyOptional({ description: '"fano" (año) de La Mundial ← nombre en tu sistema', example: 'year' })
  @IsOptional() @IsString() fano?: string;

  @ApiPropertyOptional({ description: '"cmarca" (código marca) ← nombre en tu sistema', example: 'brandCode' })
  @IsOptional() @IsString() cmarca?: string;

  @ApiPropertyOptional({ description: '"cmodelo" (código modelo) ← nombre en tu sistema', example: 'modelCode' })
  @IsOptional() @IsString() cmodelo?: string;

  @ApiPropertyOptional({ description: '"cversion" (código versión) ← nombre en tu sistema', example: 'versionCode' })
  @IsOptional() @IsString() cversion?: string;

  @ApiPropertyOptional({ description: '"color" ← nombre en tu sistema', example: 'vehicleColor' })
  @IsOptional() @IsString() color?: string;

  @ApiPropertyOptional({ description: '"serial_carroceria" ← nombre en tu sistema', example: 'chassisSerial' })
  @IsOptional() @IsString() serial_carroceria?: string;

  @ApiPropertyOptional({ description: '"serial_motor" ← nombre en tu sistema', example: 'engineSerial' })
  @IsOptional() @IsString() serial_motor?: string;

  @ApiPropertyOptional({ description: '"ccategoria_uso" ← nombre en tu sistema', example: 'usageCategory' })
  @IsOptional() @IsString() ccategoria_uso?: string;

  @ApiPropertyOptional({ description: '"ntoneladas" ← nombre en tu sistema', example: 'tons' })
  @IsOptional() @IsString() ntoneladas?: string;

  // Tomador
  @ApiPropertyOptional({ example: 'driverFirstName' }) @IsOptional() @IsString() nombre_tomador?: string;
  @ApiPropertyOptional({ example: 'driverLastName' })  @IsOptional() @IsString() apellido_tomador?: string;
  @ApiPropertyOptional({ example: 'driverCI' })        @IsOptional() @IsString() rif_tomador?: string;
  @ApiPropertyOptional({ example: 'idType' })          @IsOptional() @IsString() tipo_cedula_tomador?: string;
  @ApiPropertyOptional({ example: 'driverDOB' })       @IsOptional() @IsString() fnac_tomador?: string;
  @ApiPropertyOptional({ example: 'driverPhone' })     @IsOptional() @IsString() telefono_tomador?: string;
  @ApiPropertyOptional({ example: 'driverEmail' })     @IsOptional() @IsString() correo_tomador?: string;
  @ApiPropertyOptional({ example: 'stateCode' })       @IsOptional() @IsString() estado_tomador?: string;
  @ApiPropertyOptional({ example: 'cityCode' })        @IsOptional() @IsString() ciudad_tomador?: string;
  @ApiPropertyOptional({ example: 'driverAddress' })   @IsOptional() @IsString() direccion_tomador?: string;
  @ApiPropertyOptional({ example: 'gender' })          @IsOptional() @IsString() sexo_tomador?: string;
  @ApiPropertyOptional({ example: 'maritalStatus' })   @IsOptional() @IsString() estado_civil_tomador?: string;

  // Coordenadas (uso interno del sistema, no van a La Mundial)
  @ApiPropertyOptional({ example: 'startLat' })  @IsOptional() @IsString() latInicio?: string;
  @ApiPropertyOptional({ example: 'startLng' })  @IsOptional() @IsString() lngInicio?: string;
  @ApiPropertyOptional({ example: 'destLat' })   @IsOptional() @IsString() latDestino?: string;
  @ApiPropertyOptional({ example: 'destLng' })   @IsOptional() @IsString() lngDestino?: string;

  // Nombre del conductor (para registros internos, puede mapear a nombre_tomador también)
  @ApiPropertyOptional({ example: 'driverName' }) @IsOptional() @IsString() nombreConductor?: string;
}

export class ConfigurarSeguroDto {
  @ApiProperty({ type: SeguroConfigDto })
  @ValidateNested()
  @Type(() => SeguroConfigDto)
  seguroConfig: SeguroConfigDto;

  @ApiPropertyOptional({ type: DefaultValuesDto, description: 'Valores por defecto para campos que la empresa no envía' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DefaultValuesDto)
  defaultValues?: DefaultValuesDto;

  @ApiPropertyOptional({ type: FieldMappingsLaMundialDto, description: 'Mapeo: campo La Mundial ← nombre en tu sistema' })
  @IsOptional()
  @ValidateNested()
  @Type(() => FieldMappingsLaMundialDto)
  fieldMappings?: FieldMappingsLaMundialDto;
}
