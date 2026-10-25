#!/usr/bin/env bash
# Despliegue de servidor-viajes (flota por uso / Ridery) en el 120 (srv001).
# Primer despliegue y actualizaciones:  bash scripts/deploy-120.sh
# Variables opcionales: PORT_VIAJES (3096), REDIS_PASS (si no se encuentra sola), NX_ENV (~/nexus-api/.env)
set -euo pipefail

[ "$(hostname)" = "srv001" ] || { echo "✖ ESTE NO ES EL 120 ($(hostname))"; exit 1; }

APP=servidor-viajes
PORT="${PORT_VIAJES:-3096}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENVF="$ROOT/backend/.env"
NX_ENV="${NX_ENV:-$HOME/nexus-api/.env}"

cd "$ROOT"
echo "▶ git pull --ff-only ($(git branch --show-current))"
git pull --ff-only

# ── 1. .env (solo la primera vez; después se respeta el existente) ─────────
if [ ! -f "$ENVF" ]; then
  echo "▶ Creando backend/.env con la BD de Nexus del 120 (esquema propio 'flota')"
  [ -f "$NX_ENV" ] || { echo "✖ No existe $NX_ENV"; exit 1; }
  DBURL=$(grep '^DATABASE_URL=' "$NX_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | sed 's/?.*//')
  REST=${DBURL#*://}
  USERPASS=${REST%%@*}; HOSTPORTDB=${REST#*@}
  DB_USER=${USERPASS%%:*}; DB_PASS=${USERPASS#*:}
  DB_PASS=$(printf '%b' "${DB_PASS//%/\\x}")          # decodifica %xx si la clave viene codificada
  HOSTPORT=${HOSTPORTDB%%/*}; DB_NAME=${HOSTPORTDB#*/}
  DB_HOST=${HOSTPORT%%:*}; DB_PORT=${HOSTPORT##*:}
  [ "$DB_PORT" = "$HOSTPORT" ] && DB_PORT=5432

  # Candidatas: redis.conf (si es legible) y los .env* de los otros proyectos (REDIS_PASSWORD/PASS/AUTH o REDIS_URL
  # con clave). Se usa la primera que responda PONG; nunca se imprime.
  buscar_redis_pass() {
    {
      [ -r /etc/redis/redis.conf ] && grep -E '^[[:space:]]*requirepass[[:space:]]+' /etc/redis/redis.conf | awk '{print $2}'
      find "$HOME" -maxdepth 4 -name node_modules -prune -o -type f -name '.env*' -print 2>/dev/null | while read -r f; do
        grep -hE '^(REDIS_PASSWORD|REDIS_PASS|REDIS_AUTH)=.+' "$f" | cut -d= -f2-
        grep -hoE '^REDIS_URL=rediss?://[^@]*@' "$f" | sed -E 's#^REDIS_URL=rediss?://[^:]*:##; s#@$##'
      done
    } 2>/dev/null | tr -d "\"'\r" | awk 'NF' | sort -u | while read -r c; do
      if redis-cli -a "$c" --no-auth-warning ping 2>/dev/null | grep -q PONG; then echo "$c"; break; fi
    done
  }
  # Sin clave del Redis del sistema: Redis propio del usuario (127.0.0.1:6380, pm2 'redis-viajes'), sin sudo.
  redis_propio() {
    local dir="$HOME/.redis-viajes" conf="$HOME/.redis-viajes/redis.conf"
    command -v redis-server > /dev/null || return 1
    mkdir -p "$dir"; chmod 700 "$dir"
    if [ ! -f "$conf" ]; then
      ( umask 077; printf 'port 6380\nbind 127.0.0.1\nprotected-mode yes\nrequirepass %s\ndir %s\nappendonly yes\ndaemonize no\n' \
        "$(openssl rand -hex 24)" "$dir" > "$conf" )
    fi
    pm2 describe redis-viajes > /dev/null 2>&1 || pm2 start "$(command -v redis-server)" --name redis-viajes -- "$conf" > /dev/null
    sleep 2
    awk '/^requirepass/{print $2}' "$conf"
  }
  REDIS_PORT_USE=6379
  if [ -z "${REDIS_PASS:-}" ]; then
    REDIS_PASS=$(buscar_redis_pass || true)
    [ -n "$REDIS_PASS" ] && echo "  Clave de Redis encontrada y verificada (PONG)."
  fi
  if [ -z "${REDIS_PASS:-}" ]; then
    echo "  Sin clave del Redis del sistema → Redis propio en 127.0.0.1:6380 (pm2 redis-viajes)"
    REDIS_PASS=$(redis_propio || true)
    REDIS_PORT_USE=6380
  fi
  if [ -z "${REDIS_PASS:-}" ]; then
    echo "✖ No hay clave de Redis ni redis-server disponible. Ejecuta: REDIS_PASS='la_clave' bash scripts/deploy-120.sh"
    exit 1
  fi
  if ! redis-cli -p "$REDIS_PORT_USE" -a "$REDIS_PASS" --no-auth-warning ping | grep -q PONG; then
    echo "✖ Redis en el puerto $REDIS_PORT_USE no responde con esa clave (ver: pm2 logs redis-viajes)."
    exit 1
  fi

  umask 077
  cat > "$ENVF" <<EOF
NODE_ENV=production
PORT=$PORT
CLUSTER_WORKERS=1
APP_PREFIX=api
CORS_ORIGINS=http://192.168.8.120:$PORT,http://localhost:$PORT
SESSION_SECRET=$(openssl rand -hex 32)
SESSION_TTL_HOURS=8
ADMIN_SECRET=$(openssl rand -hex 24)
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_USERNAME=$DB_USER
DB_PASSWORD=$DB_PASS
DB_NAME=$DB_NAME
DB_SCHEMA=flota
DB_SYNCHRONIZE=true
DB_POOL_SIZE=10
REDIS_HOST=127.0.0.1
REDIS_PORT=$REDIS_PORT_USE
REDIS_PASSWORD=$REDIS_PASS
REDIS_DB=5
LOG_LEVEL=info
LOG_DIR=logs
FLOTA_CNPOLIZA_DEFAULT=18-1-1130480881
FLOTA_CPLAN_DEFAULT=LARA
FLOTA_RECIBO_REAL=0
NEST_API_URL=http://127.0.0.1:3002
NEST_API_KEY=
EOF
  echo "  .env creado (permisos 600). ADMIN_SECRET para 'Nuevo Cliente': grep ADMIN_SECRET backend/.env"
fi

# Servidor compartido: un solo proceso, sin cluster (también en .env creados antes de este ajuste).
grep -q '^CLUSTER_WORKERS=' "$ENVF" || echo 'CLUSTER_WORKERS=1' >> "$ENVF"

# ── 2. Backend ─────────────────────────────────────────────────────────────
echo "▶ Backend: npm ci + build"
cd "$ROOT/backend"
npm ci --include=dev --legacy-peer-deps --no-audit --no-fund --loglevel=error
npm run build

# Esquema propio en la BD compartida (idempotente).
set -a; . ./.env; set +a
if [ -n "${DB_SCHEMA:-}" ]; then
  echo "▶ CREATE SCHEMA IF NOT EXISTS $DB_SCHEMA"
  node -e "
    const { Client } = require('pg');
    const c = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
    c.connect().then(() => c.query('CREATE SCHEMA IF NOT EXISTS ' + process.env.DB_SCHEMA))
      .then(() => { console.log('  esquema OK'); return c.end(); })
      .catch((e) => { console.error('  ✖', e.message); process.exit(1); });"
fi

# ── 3. Frontend (lo sirve el backend desde frontend/dist) ──────────────────
echo "▶ Frontend: npm ci + build"
cd "$ROOT/frontend"
unset VITE_API_URL
npm ci --include=dev --legacy-peer-deps --no-audit --no-fund --loglevel=error
npm run build

# ── 4. PM2 (un proceso: API + pantalla) ────────────────────────────────────
echo "▶ PM2"
cd "$ROOT/backend"
set -a; . ./.env; set +a
# Se recrea para aplicar el tope de reinicios: si algo falla no queda en bucle consumiendo CPU.
pm2 delete "$APP" > /dev/null 2>&1 || true
pkill -f "$ROOT/backend/dist/main.js" > /dev/null 2>&1 || true
pm2 start dist/main.js --name "$APP" --time --max-restarts 5 --exp-backoff-restart-delay 2000
pm2 save > /dev/null

echo "▶ Salud: http://127.0.0.1:$PORT/api/health (espera hasta 40 s)"
CODE=000
for i in $(seq 1 20); do
  sleep 2
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/health" || true)
  [ "$CODE" = "000" ] || break
done
echo "  HTTP $CODE"
if [ "$CODE" = "000" ]; then
  pm2 stop "$APP" > /dev/null; pm2 save > /dev/null
  echo "  ✖ No responde; lo detuve para no consumir CPU. Ver: pm2 logs $APP --lines 60 --nostream"
  exit 1
fi
echo "✔ Abrir: http://192.168.8.120:$PORT/"
