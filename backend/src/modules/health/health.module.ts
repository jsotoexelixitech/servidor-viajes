import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { SeguroModule } from '../seguro/seguro.module';

@Module({
  imports: [
    TerminusModule,
    TypeOrmModule,
    SeguroModule,
  ],
  controllers: [HealthController],
})
export class HealthModule {}
