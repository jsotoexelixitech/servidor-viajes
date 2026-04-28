import {
  Controller, Get, Post, Put, Delete, Param, Body,
  Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { VendedorService } from './vendedor.service';
import { CrearVendedorDto } from './dto/crear-vendedor.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Tenant } from '../tenant/entities/tenant.entity';

@ApiTags('Vendedores')
@ApiSecurity('api-key')
@UseGuards(TenantGuard)
@Controller('vendedores')
export class VendedorController {
  constructor(private readonly svc: VendedorService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar un vendedor' })
  crear(@CurrentTenant() tenant: Tenant, @Body() dto: CrearVendedorDto) {
    return this.svc.crear(tenant.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar vendedores del tenant' })
  listar(
    @CurrentTenant() tenant: Tenant,
    @Query('soloActivos') soloActivos?: string,
  ) {
    return this.svc.listar(tenant.id, soloActivos === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener vendedor por id' })
  obtener(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.svc.obtener(tenant.id, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar vendedor' })
  actualizar(
    @CurrentTenant() tenant: Tenant,
    @Param('id') id: string,
    @Body() dto: Partial<CrearVendedorDto>,
  ) {
    return this.svc.actualizar(tenant.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar vendedor (soft delete)' })
  eliminar(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.svc.eliminar(tenant.id, id);
  }
}
