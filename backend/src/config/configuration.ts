import * as os from 'os';

export default () => {
  // Calcular número de workers del cluster para dimensionar el pool correctamente.
  // max_connections PostgreSQL = workers × poolSize + headroom (20)
  // Con DB_POOL_SIZE=10 y 8 CPUs: 8×10 + 20 = 100 conexiones (límite por defecto de PG)
  const requestedWorkers = parseInt(process.env.CLUSTER_WORKERS ?? '0', 10);
  const isProduction = process.env.NODE_ENV === 'production';
  const numWorkers = requestedWorkers > 1 ? requestedWorkers : isProduction ? os.cpus().length : 1;

  // Calcular pool seguro: (max_connections_pg - headroom) / workers
  // max_connections_pg se configura en docker-compose; default PG = 100
  const pgMaxConnections = parseInt(process.env.PG_MAX_CONNECTIONS ?? '200', 10);
  const pgHeadroom = 20; // conexiones reservadas para psql, health checks, admin
  const safePoolSize = Math.max(
    5,
    Math.floor((pgMaxConnections - pgHeadroom) / numWorkers),
  );
  // DB_POOL_SIZE anula el cálculo automático si se configura explícitamente
  const poolSize = process.env.DB_POOL_SIZE
    ? parseInt(process.env.DB_POOL_SIZE, 10)
    : safePoolSize;

  return {
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3000,
    prefix: process.env.APP_PREFIX || 'api',
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
  },
  cluster: {
    workers: numWorkers,
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    username: process.env.DB_USERNAME || 'ridery',
    password: process.env.DB_PASSWORD || 'ridery_password',
    name: process.env.DB_NAME || 'ridery_db',
    poolSize,
    poolIdleTimeout: parseInt(process.env.DB_POOL_IDLE_TIMEOUT, 10) || 10000,
    poolConnectionTimeout: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT, 10) || 5000,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
  },
  webhook: {
    url: process.env.EXTERNAL_WEBHOOK_URL || '',
    secret: process.env.EXTERNAL_WEBHOOK_SECRET || '',
    timeout: parseInt(process.env.EXTERNAL_WEBHOOK_TIMEOUT, 10) || 10000,
    retries: parseInt(process.env.EXTERNAL_WEBHOOK_RETRIES, 10) || 3,
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL, 10) || 60000,
    limit: parseInt(process.env.THROTTLE_LIMIT, 10) || 1000,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || 'logs',
  },
  queue: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY, 10) || 50,
    maxJobs: parseInt(process.env.QUEUE_MAX_JOBS, 10) || 100000,
  },
  };
};
