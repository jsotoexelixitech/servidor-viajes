import {
  Controller, Get, Post, Put, Delete, Param, Body,
  Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiSecurity, ApiResponse, ApiParam,
} from '@nestjs/swagger';
import { VehiculoService } from './vehiculo.service';
import { CrearVehiculoDto } from './dto/crear-vehiculo.dto';
import { ActualizarVehiculoDto } from './dto/actualizar-vehiculo.dto';
import { CargaMasivaVehiculosDto } from './dto/carga-masiva.dto';
import { FiltroVehiculoDto } from './dto/filtro-vehiculo.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Tenant } from '../tenant/entities/tenant.entity';

@ApiTags('Vehículos')
@ApiSecurity('api-key')
@UseGuards(TenantGuard)
@Controller('vehiculos')
export class VehiculoController {
  constructor(private readonly svc: VehiculoService) {}

  // ── CRUD individual ──────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Registrar un vehículo' })
  @ApiResponse({ status: 201, description: 'Vehículo creado exitosamente' })
  @ApiResponse({ status: 409, description: 'Placa ya registrada para este tenant' })
  crear(@CurrentTenant() tenant: Tenant, @Body() dto: CrearVehiculoDto) {
    return this.svc.crear(tenant.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar vehículos con filtros y paginación' })
  listar(@CurrentTenant() tenant: Tenant, @Query() filtro: FiltroVehiculoDto) {
    return this.svc.listar(tenant.id, filtro);
  }

  @Get('estadisticas')
  @ApiOperation({ summary: 'Estadísticas del parque vehicular' })
  estadisticas(@CurrentTenant() tenant: Tenant) {
    return this.svc.estadisticas(tenant.id);
  }

  @Get('placa/:placa')
  @ApiOperation({ summary: 'Buscar vehículo por placa' })
  @ApiParam({ name: 'placa', example: 'ABC123' })
  buscarPorPlaca(@CurrentTenant() tenant: Tenant, @Param('placa') placa: string) {
    return this.svc.buscarPorPlaca(tenant.id, placa);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener vehículo por ID' })
  obtener(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.svc.obtenerPorId(tenant.id, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar datos de un vehículo' })
  actualizar(
    @CurrentTenant() tenant: Tenant,
    @Param('id') id: string,
    @Body() dto: ActualizarVehiculoDto,
  ) {
    return this.svc.actualizar(tenant.id, id, dto);
  }

  @Delete(':id/desactivar')
  @ApiOperation({ summary: 'Desactivar vehículo (soft delete)' })
  @HttpCode(HttpStatus.OK)
  desactivar(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.svc.desactivar(tenant.id, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar vehículo permanentemente' })
  @HttpCode(HttpStatus.OK)
  eliminar(@CurrentTenant() tenant: Tenant, @Param('id') id: string) {
    return this.svc.eliminar(tenant.id, id);
  }

  // ── Carga masiva (pre-data) ──────────────────────────────────

  @Post('bulk')
  @ApiOperation({
    summary: 'Carga masiva de vehículos (pre-data)',
    description: 'Inserta o actualiza hasta 1000 vehículos en una sola llamada. Usa upsert por placa.',
  })
  @ApiResponse({
    status: 201,
    schema: {
      example: { insertados: 950, actualizados: 45, errores: [{ placa: 'XYZ999', motivo: '...' }] },
    },
  })
  @HttpCode(HttpStatus.CREATED)
  cargaMasiva(@CurrentTenant() tenant: Tenant, @Body() dto: CargaMasivaVehiculosDto) {
    return this.svc.cargaMasiva(tenant.id, dto);
  }
}
