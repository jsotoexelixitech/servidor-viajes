import {
  IsString, IsNotEmpty, IsOptional, IsEmail, IsNumber, Min, Max,
  Length, IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoVendedor } from '../entities/vendedor.entity';

export class CrearVendedorDto {
  @ApiProperty({ example: 'Daniel', description: 'Nombre del vendedor' })
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

  @ApiPropertyOptional({ enum: EstadoVendedor, example: EstadoVendedor.ACTIVO })
  @IsOptional() @IsEnum(EstadoVendedor)
  estado?: EstadoVendedor;
}
