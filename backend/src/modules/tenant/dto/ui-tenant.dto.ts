import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** Marca propia de una flota (sobrescribe la del despliegue). Se guarda en tenant.config.ui. */
export class UiTenantDto {
  @ApiPropertyOptional({ example: 'Ridery' })
  @IsOptional() @IsString() @MaxLength(60)
  brandName?: string;

  @ApiPropertyOptional({ example: '' })
  @IsOptional() @IsString() @MaxLength(60)
  brandSuffix?: string;

  @ApiPropertyOptional({ example: 'Flota por uso' })
  @IsOptional() @IsString() @MaxLength(60)
  appTitle?: string;

  @ApiPropertyOptional({ example: 'https://.../logo.png' })
  @IsOptional() @IsString() @MaxLength(300)
  logoUrl?: string;

  @ApiPropertyOptional({ example: { primary: '#0F1A5A', accentCta: '#D4403F' } })
  @IsOptional() @IsObject()
  colors?: Record<string, string>;
}
