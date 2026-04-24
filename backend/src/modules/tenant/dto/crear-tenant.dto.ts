import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsUrl, MaxLength, IsBoolean } from 'class-validator';

export class CrearTenantDto {
  @ApiProperty({ description: 'Nombre de la empresa/tenant', example: 'Taxis Caracas C.A.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @ApiPropertyOptional({ description: 'URL del webhook externo del tenant (sobrescribe la global)', example: 'https://mi-sistema.com/api/trips' })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  webhookUrl?: string;

  @ApiPropertyOptional({ description: 'Secreto del webhook del tenant' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  webhookSecret?: string;

  @ApiPropertyOptional({ description: 'Límite de peticiones por minuto (null = usar global)' })
  @IsOptional()
  rateLimit?: number;

  @ApiPropertyOptional({ description: 'Configuración adicional del tenant' })
  @IsOptional()
  config?: Record<string, any>;
}
