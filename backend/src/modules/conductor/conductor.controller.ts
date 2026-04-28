import {
  Controller, Get, Post, Put, Delete, Param, Body,
  Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { ConductorService } from './conductor.service';
import { CrearConductorDto } from './dto/crear-conductor.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Tenant } from '../tenant/entities/tenant.entity';

@ApiTags('Conductores')
@ApiSecurity('api-key')
@UseGuards(TenantGuard)
@Controller('conductores')
export class ConductorController {
  constructor(private readonly svc: ConductorService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar un conductor' })
  crear(@CurrentTenant() tenant: Tenant, @Body() dto: CrearConductorDto) {
    return this.svc.crear(tenant.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar conductores del tenant' })
  listar(
    @CurrentTenant() tenant: Tenant,
    @Query('soloActivos') soloActivos?: string,
  ) {
    return this.svc.listar(tenant.id, soloActivos === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener conductor por id' })
  obtener(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.svc.obtener(tenant.id, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar conductor' })
  actualizar(
    @CurrentTenant() tenant: Tenant,
    @Param('id') id: string,
    @Body() dto: Partial<CrearConductorDto>,
  ) {
    return this.svc.actualizar(tenant.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar conductor (soft delete)' })
  eliminar(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.svc.eliminar(tenant.id, id);
  }
}
