import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '../tenant/tenant.module';
import { FlotaConfig } from './entities/flota-config.entity';
import { FlotaViaje } from './entities/flota-viaje.entity';
import { FlotaCierre } from './entities/flota-cierre.entity';
import { FlotaService } from './flota.service';
import { FlotaController } from './flota.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FlotaConfig, FlotaViaje, FlotaCierre]), TenantModule],
  controllers: [FlotaController],
  providers: [FlotaService],
  exports: [FlotaService],
})
export class FlotaModule {}
