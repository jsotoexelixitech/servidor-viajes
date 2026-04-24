import {
  Controller, Post, Get, Body, Param, Query, UseGuards,
  UseInterceptors, HttpCode, HttpStatus, ParseUUIDPipe,
  ParseIntPipe, DefaultValuePipe, Headers,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiQuery, ApiBody,
} from '@nestjs/swagger';
import { ViajeService } from './viaje.service';
import { FinalizarViajeDto } from './dto/finalizar-viaje.dto';
import { EnviarViajeDto } from './dto/enviar-viaje.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { FieldMappingInterceptor } from '../../common/interceptors/field-mapping.interceptor';
import { Tenant } from '../tenant/entities/tenant.entity';

@ApiTags('Viajes')
@ApiHeader({ name: 'X-Api-Key', description: 'API Key del tenant', required: true })
@UseGuards(TenantGuard)
@Controller('viaje')
export class ViajeController {
  constructor(private readonly viajeService: ViajeService) {}

  @Post('iniciar')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FieldMappingInterceptor)
  @ApiOperation({
    summary: 'Iniciar un viaje',
    description: `Recibe el evento de inicio de viaje de la empresa.
    
**Flujo automático:**
1. Aplica el mapeo de campos configurado (nombre empresa → nombre La Mundial)
2. Aplica los valores por defecto configurados para campos faltantes
3. Llama a La Mundial para emitir la póliza RCV
4. Guarda el viaje temporalmente con número de póliza y URL del PDF
5. Si La Mundial falla, encola reintentos automáticos

Los nombres de los campos dependen del **mapeo configurado** en PUT /api/tenant/me/seguro`,
  })
  @ApiBody({
    description: 'Los campos y sus nombres dependen del mapeo configurado para este tenant',
    schema: {
      type: 'object',
      example: {
        numPlaca: 'AE886C23',
        year: 2020,
        brandCode: '083',
        modelCode: '001',
        versionCode: '03',
        driverName: 'Juan',
        driverLastName: 'Pérez',
        driverCI: '25221952',
        driverDOB: '1990-10-13',
        driverPhone: '+584241829583',
        driverEmail: 'juan@example.com',
        chassisSerial: 'SC1S6ZMV3024323',
        vehicleColor: 'Negro',
        startLat: 10.4806,
        startLng: -66.9036,
        destLat: 10.4906,
        destLng: -66.8936,
      },
    },
  })
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
  @ApiOperation({
    summary: 'Finalizar un viaje',
    description: 'Finaliza la póliza en La Mundial y elimina los datos temporales del viaje de la BD.',
  })
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

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un viaje por ID (incluye datos de póliza)' })
  async obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentTenant() tenant: Tenant) {
    return this.viajeService.obtener(id, tenant);
  }

  @Get()
  @ApiOperation({ summary: 'Listar viajes activos del tenant (paginado)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listar(
    @CurrentTenant() tenant: Tenant,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.viajeService.listar(tenant, page, limit);
  }
}
