import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Tenant } from '../tenant/entities/tenant.entity';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  // ── Endpoints del tenant autenticado ─────────────────────────────────────
  @Get('kpis')
  @ApiSecurity('api-key')
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'KPIs del tenant autenticado' })
  kpis(@CurrentTenant() tenant: Tenant) {
    return this.svc.kpisPorTenant(tenant.id);
  }

  @Get('vendedores/ranking')
  @ApiSecurity('api-key')
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Ranking de vendedores por métrica' })
  ranking(
    @CurrentTenant() tenant: Tenant,
    @Query('metrica') metrica: 'viajes' | 'prima' | 'comision' = 'prima',
    @Query('limit') limit?: string,
  ) {
    return this.svc.rankingVendedores(
      tenant.id,
      metrica,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('vendedores/en-curso')
  @ApiSecurity('api-key')
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Vendedores con viajes activos en este momento' })
  enCurso(@CurrentTenant() tenant: Tenant) {
    return this.svc.vendedoresEnCurso(tenant.id);
  }

  // ── Endpoints admin (cartera y stats globales) ───────────────────────────
  @Get('admin/global')
  @ApiSecurity('admin-key')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'KPIs globales (todos los tenants)' })
  global() {
    return this.svc.kpisGlobales();
  }

  @Get('admin/cartera')
  @ApiSecurity('admin-key')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Cartera de clientes con KPIs por tenant' })
  cartera() {
    return this.svc.carteraClientes();
  }
}
