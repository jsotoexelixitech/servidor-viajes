import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class NexusSsoDto {
  @ApiPropertyOptional({ description: 'nexus_token (tenant_access) que Nexus pone en la URL del módulo. También se acepta en Authorization: Bearer.' })
  @IsOptional() @IsString()
  nexus_token?: string;
}
