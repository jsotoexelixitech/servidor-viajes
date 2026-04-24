import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantService } from './tenant.service';
import { TenantController, TenantSelfController, AuthController } from './tenant.controller';
import { SeguroModule } from '../seguro/seguro.module';
import { AdminGuard } from '../../common/guards/admin.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), SeguroModule],
  controllers: [AuthController, TenantController, TenantSelfController],
  providers: [TenantService, AdminGuard],
  exports: [TenantService],
})
export class TenantModule {}
