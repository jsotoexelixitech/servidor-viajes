import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * RedisModule — proveedor global del cliente Redis compartido.
 *
 * Al ser @Global(), todos los módulos que importen RedisModule (o que sean
 * importados por AppModule) pueden inyectar 'REDIS_CLIENT' sin importar este
 * módulo individualmente.
 *
 * Usos en este proyecto:
 *  - LaMundialService: circuit breaker distribuido entre workers
 *  - TenantService: caché de API keys compartida entre workers
 *  - PolizaGuardianService: distributed lock para evitar ejecución duplicada del cron
 */
@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const client = new Redis({
          host: config.get<string>('redis.host') || 'localhost',
          port: config.get<number>('redis.port') || 6379,
          password: config.get<string>('redis.password') || undefined,
          db: config.get<number>('redis.db') || 0,
          maxRetriesPerRequest: 3,
          enableReadyCheck: false,
          lazyConnect: true,
          // Reconexión automática con backoff exponencial
          retryStrategy: (times: number) => {
            if (times > 10) return null; // dejar de reintentar tras 10 intentos
            return Math.min(times * 200, 3000);
          },
        });

        client.on('error', (err) => {
          // No lanzar — los servicios tienen fallback cuando Redis no está disponible
          if (err.message?.includes('ECONNREFUSED') || err.message?.includes('Connection is closed')) {
            // Errores de conexión esperados durante arranque/reinicio — silenciar en log
            return;
          }
          console.error('[Redis] Error de conexión:', err.message);
        });

        return client;
      },
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
