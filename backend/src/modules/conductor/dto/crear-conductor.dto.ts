import {
  IsString, IsNotEmpty, IsOptional, IsEmail, IsNumber, Min, Max,
  Length, IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoConductor } from '../entities/conductor.entity';

export class CrearConductorDto {
  @ApiProperty({ example: 'Daniel', description: 'Nombre del conductor' })
  @IsString() @IsNotEmpty() @Length(1, 150)
  nombre: string;

  @ApiPropertyOptional({ example: 'Castro' })
  @IsOptional() @IsString() @Length(1, 150)
  apellido?: string;

  @ApiProperty({ example: 'V25221952', description: 'Cédula o RIF (único por tenant)' })
  @IsString() @IsNotEmpty() @Length(3, 30)
  cedula: string;

  @ApiPropertyOptional({ example: '+584241829583' })
  @IsOptional() @IsString() @Length(0, 50)
  telefono?: string;

  @ApiPropertyOptional({ example: 'daniel.castro@empresa.com' })
  @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 12.5, description: 'Porcentaje de comisión (0-100)' })
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  porcentajeComision?: number;

  @ApiPropertyOptional({ enum: EstadoConductor, example: EstadoConductor.ACTIVO })
  @IsOptional() @IsEnum(EstadoConductor)
  estado?: EstadoConductor;
}
