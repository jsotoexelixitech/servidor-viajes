import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import { join } from 'path';

import configuration from './config/configuration';
import { createTypeOrmConfig } from './config/typeorm.config';
import { createWinstonConfig } from './config/logger.config';

import { ViajeModule } from './modules/viaje/viaje.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { HealthModule } from './modules/health/health.module';
import { SeguroModule } from './modules/seguro/seguro.module';
import { VehiculoModule } from './modules/vehiculo/vehiculo.module';
import { ConductorModule } from './modules/conductor/conductor.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FlotaModule } from './modules/flota/flota.module';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RedisModule } from './common/redis/redis.module';
import { SessionModule } from './common/session/session.module';
import { EnvValidatorService } from './common/env-validator.service';

@Module({
  imports: [
    // Config global
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '.env.example'],
    }),

    // Logger estructurado con Winston
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createWinstonConfig(
          config.get('logging.level'),
          config.get('logging.dir'),
        ),
    }),

    // Base de datos PostgreSQL con pool de conexiones
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createTypeOrmConfig,
    }),

    // Rate limiting con Redis para alta concurrencia
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttl'),
            limit: config.get<number>('throttle.limit'),
          },
        ],
      }),
    }),

    // Sistema de colas Bull con Redis
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get('redis.password') || undefined,
          db: config.get<number>('redis.db'),
          maxRetriesPerRequest: 3,
          enableReadyCheck: false,
          lazyConnect: true,
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
        },
        settings: {
          lockDuration: 30000,
          maxStalledCount: 3,
        },
      }),
    }),

    // Tareas programadas (cron) — PolizaGuardianService las usa
    ScheduleModule.forRoot(),

    // Cliente Redis compartido entre todos los módulos (circuit breaker, caché tenant, guardian lock)
    RedisModule,

    // Sesión segura stateless (HMAC) — global para todos los módulos
    SessionModule,

    // Servir frontend compilado en producción (npm run build → frontend/dist)
    // En desarrollo, Vite dev server maneja el frontend por separado.
    ...(process.env.NODE_ENV === 'production'
      ? [
          ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', '..', 'frontend', 'dist'),
            // Excluir rutas de la API del static serving
            exclude: ['/api/(.*)', '/api/docs(.*)'],
            serveStaticOptions: {
              fallthrough: true,
            },
          }),
        ]
      : []),

    // Módulos de la aplicación
    TenantModule,
    ViajeModule,
    SeguroModule,
    HealthModule,
    VehiculoModule,
    ConductorModule,
    DashboardModule,
    FlotaModule,
  ],
  providers: [
    // Rate limiting global
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Filtro de excepciones global
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // Interceptor de logging global
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    // Validación de variables de entorno al arrancar
    EnvValidatorService,
  ],
})
export class AppModule {}
