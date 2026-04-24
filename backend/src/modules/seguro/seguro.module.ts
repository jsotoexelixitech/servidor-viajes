import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { LaMundialService } from './lamundial.service';
import { SeguroService } from './seguro.service';
import { PolizaGuardianService } from './poliza-guardian.service';
import { Viaje } from '../viaje/entities/viaje.entity';
import { VIAJE_QUEUE } from '../viaje/viaje.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Viaje]),
    BullModule.registerQueue({ name: VIAJE_QUEUE }),
  ],
  providers: [LaMundialService, SeguroService, PolizaGuardianService],
  exports: [LaMundialService, SeguroService, PolizaGuardianService],
})
export class SeguroModule {}
