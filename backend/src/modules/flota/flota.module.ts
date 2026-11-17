import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '../tenant/tenant.module';
import { FlotaConfig } from './entities/flota-config.entity';
import { FlotaViaje } from './entities/flota-viaje.entity';
import { FlotaCierre } from './entities/flota-cierre.entity';
import { FlotaTarifaDistancia } from './entities/flota-tarifa-distancia.entity';
import { FlotaCertificado } from './entities/flota-certificado.entity';
import { FlotaPagoViaje } from './entities/flota-pago-viaje.entity';
import { FlotaRecibo } from './entities/flota-recibo.entity';
import { FlotaPoliza } from './entities/flota-poliza.entity';
import { FlotaService } from './flota.service';
import { FlotaController } from './flota.controller';
import { FlotaCobroViajeService } from './flota-cobro-viaje.service';
import { FlotaCobroViajeController } from './flota-cobro-viaje.controller';
import { FlotaSis2000Client } from './flota-sis2000.client';
import { FlotaPolizaVivoService } from './flota-poliza-vivo.service';
import { FlotaVivoBus } from './flota-vivo.bus';
import { FlotaRecibosService } from './flota-recibos.service';
import { FlotaPolizaRecibosController } from './flota-poliza-recibos.controller';
import { FlotaLoteService } from './flota-lote.service';
import { FlotaPublicoController } from './flota-publico.controller';
import { FlotaDocumentosController } from './flota-documentos.controller';
import { FlotaDocumentosService } from './flota-documentos.service';
import { FlotaExpedienteClient } from './flota-expediente.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FlotaConfig, FlotaViaje, FlotaCierre, FlotaTarifaDistancia, FlotaCertificado, FlotaPagoViaje, FlotaRecibo, FlotaPoliza,
    ]),
    TenantModule,
  ],
  controllers: [FlotaController, FlotaCobroViajeController, FlotaPolizaRecibosController, FlotaPublicoController, FlotaDocumentosController],
  providers: [
    FlotaService, FlotaCobroViajeService, FlotaSis2000Client, FlotaPolizaVivoService, FlotaVivoBus, FlotaRecibosService, FlotaLoteService,
    FlotaExpedienteClient, FlotaDocumentosService,
  ],
  exports: [FlotaService, FlotaCobroViajeService],
})
export class FlotaModule {}
