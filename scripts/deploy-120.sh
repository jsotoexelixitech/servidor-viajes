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

  if [ -z "${REDIS_PASS:-}" ]; then
    REDIS_PASS=$(grep -h -E '^REDIS_PASSWORD=.+' "$HOME"/*/.env "$HOME"/exelixi/*/.env \
      "$HOME"/exelixi/*/server/.env "$HOME"/exelixi/*/backend/.env 2>/dev/null \
      | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
  fi
  if [ -z "${REDIS_PASS:-}" ]; then
    echo "✖ No encontré la clave de Redis. Ejecuta: REDIS_PASS='la_clave' bash scripts/deploy-120.sh"
    exit 1
  fi
  if ! redis-cli -a "$REDIS_PASS" --no-auth-warning ping | grep -q PONG; then
    echo "✖ La clave de Redis encontrada no funciona. Ejecuta: REDIS_PASS='la_clave' bash scripts/deploy-120.sh"
    exit 1
  fi

  umask 077
  cat > "$ENVF" <<EOF
NODE_ENV=production
PORT=$PORT
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
REDIS_PORT=6379
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

# ── 2. Backend ─────────────────────────────────────────────────────────────
echo "▶ Backend: npm ci + build"
cd "$ROOT/backend"
npm ci --legacy-peer-deps --no-audit --no-fund --loglevel=error
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
npm ci --legacy-peer-deps --no-audit --no-fund --loglevel=error
npm run build

# ── 4. PM2 (un proceso: API + pantalla) ────────────────────────────────────
echo "▶ PM2"
cd "$ROOT/backend"
set -a; . ./.env; set +a
if pm2 describe "$APP" > /dev/null 2>&1; then
  pm2 restart "$APP" --update-env
else
  pm2 start dist/main.js --name "$APP" --time
fi
pm2 save > /dev/null

sleep 6
echo "▶ Salud: http://127.0.0.1:$PORT/api/health"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" "http://127.0.0.1:$PORT/api/health" || true
echo "✔ Abrir: http://192.168.8.120:$PORT/"
