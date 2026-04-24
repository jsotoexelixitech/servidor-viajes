import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Viaje } from './entities/viaje.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { ViajeController } from './viaje.controller';
import { ViajeService, VIAJE_QUEUE } from './viaje.service';
import { ViajeWebhookProcessor } from './viaje.webhook.processor';
import { TenantModule } from '../tenant/tenant.module';
import { SeguroModule } from '../seguro/seguro.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Viaje, Tenant]),
    BullModule.registerQueue({
      name: VIAJE_QUEUE,
      defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 },
    }),
    TenantModule,
    SeguroModule,
  ],
  controllers: [ViajeController],
  providers: [ViajeService, ViajeWebhookProcessor],
  exports: [ViajeService],
})
export class ViajeModule {}
