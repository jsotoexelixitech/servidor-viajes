import {
  Controller, Post, Get, Body, Param, Query, UseGuards,
  UseInterceptors, HttpCode, HttpStatus, ParseUUIDPipe,
  ParseIntPipe, DefaultValuePipe, Headers,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiQuery,
} from '@nestjs/swagger';
import { ViajeService } from './viaje.service';
import { FinalizarViajeDto } from './dto/finalizar-viaje.dto';
import { EnviarViajeDto } from './dto/enviar-viaje.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { FieldMappingInterceptor } from '../../common/interceptors/field-mapping.interceptor';
import { Tenant } from '../tenant/entities/tenant.entity';

@ApiTags('Viajes')
@ApiHeader({ name: 'X-Session-Token', description: 'Token de sesión (recomendado)', required: false })
@ApiHeader({ name: 'X-Api-Key', description: 'API Key directa', required: false })
@UseGuards(TenantGuard)
@Controller('viaje')
export class ViajeController {
  constructor(private readonly viajeService: ViajeService) {}

  @Post('iniciar')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FieldMappingInterceptor)
  @ApiOperation({ summary: 'Iniciar un viaje y emitir póliza RCV' })
  @ApiResponse({ status: 201, description: 'Viaje iniciado. Incluye cnpoliza y urlPolizaPDF si la emisión fue exitosa.' })
  @ApiResponse({ status: 400, description: 'Faltan campos requeridos o mapeo incorrecto.' })
  async iniciar(
    @Body() body: Record<string, any>,
    @CurrentTenant() tenant: Tenant,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    return this.viajeService.iniciar(body, tenant, idempotencyKey);
  }

  @Post('finalizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finalizar un viaje y eliminar datos temporales' })
  @ApiResponse({ status: 200, description: 'Viaje finalizado, datos eliminados.' })
  @ApiResponse({ status: 404, description: 'Viaje no encontrado.' })
  async finalizar(@Body() dto: FinalizarViajeDto, @CurrentTenant() tenant: Tenant) {
    return this.viajeService.finalizar(dto.idViaje, tenant);
  }

  @Post('enviar')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Reenviar datos al webhook externo adicional' })
  async enviar(@Body() dto: EnviarViajeDto, @CurrentTenant() tenant: Tenant) {
    return this.viajeService.enviar(dto.idViaje, dto.forzarReenvio ?? false, tenant);
  }

  @Get('mis-polizas-criticas')
  @ApiOperation({
    summary: 'Pólizas críticas del tenant autenticado',
    description: 'Devuelve únicamente las pólizas de ESTE tenant en estado ERROR, CRITICO o atascadas. No expone datos de otros tenants.',
  })
  @ApiResponse({ status: 200, description: 'Resumen de pólizas pendientes.' })
  async misPolizasCriticas(@CurrentTenant() tenant: Tenant) {
    return this.viajeService.misPolizasCriticas(tenant);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un viaje por ID' })
  async obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentTenant() tenant: Tenant) {
    return this.viajeService.obtener(id, tenant);
  }

  @Get()
  @ApiOperation({ summary: 'Listar viajes activos del tenant (paginado)' })
  @ApiQuery({ name: 'page',  required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listar(
    @CurrentTenant() tenant: Tenant,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.viajeService.listar(tenant, page, limit);
  }
}
