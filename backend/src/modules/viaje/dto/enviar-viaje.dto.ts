import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class EnviarViajeDto {
  @ApiProperty({ description: 'UUID del viaje a reenviar al sistema externo', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID(4)
  @IsNotEmpty()
  idViaje: string;

  @ApiPropertyOptional({ description: 'Forzar reenvío aunque ya fue enviado anteriormente', default: false })
  @IsOptional()
  @IsBoolean()
  forzarReenvio?: boolean;
}
