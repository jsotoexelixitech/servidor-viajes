import { Controller, Get, Query, UseGuards, Param } from '@nestjs/common';
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

  @Get('conductores/ranking')
  @ApiSecurity('api-key')
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Ranking de conductores por métrica' })
  ranking(
    @CurrentTenant() tenant: Tenant,
    @Query('metrica') metrica: 'viajes' | 'prima' | 'comision' = 'prima',
    @Query('limit') limit?: string,
  ) {
    return this.svc.rankingConductores(
      tenant.id,
      metrica,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('conductores/en-curso')
  @ApiSecurity('api-key')
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Conductores con viajes activos en este momento' })
  enCurso(@CurrentTenant() tenant: Tenant) {
    return this.svc.conductoresEnCurso(tenant.id);
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

  // ── Drill-down: ver dashboard de un tenant específico (admin) ────────────
  @Get('admin/tenants/:tenantId/kpis')
  @ApiSecurity('admin-key')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'KPIs de un tenant específico (admin)' })
  kpisDeTenant(@Param('tenantId') tenantId: string) {
    return this.svc.kpisPorTenant(tenantId);
  }

  @Get('admin/tenants/:tenantId/conductores/ranking')
  @ApiSecurity('admin-key')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Ranking de conductores de un tenant (admin)' })
  rankingDeTenant(
    @Param('tenantId') tenantId: string,
    @Query('metrica') metrica: 'viajes' | 'prima' | 'comision' = 'prima',
    @Query('limit') limit?: string,
  ) {
    return this.svc.rankingConductores(
      tenantId,
      metrica,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('admin/tenants/:tenantId/conductores/en-curso')
  @ApiSecurity('admin-key')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Conductores en curso de un tenant (admin)' })
  enCursoDeTenant(@Param('tenantId') tenantId: string) {
    return this.svc.conductoresEnCurso(tenantId);
  }
}
