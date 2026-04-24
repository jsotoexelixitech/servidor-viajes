import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Viaje } from '../modules/viaje/entities/viaje.entity';
import { Tenant } from '../modules/tenant/entities/tenant.entity';
import { Vehiculo } from '../modules/vehiculo/entities/vehiculo.entity';

export function createTypeOrmConfig(configService: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: configService.get('database.host'),
    port: configService.get<number>('database.port'),
    username: configService.get('database.username'),
    password: configService.get('database.password'),
    database: configService.get('database.name'),
    entities: [Viaje, Tenant, Vehiculo],
    synchronize: configService.get('app.nodeEnv') !== 'production',
    migrationsRun: configService.get('app.nodeEnv') === 'production',
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    logging: configService.get('app.nodeEnv') === 'development' ? ['error', 'warn'] : ['error'],
    // Connection pool settings for high concurrency
    extra: {
      max: configService.get<number>('database.poolSize'),
      idleTimeoutMillis: configService.get<number>('database.poolIdleTimeout'),
      connectionTimeoutMillis: configService.get<number>('database.poolConnectionTimeout'),
      // Keep-alive to prevent dropped connections
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    },
    retryAttempts: 10,
    retryDelay: 3000,
    autoLoadEntities: true,
    poolSize: configService.get<number>('database.poolSize'),
  };
}
