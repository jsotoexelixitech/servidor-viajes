import { Controller, Get, Header, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantService } from '../tenant/tenant.service';
import { FlotaRecibosService } from './flota-recibos.service';
import { FlotaPolizaVivoService } from './flota-poliza-vivo.service';

/**
 * Vista web PÚBLICA de solo lectura de una póliza de flota: /poliza/<token> en la pantalla.
 * Solo con el token aleatorio largo guardado en flota_polizas (nunca por cnpoliza). Sin login.
 * Mismo cuadro que "Póliza en vivo" (cabecera, certificados, recibos por viaje) y mismo `rev` para refrescar solo.
 */
@ApiTags('Flota · vista pública de la póliza')
@Controller('publico')
export class FlotaPublicoController {
  constructor(
    private readonly recibos: FlotaRecibosService,
    private readonly vivo: FlotaPolizaVivoService,
    private readonly tenants: TenantService,
  ) {}

  @Get('poliza/:token')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex')
  @ApiOperation({ summary: 'Cuadro en vivo de la póliza por su link público (solo lectura, sin login)' })
  async poliza(
    @Param('token') token: string,
    @Query('rev') rev?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    const p = await this.recibos.porToken(token);
    if (!p) throw new NotFoundException('Link no válido.');
    const tenant = await this.tenants.findById(p.tenantId);
    const r = await this.vivo.cuadro(p.tenantId, tenant?.nombre ?? '', { rev, desde, hasta, cnpoliza: p.cnpoliza });
    if (r.sinCambios) return r;
    // Sin detalles técnicos de la conexión en la vista pública.
    return {
      ...r,
      sis2000: { ok: r.sis2000.ok, error: r.sis2000.ok ? null : 'Sin conexión con Sis2000 en este momento.', consultadoEn: r.sis2000.consultadoEn },
      publico: { activa: p.activa, desasociadaEn: p.desasociadaEn },
    };
  }
}
