import {
  Controller, Get, Post, Body, Query, UseGuards, BadRequestException,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiHeader, ApiQuery, ApiResponse,
} from '@nestjs/swagger';
import { LaMundialService, LaMundialCotizacionParams } from './lamundial.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Tenant } from '../tenant/entities/tenant.entity';

function getSeguroConfig(tenant: Tenant) {
  const cfg = tenant.config?.seguroConfig as any;
  if (!cfg?.baseUrl) {
    throw new BadRequestException(
      'Este tenant no tiene configurado el servicio de seguros. ' +
      'Configure primero en PUT /api/tenant/me/seguro',
    );
  }
  return { baseUrl: cfg.baseUrl as string, authToken: cfg.authToken as string | undefined };
}

@ApiTags('Catálogo de Vehículos & Cotización')
@ApiHeader({ name: 'X-Session-Token', description: 'Token de sesión', required: false })
@ApiHeader({ name: 'X-Api-Key', description: 'API Key directa', required: false })
@UseGuards(TenantGuard)
@Controller('seguro')
export class SeguroController {
  constructor(private readonly laMundialService: LaMundialService) {}

  // ── Catálogo INMA ──────────────────────────────────────────────────────────

  @Get('catalogo/anios')
  @ApiOperation({ summary: 'Rango de años disponibles en el catálogo' })
  @ApiResponse({ status: 200, description: '{ min: number; max: number }' })
  async anios(@CurrentTenant() tenant: Tenant) {
    const { baseUrl, authToken } = getSeguroConfig(tenant);
    return this.laMundialService.obtenerAnios(baseUrl, authToken);
  }

  @Get('catalogo/marcas')
  @ApiOperation({ summary: 'Marcas disponibles para un año' })
  @ApiQuery({ name: 'fano', description: 'Año del vehículo', type: Number, required: true })
  async marcas(
    @Query('fano') fano: string,
    @CurrentTenant() tenant: Tenant,
  ) {
    if (!fano || isNaN(+fano)) throw new BadRequestException('Parámetro "fano" requerido (número)');
    const { baseUrl, authToken } = getSeguroConfig(tenant);
    return this.laMundialService.obtenerMarcas(baseUrl, +fano, authToken);
  }

  @Get('catalogo/modelos')
  @ApiOperation({ summary: 'Modelos de una marca para un año' })
  @ApiQuery({ name: 'fano',   description: 'Año del vehículo',  type: Number, required: true })
  @ApiQuery({ name: 'cmarca', description: 'Código de marca',   type: String, required: true })
  async modelos(
    @Query('fano')   fano: string,
    @Query('cmarca') cmarca: string,
    @CurrentTenant() tenant: Tenant,
  ) {
    if (!fano || !cmarca) throw new BadRequestException('Parámetros "fano" y "cmarca" requeridos');
    const { baseUrl, authToken } = getSeguroConfig(tenant);
    return this.laMundialService.obtenerModelos(baseUrl, +fano, cmarca, authToken);
  }

  @Get('catalogo/versiones')
  @ApiOperation({ summary: 'Versiones de un modelo para un año y marca' })
  @ApiQuery({ name: 'fano',    description: 'Año del vehículo',  type: Number, required: true })
  @ApiQuery({ name: 'cmarca',  description: 'Código de marca',   type: String, required: true })
  @ApiQuery({ name: 'cmodelo', description: 'Código de modelo',  type: String, required: true })
  async versiones(
    @Query('fano')    fano: string,
    @Query('cmarca')  cmarca: string,
    @Query('cmodelo') cmodelo: string,
    @CurrentTenant() tenant: Tenant,
  ) {
    if (!fano || !cmarca || !cmodelo) {
      throw new BadRequestException('Parámetros "fano", "cmarca" y "cmodelo" requeridos');
    }
    const { baseUrl, authToken } = getSeguroConfig(tenant);
    return this.laMundialService.obtenerVersiones(baseUrl, +fano, cmarca, cmodelo, authToken);
  }

  // ── Cotización ─────────────────────────────────────────────────────────────

  @Post('cotizar')
  @ApiOperation({
    summary: 'Cotiza la prima RCV para un vehículo',
    description: `Devuelve \`mprima\` (Bs), \`mprimaext\` (USD) y \`ptasa\` (tasa BCV).
    
**Importante**: \`mprima = 0.00\` indica que la combinación marca/modelo/versión/categoría
no tiene tarifa activa en La Mundial. Verifique los códigos con el catálogo INMA.
Solo el plan \`RCVBAS\` tiene tarifas configuradas actualmente.`,
  })
  @ApiResponse({
    status: 201,
    description: '{ mprima: string; mprimaext: string; ptasa: number }',
  })
  async cotizar(
    @Body() params: LaMundialCotizacionParams,
    @CurrentTenant() tenant: Tenant,
  ) {
    const { baseUrl, authToken } = getSeguroConfig(tenant);
    return this.laMundialService.cotizar(baseUrl, params, authToken);
  }
}
