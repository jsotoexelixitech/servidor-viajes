import {
  Controller, Post, Get, Put, Body, Param,
  ParseUUIDPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiBearerAuth } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { CrearTenantDto } from './dto/crear-tenant.dto';
import { ConfigurarSeguroDto } from '../seguro/dto/seguro-config.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { SessionService } from '../../common/session/session.service';
import { Tenant } from './entities/tenant.entity';
import { PolizaGuardianService } from '../seguro/poliza-guardian.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Enmascara el authToken del seguroConfig para que no viaje en la respuesta. */
function maskSeguroConfig(config: Record<string, unknown> | null) {
  if (!config) return config;
  const { seguroConfig, ...rest } = config as any;
  if (!seguroConfig) return config;
  return {
    ...rest,
    seguroConfig: {
      ...seguroConfig,
      authToken: seguroConfig.authToken ? '••••••••' : null,
    },
  };
}

// ─── Auth (sesión segura) ─────────────────────────────────────────────────────

/**
 * Intercambia una API Key por un token de sesión de corta duración.
 * La API Key cruda solo viaja UNA vez; el frontend usa el session token en adelante.
 */
@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly tenantService: TenantService,
  ) {}

  @Post('session')
  @UseGuards(TenantGuard)
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'X-Api-Key', description: 'API Key del tenant', required: true })
  @ApiOperation({
    summary: 'Iniciar sesión — intercambia API Key por session token',
    description: `Valida la API Key y devuelve un token de sesión temporal (HMAC stateless).
    
**El frontend debe:**
1. Enviar la API Key UNA sola vez a este endpoint.
2. Almacenar el \`sessionToken\` solo en memoria (nunca en localStorage).
3. Usar \`X-Session-Token: <token>\` en todas las peticiones siguientes.
4. Descartar el token al cerrar la pestaña.`,
  })
  @ApiResponse({ status: 200, description: 'Sesión iniciada. Guarda el sessionToken en memoria.' })
  @ApiResponse({ status: 401, description: 'API Key inválida o tenant inactivo.' })
  async login(@CurrentTenant() tenant: Tenant) {
    const { token, expiresAt } = this.sessionService.generate(tenant.id);
    return {
      sessionToken: token,
      expiresAt,
      tenant: {
        id:     tenant.id,
        nombre: tenant.nombre,
      },
    };
  }
}

// ─── Admin ────────────────────────────────────────────────────────────────────

/**
 * Administración global de tenants.
 * Requiere  X-Admin-Key: <ADMIN_SECRET>  configurado en .env
 */
@ApiTags('Tenants (Admin)')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/tenants')
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly guardianService: PolizaGuardianService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un nuevo tenant' })
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

  @Get('polizas-criticas')
  @ApiOperation({ summary: 'Panel de pólizas sin emitir — monitoreo crítico' })
  async obtenerPolizasCriticas() {
    const resumen = await this.guardianService.obtenerResumenCriticos();
    return {
      alerta:   resumen.total > 0,
      mensaje:  resumen.total === 0
        ? 'Todas las pólizas están emitidas correctamente'
        : `${resumen.total} viaje(s) con póliza pendiente requieren atención`,
      resumen: {
        total:     resumen.total,
        criticos:  resumen.criticos,
        errores:   resumen.errores,
        atascados: resumen.atascados,
      },
      viajes:    resumen.detalle,
      timestamp: new Date().toISOString(),
    };
  }
}

// ─── Tenant self-service ──────────────────────────────────────────────────────

@ApiTags('Mi Tenant (Configuración)')
@ApiHeader({ name: 'X-Session-Token', description: 'Token de sesión (recomendado)', required: false })
@ApiHeader({ name: 'X-Api-Key', description: 'API Key directa (clientes externos)', required: false })
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
  @ApiOperation({ summary: 'Ver configuración completa de seguro (mapeo + defaults + campos)' })
  async obtenerMapeos(@CurrentTenant() tenant: Tenant) {
    return {
      config:          maskSeguroConfig(tenant.config),
      defaultValues:   tenant.config?.defaultValues ?? {},
      fieldMappings:   tenant.config?.fieldMappings ?? {},
      camposRequeridos: [
        'placa', 'fano', 'cmarca', 'cmodelo', 'cversion', 'color',
        'serial_carroceria', 'serial_motor', 'ccategoria_uso', 'ntoneladas',
        'nombre_tomador', 'apellido_tomador', 'rif_tomador', 'tipo_cedula_tomador',
        'fnac_tomador', 'telefono_tomador', 'correo_tomador',
        'estado_tomador', 'ciudad_tomador', 'direccion_tomador',
        'sexo_tomador', 'estado_civil_tomador',
        'latInicio', 'lngInicio', 'latDestino', 'lngDestino', 'nombreConductor',
      ],
    };
  }

  @Put('me/seguro')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Configurar integración con proveedor + mapeo de campos' })
  async configurarSeguro(@Body() dto: ConfigurarSeguroDto, @CurrentTenant() tenant: Tenant) {
    return this.tenantService.configurarSeguro(tenant, dto);
  }
}
