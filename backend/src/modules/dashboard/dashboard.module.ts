import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Viaje } from '../viaje/entities/viaje.entity';
import { Vendedor } from '../vendedor/entities/vendedor.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Viaje, Vendedor, Tenant]),
    TenantModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
