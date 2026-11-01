import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Tenant } from '../tenant/entities/tenant.entity';
import { FlotaCobroViajeService } from './flota-cobro-viaje.service';
import {
  CertificadoDto, CotizarDistanciaDto, EventoViajeDto, GuardarTarifasDto, PagoViajeDto,
} from './dto/cobro-viaje.dto';

/**
 * Cobro POR VIAJE de la póliza de flota (Ridery):
 * 1) la plataforma informa INICIO / FIN / CANCELACION → devolvemos el monto por km (urbano / extra urbano);
 * 2) la plataforma informa el pago de ese monto → se genera el recibo del viaje sobre el certificado del conductor.
 * Autenticación: X-Api-Key de la flota (igual que el resto de las APIs de la plataforma).
 */
@ApiTags('Flota · cobro por viaje')
@ApiSecurity('api-key')
@UseGuards(TenantGuard)
@Controller('flota')
export class FlotaCobroViajeController {
  constructor(private readonly svc: FlotaCobroViajeService) {}

  // ── Plataforma (Ridery) ──
  @Post('viajes/evento')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Evento de viaje: INICIO, FIN o CANCELACION (idempotente por idViaje)',
    description:
      'INICIO registra el viaje y ubica el certificado del conductor (por cédula o placa); si trae kmEstimados devuelve montoEstimado. ' +
      'FIN calcula el monto por km según la clasificación urbano / extra urbano y lo devuelve en `monto` (estadoPago=PENDIENTE). ' +
      'Repetir un evento ya aplicado devuelve el mismo resultado con duplicado=true.',
  })
  @ApiBody({
    type: EventoViajeDto,
    examples: {
      inicio: { value: { idViaje: 'RDY-000123', tipo: 'INICIO', fecha: '2026-11-01T14:05:00-04:00', placa: 'AB123CD', conductorDoc: 'V-12345678', conductorNombre: 'José Pérez', kmEstimados: 8.4 } },
      fin: { value: { idViaje: 'RDY-000123', tipo: 'FIN', fecha: '2026-11-01T14:31:00-04:00', km: 9.1 } },
      cancelacion: { value: { idViaje: 'RDY-000124', tipo: 'CANCELACION', motivo: 'Pasajero canceló' } },
    },
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        idViaje: 'RDY-000123', estado: 'FINALIZADO', duplicado: false, clasificacion: 'URBANO', tarifaKm: 0.1,
        km: 9.1, minutos: 26, monto: 1, moneda: 'USD', estadoPago: 'PENDIENTE',
        certificado: { cnpoliza: '18-1-1130480881', ccerti: 3 }, advertencias: [],
      },
    },
  })
  evento(@CurrentTenant() t: Tenant, @Body() dto: EventoViajeDto) {
    return this.svc.evento(t.id, dto);
  }

  @Post('viajes/pago')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pago del viaje: valida el monto y genera el recibo sobre el certificado del conductor',
    description:
      'El monto debe ser el devuelto en FIN (±0,01). Un viaje se paga una sola vez: repetir con la misma referencia ' +
      'devuelve el mismo recibo (duplicado=true); con otra referencia → 409. Si el recibo falla, el pago queda registrado ' +
      'con recibo.estado=ERROR y se reintenta reenviando el pago o desde la pantalla. ' +
      'Recibo REAL solo con FLOTA_RECIBO_REAL=1; si no, SIMULADO (no toca Sis2000).',
  })
  @ApiBody({ type: PagoViajeDto, examples: { pago: { value: { idViaje: 'RDY-000123', monto: 1, moneda: 'USD', referencia: 'PAY-778899', metodo: 'WALLET' } } } })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        idViaje: 'RDY-000123', estadoPago: 'PAGADO', duplicado: false,
        pago: {
          referencia: 'PAY-778899', monto: 1, moneda: 'USD',
          recibo: { estado: 'RECIBO_SIMULADO', modo: 'SIMULADO', cnpoliza: '18-1-1130480881', ccerti: 3, cnrecibo: 'SIM-20261101-4821', crecibo: null, error: null },
        },
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Viaje no finalizado o ya pagado con otra referencia.' })
  @ApiResponse({ status: 422, description: 'El monto no coincide con el del viaje.' })
  pago(@CurrentTenant() t: Tenant, @Body() dto: PagoViajeDto) {
    return this.svc.pagar(t.id, dto);
  }

  @Get('viajes/:idViaje/cobro')
  @ApiOperation({ summary: 'Estado del cobro de un viaje (monto, pago y recibo)' })
  estado(@CurrentTenant() t: Tenant, @Param('idViaje') idViaje: string) {
    return this.svc.estadoCobro(t.id, idViaje);
  }

  // ── Pantalla: clasificación de distancia y tarifas ──
  @Get('tarifas-distancia')
  @ApiOperation({ summary: 'Clasificación de distancia (urbano / extra urbano) y tarifa por km' })
  tarifas(@CurrentTenant() t: Tenant) {
    return this.svc.getTarifas(t.id);
  }

  @Put('tarifas-distancia')
  @ApiOperation({ summary: 'Guardar la clasificación de distancia y las tarifas (rangos de km sin solaparse)' })
  guardarTarifas(@CurrentTenant() t: Tenant, @Body() dto: GuardarTarifasDto) {
    return this.svc.guardarTarifas(t.id, dto, t.nombre);
  }

  @Post('tarifas-distancia/cotizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calculadora: monto de un viaje de N km con las tarifas guardadas' })
  cotizar(@CurrentTenant() t: Tenant, @Body() dto: CotizarDistanciaDto) {
    return this.svc.cotizar(t.id, dto);
  }

  // ── Pantalla: certificados (conductor → certificado de la póliza) ──
  @Get('certificados')
  @ApiOperation({ summary: 'Conductores / vehículos asociados a su certificado de la póliza de flota' })
  certificados(@CurrentTenant() t: Tenant, @Query('cnpoliza') cnpoliza?: string) {
    return this.svc.listarCertificados(t.id, cnpoliza || undefined);
  }

  @Put('certificados')
  @ApiOperation({ summary: 'Crear o actualizar la asociación conductor → certificado (por póliza + ccerti)' })
  guardarCertificado(@CurrentTenant() t: Tenant, @Body() dto: CertificadoDto) {
    return this.svc.guardarCertificado(t.id, dto);
  }

  @Delete('certificados/:id')
  @ApiOperation({ summary: 'Desactivar la asociación (no borra nada en Sis2000)' })
  desactivarCertificado(@CurrentTenant() t: Tenant, @Param('id') id: string) {
    return this.svc.desactivarCertificado(t.id, id);
  }

  @Post('certificados/sincronizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Traer los certificados (vhcerti) de la póliza desde Sis2000 vía nest-api' })
  sincronizar(@CurrentTenant() t: Tenant) {
    return this.svc.sincronizarCertificados(t.id);
  }

  // ── Pantalla: recibos por viaje ──
  @Get('pagos')
  @ApiOperation({ summary: 'Pagos de viajes y su recibo (más recientes primero)' })
  pagos(@CurrentTenant() t: Tenant, @Query('limit') limit?: string) {
    return this.svc.listarPagos(t.id, limit ? Number(limit) : 100);
  }

  @Post('pagos/:id/reintentar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reintentar el recibo de un pago que quedó en ERROR' })
  reintentar(@CurrentTenant() t: Tenant, @Param('id') id: string) {
    return this.svc.reintentarRecibo(t.id, id);
  }
}
