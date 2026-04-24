/**
 * ecosystem.config.js — Configuración de producción PM2
 *
 * Uso:
 *   pm2 start ecosystem.config.js           → arranca en modo cluster
 *   pm2 start ecosystem.config.js --env production
 *   pm2 save && pm2 startup                 → persistir entre reinicios
 *   pm2 monit                               → monitor en tiempo real
 *   pm2 reload exelixi-api               → reinicio sin downtime (0-downtime deploy)
 */

const os = require('os');
const cpus = os.cpus().length;

module.exports = {
  apps: [
    {
      name: 'exelixi-api',
      script: 'dist/main.js',
      cwd: './backend',

      // ── Clustering ──────────────────────────────────────────────────────
      instances: cpus,          // 1 worker por CPU (e.g. 8 en un servidor típico)
      exec_mode: 'cluster',     // Node.js cluster: comparte el puerto entre workers

      // ── Memoria y reinicio automático ───────────────────────────────────
      max_memory_restart: '1G', // reiniciar worker si supera 1 GB de RAM
      restart_delay:      2000, // esperar 2s antes de reiniciar tras caída
      max_restarts:       10,   // máx. 10 reinicios en la ventana exp_backoff_restart_delay
      min_uptime:         '10s',// considerar "estable" si dura >10s

      // ── Logs ────────────────────────────────────────────────────────────
      log_date_format:    'YYYY-MM-DD HH:mm:ss',
      error_file:         './backend/logs/pm2-error.log',
      out_file:           './backend/logs/pm2-out.log',
      merge_logs:         true,

      // ── Variables de entorno por ambiente ───────────────────────────────
      env: {
        NODE_ENV: 'development',
        PORT:     3000,
      },
      env_production: {
        NODE_ENV:        'production',
        PORT:            3000,
        // En producción las variables sensibles deben venir del sistema (secrets manager)
        // o de un .env.production nunca versionado en git.
      },

      // ── Graceful shutdown ───────────────────────────────────────────────
      kill_timeout:   5000,    // esperar 5s para que los requests en curso terminen
      listen_timeout: 10000,   // timeout para que el proceso confirme que escucha
      wait_ready:     true,    // esperar señal process.send('ready') antes de marcar OK

      // ── Salud ───────────────────────────────────────────────────────────
      health_check_grace_period: 3000,
    },
  ],

  deploy: {
    production: {
      user:         'deploy',
      host:         'tu-servidor-produccion.com',
      ref:          'origin/main',
      repo:         'git@github.com:tu-org/exelixi-api.git',
      path:         '/var/www/exelixi-api',
      'pre-deploy-local': '',
      'post-deploy': [
        'cd backend && npm ci --production',
        'npm run build',
        'pm2 reload ecosystem.config.js --env production',
      ].join(' && '),
      'pre-setup': 'apt-get install -y git',
    },
  },
};
