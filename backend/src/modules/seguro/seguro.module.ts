import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { LaMundialService } from './lamundial.service';
import { SeguroService } from './seguro.service';
import { SeguroController } from './seguro.controller';
import { PolizaGuardianService } from './poliza-guardian.service';
import { Viaje } from '../viaje/entities/viaje.entity';
import { VIAJE_QUEUE } from '../viaje/viaje.service';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Viaje]),
    BullModule.registerQueue({ name: VIAJE_QUEUE }),
    forwardRef(() => TenantModule),
  ],
  controllers: [SeguroController],
  providers: [LaMundialService, SeguroService, PolizaGuardianService],
  exports: [LaMundialService, SeguroService, PolizaGuardianService],
})
export class SeguroModule {}
