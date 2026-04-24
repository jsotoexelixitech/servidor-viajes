import {
  Controller, Post, Get, Put, Body, Param,
  ParseUUIDPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { CrearTenantDto } from './dto/crear-tenant.dto';
import { ConfigurarSeguroDto } from '../seguro/dto/seguro-config.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Tenant } from './entities/tenant.entity';
import { PolizaGuardianService } from '../seguro/poliza-guardian.service';

/**
 * Endpoints de administración global de tenants (sin autenticación de tenant).
 * En producción: proteja estas rutas con IP whitelist o un token de admin separado.
 */
@ApiTags('Tenants (Admin)')
@Controller('admin/tenants')
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly guardianService: PolizaGuardianService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un nuevo tenant', description: 'Crea una empresa/tenant y retorna su API Key.' })
  @ApiResponse({ status: 201, description: 'Tenant creado. La API Key se muestra UNA sola vez.' })
  @ApiResponse({ status: 409, description: 'Ya existe un tenant con ese nombre.' })
  async crear(@Body() dto: CrearTenantDto) {
    return this.tenantService.crear(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los tenants (sin API keys)' })
  async listar() {
    return this.tenantService.listar();
  }

  @Post(':id/desactivar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar un tenant' })
  async desactivar(@Param('id', ParseUUIDPipe) id: string) {
    await this.tenantService.desactivar(id);
    return { mensaje: 'Tenant desactivado correctamente.' };
  }

  /**
   * Dashboard de pólizas críticas — panel de control para el operador.
   * Muestra todos los viajes con pólizas sin emitir que necesitan atención.
   */
  @Get('polizas-criticas')
  @ApiOperation({
    summary: '🚨 Panel de pólizas sin emitir — monitoreo crítico',
    description: `Muestra todos los viajes cuya póliza NO fue emitida exitosamente.
    
**Estados posibles:**
- \`ERROR\`: falló, BullMQ reintentando automáticamente
- \`CRITICO\`: BullMQ agotó todos los reintentos, escáner lo está rescatando  
- \`EMITIENDO\` >5min: proceso murió a mitad, será rescatado por el guardian

**Este endpoint debe revisarse si recibe alertas del sistema.**
En producción, configura un monitor (Uptime Robot, Grafana) que llame este endpoint y alerte si \`total > 0\`.`,
  })
  async obtenerPolizasCriticas() {
    const resumen = await this.guardianService.obtenerResumenCriticos();
    return {
      alerta: resumen.total > 0,
      mensaje: resumen.total === 0
        ? '✅ Todas las pólizas están emitidas correctamente'
        : `🚨 ${resumen.total} viaje(s) con póliza pendiente requieren atención`,
      resumen: {
        total: resumen.total,
        criticos: resumen.criticos,
        errores: resumen.errores,
        atascados: resumen.atascados,
      },
      viajes: resumen.detalle,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Endpoints de autogestión del tenant autenticado.
 * Requieren el header X-Api-Key del tenant.
 */
@ApiTags('Mi Tenant (Configuración)')
@ApiHeader({ name: 'X-Api-Key', description: 'API Key del tenant', required: true })
@UseGuards(TenantGuard)
@Controller('tenant')
export class TenantSelfController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('me')
  @ApiOperation({ summary: 'Ver configuración actual del tenant autenticado' })
  async obtenerConfig(@CurrentTenant() tenant: Tenant) {
    return this.tenantService.obtenerConfig(tenant);
  }

  @Get('me/mapeos')
  @ApiOperation({
    summary: 'Ver configuración completa de seguro (mapeo + defaults + parámetros La Mundial)',
  })
  async obtenerMapeos(@CurrentTenant() tenant: Tenant) {
    return {
      seguroConfig: tenant.config?.seguroConfig ?? null,
      defaultValues: tenant.config?.defaultValues ?? {},
      fieldMappings: tenant.config?.fieldMappings ?? {},
      camposLaMundial: [
        'placa', 'fano', 'cmarca', 'cmodelo', 'cversion', 'color',
        'serial_carroceria', 'serial_motor', 'ccategoria_uso', 'ntoneladas',
        'nombre_tomador', 'apellido_tomador', 'rif_tomador', 'tipo_cedula_tomador',
        'fnac_tomador', 'telefono_tomador', 'correo_tomador',
        'estado_tomador', 'ciudad_tomador', 'direccion_tomador',
        'sexo_tomador', 'estado_civil_tomador',
        // Campos de nuestro sistema:
        'latInicio', 'lngInicio', 'latDestino', 'lngDestino', 'nombreConductor',
      ],
    };
  }

  @Put('me/seguro')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Configurar integración con La Mundial + mapeo de campos',
    description: `Guarda en un solo endpoint:
- **seguroConfig**: parámetros fijos (URL, plan, ramo, productor, frecuencia)
- **fieldMappings**: nombre campo La Mundial → nombre que usa TU empresa  
- **defaultValues**: valores por defecto para campos que tu empresa no envía

Ejemplo: si tu empresa envía \`"numPlaca"\` en lugar de \`"placa"\`, configura:  
\`{ "fieldMappings": { "placa": "numPlaca" } }\``,
  })
  async configurarSeguro(@Body() dto: ConfigurarSeguroDto, @CurrentTenant() tenant: Tenant) {
    return this.tenantService.configurarSeguro(tenant, dto);
  }
}
