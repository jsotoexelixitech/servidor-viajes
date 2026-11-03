import {
  Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Tenant } from '../tenant/entities/tenant.entity';
import { FiltroRecibos, FlotaRecibosService } from './flota-recibos.service';
import { FlotaVivoBus } from './flota-vivo.bus';
import { AnularReciboDto, CrearPolizaFlotaDto, EmitirLoteDto, RegistrarPolizaDto } from './dto/cobro-viaje.dto';
import { FlotaLoteService } from './flota-lote.service';

const filtro = (q: Record<string, string | undefined>): FiltroRecibos => ({
  cnpoliza: q.cnpoliza || undefined,
  ccerti: q.ccerti != null && q.ccerti !== '' ? Number(q.ccerti) : undefined,
  desde: q.desde || undefined,
  hasta: q.hasta || undefined,
  estado: q.estado || undefined,
  sync: q.sync || undefined,
  limit: q.limit ? Number(q.limit) : undefined,
});

/**
 * Fase 1 Ridery: póliza registrada y recibos por viaje en NUESTRA base (numeración RDY-…),
 * listos para subirse a Sis2000 cuando La Mundial cree los SP. Mismo guard que el resto de flota.
 */
@ApiTags('Flota · póliza y recibos (Nexus)')
@ApiSecurity('api-key')
@UseGuards(TenantGuard)
@Controller('flota')
export class FlotaPolizaRecibosController {
  constructor(
    private readonly svc: FlotaRecibosService,
    private readonly bus: FlotaVivoBus,
    private readonly lote: FlotaLoteService,
  ) {}

  @Get('poliza')
  @ApiOperation({ summary: 'Póliza de flota actual (configuración) y su registro en Nexus' })
  poliza(@CurrentTenant() t: Tenant) {
    return this.svc.polizaActual(t.id);
  }

  @Post('poliza/registrar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Registrar una póliza de flota YA emitida por La Mundial (valida con nest-api; no escribe en Sis2000)',
    description: 'Queda como póliza de la flota. Si nest-api no la encuentra → 422, salvo forzar=true (queda validada=false).',
  })
  async registrar(@CurrentTenant() t: Tenant, @Body() dto: RegistrarPolizaDto) {
    try {
      return await this.svc.registrarPoliza(t.id, dto, t.nombre);
    } finally {
      this.bus.bump(t.id);
    }
  }

  @Post('poliza/crear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Crear la póliza de flota en Sis2000 (nest-api → sp_flota_crear_poliza_nexus, sin recibos) y registrarla',
    description: 'Tomador Ridery, plan y vigencia. Queda como póliza de la flota (origen CREADA). Requiere NEST_API_URL / NEST_API_KEY con scope flota:write.',
  })
  async crear(@CurrentTenant() t: Tenant, @Body() dto: CrearPolizaFlotaDto) {
    try {
      return await this.svc.crearPoliza(t.id, dto, t.nombre);
    } finally {
      this.bus.bump(t.id);
    }
  }

  @Post('poliza/emitir-lote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Crear la flota desde el Excel: crea la póliza (si no viene cnpoliza) e incluye cada conductor (sin recibo)',
    description: 'Resultado por fila (ccerti o el mensaje del SP). Idempotente por placa + conductor. La pantalla lo llama fila por fila para la barra de progreso.',
  })
  async emitirLote(@CurrentTenant() t: Tenant, @Body() dto: EmitirLoteDto) {
    try {
      return await this.lote.emitir(t.id, dto, t.nombre);
    } finally {
      this.bus.bump(t.id);
    }
  }

  @Get('polizas')
  @ApiOperation({ summary: 'Pólizas de la flota (activa e historial) con su link público, certificados y recibos locales' })
  polizas(@CurrentTenant() t: Tenant) {
    return this.svc.listarPolizas(t.id);
  }

  @Post('polizas/:id/desasociar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Desasociar la póliza SOLO en Nexus (pruebas): activa=false y sale de la configuración. NO borra ni anula nada en Sis2000',
  })
  async desasociar(@CurrentTenant() t: Tenant, @Param('id') id: string) {
    try {
      return await this.svc.desasociarPoliza(t.id, id, t.nombre);
    } finally {
      this.bus.bump(t.id);
    }
  }

  @Post('polizas/:id/activar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Volver a dejar activa una póliza anterior (pasa a la configuración de la flota)' })
  async activar(@CurrentTenant() t: Tenant, @Param('id') id: string) {
    try {
      return await this.svc.activarPoliza(t.id, id, t.nombre);
    } finally {
      this.bus.bump(t.id);
    }
  }

  @Get('recibos')
  @ApiOperation({ summary: 'Recibos por viaje (Nexus) por póliza / certificado / rango (desde-hasta = fecha del viaje)' })
  recibos(@CurrentTenant() t: Tenant, @Query() q: Record<string, string | undefined>) {
    return this.svc.listar(t.id, filtro(q));
  }

  @Get('recibos/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'CSV de recibos por viaje para La Mundial (mismos filtros que /flota/recibos)' })
  async recibosCsv(@CurrentTenant() t: Tenant, @Query() q: Record<string, string | undefined>, @Res() res: Response) {
    const { nombre, contenido } = await this.svc.csv(t.id, filtro(q));
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(contenido);
  }

  @Post('recibos/:id/anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular un recibo Nexus (no sincronizado con Sis2000)' })
  async anular(@CurrentTenant() t: Tenant, @Param('id') id: string, @Body() dto: AnularReciboDto) {
    try {
      return await this.svc.anular(t.id, id, dto.motivo);
    } finally {
      this.bus.bump(t.id);
    }
  }
}
