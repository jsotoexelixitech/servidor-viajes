import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantService } from './tenant.service';
import { TenantController, TenantSelfController } from './tenant.controller';
import { SeguroModule } from '../seguro/seguro.module';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), SeguroModule],
  controllers: [TenantController, TenantSelfController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
