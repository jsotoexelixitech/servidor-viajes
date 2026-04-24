import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty } from 'class-validator';

export class FinalizarViajeDto {
  @ApiProperty({ description: 'UUID del viaje a finalizar', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID(4)
  @IsNotEmpty()
  idViaje: string;
}
