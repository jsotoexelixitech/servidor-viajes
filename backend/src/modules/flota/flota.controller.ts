import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Tenant } from '../tenant/entities/tenant.entity';
import { FlotaService } from './flota.service';
import {
  CancelarViajeDto, CierreDto, ConfigCobroDto, FinViajeDto, GenerarReciboDto, InicioViajeDto, SimularDto,
} from './dto/flota.dto';

/**
 * Póliza de flota por uso: la plataforma (Ridery) informa inicio y fin de cada viaje;
 * se costea por tiempo o km y al cierre del mes se genera UN recibo por el total.
 */
@ApiTags('Flota por uso')
@ApiSecurity('api-key')
@UseGuards(TenantGuard)
@Controller('flota')
export class FlotaController {
  constructor(private readonly svc: FlotaService) {}

  // ── Plataforma (Ridery) ──
  @Post('viajes/inicio')
  @ApiOperation({ summary: 'Inicio de viaje (idempotente por idExterno)' })
  inicio(@CurrentTenant() t: Tenant, @Body() dto: InicioViajeDto) {
    return this.svc.iniciarViaje(t.id, dto);
  }

  @Post('viajes/fin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fin de viaje: calcula minutos, km y costo con la tarifa vigente' })
  fin(@CurrentTenant() t: Tenant, @Body() dto: FinViajeDto) {
    return this.svc.finalizarViaje(t.id, dto);
  }

  @Post('viajes/cancelar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar viaje en curso (costo 0)' })
  cancelar(@CurrentTenant() t: Tenant, @Body() dto: CancelarViajeDto) {
    return this.svc.cancelarViaje(t.id, dto);
  }

  // ── Pantalla ──
  @Get('viajes')
  @ApiOperation({ summary: 'Feed de viajes (más recientes primero)' })
  feed(@CurrentTenant() t: Tenant, @Query('limit') limit?: string, @Query('estado') estado?: string) {
    return this.svc.feed(t.id, limit ? Number(limit) : 50, estado || undefined);
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Totales del mes y detalle por conductor (YYYY-MM)' })
  resumen(@CurrentTenant() t: Tenant, @Query('periodo') periodo?: string) {
    return this.svc.resumen(t.id, periodo || undefined);
  }

  @Get('config')
  @ApiOperation({ summary: 'Configuración de cobro vigente' })
  getConfig(@CurrentTenant() t: Tenant) {
    return this.svc.getConfig(t.id);
  }

  @Get('config/historial')
  @ApiOperation({ summary: 'Últimas versiones de la configuración de cobro' })
  historial(@CurrentTenant() t: Tenant) {
    return this.svc.historialConfig(t.id);
  }

  @Put('config')
  @ApiOperation({ summary: 'Guardar configuración de cobro (crea una versión nueva)' })
  setConfig(@CurrentTenant() t: Tenant, @Body() dto: ConfigCobroDto) {
    return this.svc.setConfig(t.id, dto, t.nombre);
  }

  @Post('simular')
  @ApiOperation({ summary: 'Simulador: genera viajes de prueba del mes' })
  simular(@CurrentTenant() t: Tenant, @Body() dto: SimularDto) {
    return this.svc.simular(t.id, dto);
  }

  @Delete('simulados')
  @ApiOperation({ summary: 'Borra los viajes simulados que no tienen recibo' })
  borrarSimulados(@CurrentTenant() t: Tenant) {
    return this.svc.borrarSimulados(t.id);
  }

  @Get('cierres')
  @ApiOperation({ summary: 'Cierres mensuales' })
  cierres(@CurrentTenant() t: Tenant) {
    return this.svc.listarCierres(t.id);
  }

  @Post('cierres')
  @ApiOperation({ summary: 'Calcular (o recalcular) el cierre de un mes' })
  calcularCierre(@CurrentTenant() t: Tenant, @Body() dto: CierreDto) {
    return this.svc.calcularCierre(t.id, dto.periodo);
  }

  @Get('cierres/:id')
  @ApiOperation({ summary: 'Detalle del cierre (por conductor)' })
  detalleCierre(@CurrentTenant() t: Tenant, @Param('id') id: string) {
    return this.svc.detalleCierre(t.id, id);
  }

  @Post('cierres/:id/recibo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generar el recibo del cierre (SIMULADO por defecto; REAL vía nest-api)' })
  generarRecibo(@CurrentTenant() t: Tenant, @Param('id') id: string, @Body() dto: GenerarReciboDto) {
    return this.svc.generarRecibo(t.id, id, dto.modo ?? 'SIMULADO');
  }
}
