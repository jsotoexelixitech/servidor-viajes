import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vendedor } from './entities/vendedor.entity';
import { VendedorService } from './vendedor.service';
import { VendedorController } from './vendedor.controller';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TypeOrmModule.forFeature([Vendedor]), TenantModule],
  controllers: [VendedorController],
  providers: [VendedorService],
  exports: [VendedorService],
})
export class VendedorModule {}
