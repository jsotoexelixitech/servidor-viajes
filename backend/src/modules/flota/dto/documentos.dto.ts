import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TIPOS_DOCUMENTO_FLOTA, TipoDocumentoFlota } from '../flota-documentos.service';

/**
 * Campos de texto del multipart de POST /api/flota/documentos (el archivo va en `archivo` o `file`).
 * Campos no documentados → 400.
 */
export class SubirDocumentoFlotaDto {
  @ApiProperty({ enum: TIPOS_DOCUMENTO_FLOTA, example: 'cedula', description: 'rif = RIF de la empresa; cedula / pasaporte = del conductor.' })
  @IsIn(TIPOS_DOCUMENTO_FLOTA as unknown as string[], { message: 'tipo inválido. Use: rif, cedula, pasaporte.' })
  tipo: TipoDocumentoFlota;

  @ApiPropertyOptional({ example: 'V-12345678', description: 'Cédula o pasaporte del conductor (con o sin prefijo y separadores).' })
  @IsOptional() @IsString() @MaxLength(30)
  conductorDoc?: string;

  @ApiPropertyOptional({ example: '0b6f1f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', description: 'Id del certificado del conductor (GET /api/flota/certificados).' })
  @IsOptional() @IsUUID()
  certificadoId?: string;
}
