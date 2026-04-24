import * as os from 'os';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cluster = require('cluster') as any;


async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    bufferLogs: true,
    // Aumentar límite de listeners para alta concurrencia
    abortOnError: false,
  });

  const configService = app.get(ConfigService);
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  const port = configService.get<number>('app.port');
  const prefix = configService.get<string>('app.prefix');
  const nodeEnv = configService.get<string>('app.nodeEnv');
  const corsOrigins = configService.get<string[]>('app.corsOrigins');

  // ── Seguridad ──────────────────────────────────────────────────────────────
  app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: nodeEnv === 'production' }));
  app.use(compression());
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'X-Idempotency-Key'],
    credentials: true,
  });

  // ── Prefijo y validación ───────────────────────────────────────────────────
  app.setGlobalPrefix(prefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      stopAtFirstError: false,
    }),
  );

  // ── Swagger (solo en no-producción) ───────────────────────────────────────
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Ridery Backend API')
      .setDescription(
        'API REST multitenant para gestión de viajes con emisión de pólizas RCV.\n\n' +
        '**Autenticación:** Header `X-Api-Key: <tu_api_key>`\n\n' +
        '**Idempotencia:** Envía `X-Idempotency-Key: <uuid>` para prevenir duplicados.',
      )
      .setVersion('1.0')
      .addApiKey({ type: 'apiKey', name: 'X-Api-Key', in: 'header' }, 'X-Api-Key')
      .addTag('Viajes', 'Inicio, finalización y gestión de viajes + emisión de pólizas')
      .addTag('Mi Tenant (Configuración)', 'Configuración de seguro y mapeo de campos')
      .addTag('Tenants (Admin)', 'Administración de tenants')
      .addTag('Health', 'Health checks del sistema')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${prefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    });
    app.getHttpAdapter().get(`/${prefix}/docs-json`, (_req, res) => res.json(document));
  }

  // ── Keep-alive y timeouts para alta concurrencia ───────────────────────────
  const server = await app.listen(port, '0.0.0.0');
  server.keepAliveTimeout = 65_000;     // mayor que el de los load balancers (60s)
  server.headersTimeout = 66_000;       // debe ser > keepAliveTimeout
  server.maxConnections = 100_000;      // soportar 100k conexiones simultáneas

  app.enableShutdownHooks();

  const appLogger = new Logger('Bootstrap');
  appLogger.log(`🚀 Ridery Backend en http://0.0.0.0:${port}/${prefix} [PID ${process.pid}]`);
  if (nodeEnv !== 'production') {
    appLogger.log(`📚 Swagger: http://localhost:${port}/${prefix}/docs`);
  }
}

// ── Clustering automático ─────────────────────────────────────────────────────
// Activado por: NODE_ENV=production  o  CLUSTER_WORKERS=N (N > 1)
// En desarrollo usa 1 proceso para facilitar hot-reload y debugging.
// En producción lanza 1 worker por CPU y reinicia automáticamente caídas.
//
// Para forzar N workers en cualquier ambiente:  CLUSTER_WORKERS=4 npm run start:dev
const requestedWorkers = parseInt(process.env.CLUSTER_WORKERS ?? '0', 10);
const isProduction     = process.env.NODE_ENV === 'production';
const numWorkers       = requestedWorkers > 1 ? requestedWorkers
                       : isProduction          ? os.cpus().length
                       : 1;

if (numWorkers > 1 && cluster.isPrimary) {
  const logger = new Logger('Cluster');
  logger.log(`⚡ Primary PID ${process.pid} — CPUs disponibles: ${os.cpus().length} — Lanzando ${numWorkers} workers`);

  for (let i = 0; i < numWorkers; i++) cluster.fork();

  // Reinicio automático de workers caídos (auto-heal)
  cluster.on('exit', (worker: any, code: number, signal: string) => {
    logger.error(`Worker PID ${worker.process.pid} murió (${signal ?? code}) — reiniciando automáticamente...`);
    cluster.fork();
  });

  // Estadísticas periódicas cada 5 minutos en producción
  if (isProduction) {
    setInterval(() => {
      const workers = Object.values(cluster.workers ?? {}).length;
      logger.log(`Cluster health: ${workers}/${numWorkers} workers activos`);
    }, 300_000);
  }
} else {
  bootstrap()
    .then(() => {
      // Señal de "listo" para PM2 wait_ready
      if (process.send) process.send('ready');
    })
    .catch(err => {
      console.error('Error fatal al iniciar:', err);
      process.exit(1);
    });
}
