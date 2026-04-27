#!/usr/bin/env pwsh
# ============================================================
#   EXELIXI-API -- ASISTENTE DE CONFIGURACION INICIAL
#   Ejecutar una sola vez al descargar el repositorio.
#   Compatible con PowerShell 5.1 y PowerShell 7+
#   Uso: .\setup.ps1
# ============================================================

$ROOT     = $PSScriptRoot
$BACKEND  = "$ROOT\backend"
$FRONTEND = "$ROOT\frontend"

# ── Helpers ──────────────────────────────────────────────────
function Write-Banner {
  Write-Host ""
  Write-Host "  ============================================================" -ForegroundColor Blue
  Write-Host "        EXELIXI-API -- Asistente de Configuracion            " -ForegroundColor Blue
  Write-Host "        Modulo de Seguros RCV  |  ExelixiTech                " -ForegroundColor Blue
  Write-Host "  ============================================================" -ForegroundColor Blue
  Write-Host ""
}
function Write-Step  { param($n,$msg) Write-Host "`n  [$n] $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg)    Write-Host "  OK   $msg" -ForegroundColor Green }
function Write-Warn  { param($msg)    Write-Host "  (!   $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg)    Write-Host "  ERR  $msg" -ForegroundColor Red }
function Write-Info  { param($msg)    Write-Host "  -->  $msg" -ForegroundColor DarkGray }
function Ask-Input {
  param([string]$prompt, [string]$default = "")
  if ($default) { $label = "$prompt [$default]" } else { $label = $prompt }
  $v = Read-Host "  >> $label"
  if (-not $v -and $default) { return $default }
  return $v
}
function Ask-Secret {
  param([string]$prompt)
  $ss = Read-Host "  >> $prompt" -AsSecureString
  return [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss)
  )
}
function New-RandomSecret {
  return node -e "process.stdout.write(require('crypto').randomBytes(40).toString('hex'))" 2>&1
}

# ── Banner ────────────────────────────────────────────────────
Write-Banner

Write-Host "  Este asistente configurara todo lo necesario para ejecutar" -ForegroundColor DarkCyan
Write-Host "  Exelixi-API en tu servidor:" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "    1. PostgreSQL  -- conexion a la base de datos" -ForegroundColor DarkGray
Write-Host "    2. Redis       -- colas de trabajo y cache" -ForegroundColor DarkGray
Write-Host "    3. Seguridad   -- genera SESSION_SECRET y ADMIN_SECRET" -ForegroundColor DarkGray
Write-Host "    4. App         -- puerto, entorno, CORS" -ForegroundColor DarkGray
Write-Host "    5. Dependencias, tablas e inicio de servicios" -ForegroundColor DarkGray
Write-Host ""
$continuar = Ask-Input "Continuar? (s/n)" "s"
if ($continuar -notmatch "^[sS]") { Write-Host "  Cancelado." -ForegroundColor Yellow; exit 0 }

# ============================================================
# PASO 1 -- PostgreSQL
# ============================================================
Write-Step 1 "Configuracion de PostgreSQL"
Write-Host "  (Presiona Enter para usar el valor entre corchetes)" -ForegroundColor DarkGray
Write-Host ""

$DB_HOST = Ask-Input "Host de PostgreSQL"                 "localhost"
$DB_PORT = Ask-Input "Puerto de PostgreSQL"               "5432"
$DB_USER = Ask-Input "Usuario de PostgreSQL"              "exelixi"
$DB_PASS = Ask-Secret "Contrasena del usuario PostgreSQL"
$DB_NAME = Ask-Input "Nombre de la base de datos"         "exelixi_api_db"
$DB_POOL = Ask-Input "Tamano del pool de conexiones"      "50"

# ============================================================
# PASO 2 -- Redis
# ============================================================
Write-Step 2 "Configuracion de Redis"
Write-Host "  Redis se usa para colas de trabajo, reintentos de polizas y cache." -ForegroundColor DarkGray
Write-Host ""

$REDIS_HOST = Ask-Input "Host de Redis"   "localhost"
$REDIS_PORT = Ask-Input "Puerto de Redis" "6379"
$REDIS_PASS = Ask-Secret "Contrasena de Redis (vacio si no tiene)"

# Verificar si Redis esta corriendo
Write-Host ""
Write-Info "Verificando Redis en ${REDIS_HOST}:${REDIS_PORT}..."
$redisOK = $false
$redisCli = "C:\redis-portable\redis-cli.exe"
if (Test-Path $redisCli) {
  try {
    $ping = & $redisCli -h $REDIS_HOST -p $REDIS_PORT ping 2>&1
    if ($ping -eq "PONG") { $redisOK = $true; Write-OK "Redis respondiendo en $REDIS_HOST:$REDIS_PORT" }
  } catch { }
}
if (-not $redisOK) {
  Write-Warn "Redis no responde. Intentando iniciarlo..."
  $redisExe = "C:\redis-portable\redis-server.exe"
  if (Test-Path $redisExe) {
    Start-Process -FilePath $redisExe `
      -ArgumentList "--port $REDIS_PORT --save 60 1 --dir C:\redis-portable" `
      -WindowStyle Hidden
    Start-Sleep -Seconds 3
    if (Test-Path $redisCli) {
      $ping2 = & $redisCli -h $REDIS_HOST -p $REDIS_PORT ping 2>&1
      if ($ping2 -eq "PONG") { Write-OK "Redis iniciado correctamente"; $redisOK = $true }
    }
  }
  if (-not $redisOK) {
    Write-Warn "Redis no pudo iniciarse automaticamente."
    Write-Host "  Opciones:" -ForegroundColor DarkGray
    Write-Host "    - Windows portable: https://github.com/tporadowski/redis/releases" -ForegroundColor DarkGray
    Write-Host "    - Docker:           docker run -d -p 6379:6379 redis:7-alpine" -ForegroundColor DarkGray
    Write-Host ""
    $igRed = Ask-Input "Continuar sin Redis? (el sistema funciona pero sin colas) (s/n)" "s"
    if ($igRed -notmatch "^[sS]") { exit 1 }
  }
}

# ============================================================
# PASO 3 -- Seguridad (CRITICO)
# ============================================================
Write-Step 3 "Configuracion de Seguridad"
Write-Host ""
Write-Host "  SESSION_SECRET : firma los tokens de sesion (HMAC). Generado automaticamente." -ForegroundColor DarkGray
Write-Host "  ADMIN_SECRET   : protege las rutas /admin. GUARDALO EN LUGAR SEGURO." -ForegroundColor DarkGray
Write-Host ""

# Generar secretos automaticamente con Node.js
$GEN_SESSION = New-RandomSecret
$GEN_ADMIN   = New-RandomSecret

Write-Host "  Secretos generados automaticamente (64 caracteres hex cada uno)." -ForegroundColor DarkGray
Write-Host "  Puedes aceptarlos o ingresar los tuyos propios." -ForegroundColor DarkGray
Write-Host ""

$SESSION_SECRET_IN = Ask-Input "SESSION_SECRET (Enter = usar generado)" ""
if (-not $SESSION_SECRET_In) { $SESSION_SECRET_In = $GEN_SESSION }

$ADMIN_SECRET_In = Ask-Input "ADMIN_SECRET   (Enter = usar generado)" ""
if (-not $ADMIN_SECRET_In) { $ADMIN_SECRET_In = $GEN_ADMIN }

$SESSION_TTL = Ask-Input "Duracion de sesion en horas" "8"

# ============================================================
# PASO 4 -- Parametros de la aplicacion
# ============================================================
Write-Step 4 "Parametros de la aplicacion"
Write-Host ""

$APP_PORT = Ask-Input "Puerto del backend"                            "3000"
$APP_ENV  = Ask-Input "Entorno (development/production/staging)"      "development"

Write-Host ""
Write-Host "  CORS_ORIGINS: URLs desde donde el navegador puede llamar al backend." -ForegroundColor DarkGray
Write-Host "  En produccion agrega la URL publica de tu frontend." -ForegroundColor DarkGray
$CORS = Ask-Input "Origenes CORS (separados por coma)" "http://localhost:5173"

Write-Host ""
Write-Host "  Webhook externo: URL donde tu plataforma recibe notificaciones de viajes." -ForegroundColor DarkGray
$WH_URL = Ask-Input "URL Webhook externo (Enter para omitir)" ""
$WH_SEC = ""
if ($WH_URL) { $WH_SEC = Ask-Secret "Secret HMAC del webhook" }

# ============================================================
# PASO 5 -- Generar .env
# ============================================================
Write-Step 5 "Generando archivo backend/.env"

$NOW = Get-Date -Format "yyyy-MM-dd HH:mm"

$ENV_CONTENT = "# ── Generado por setup.ps1 el $NOW ──────────────────────────────
# IMPORTANTE: No subas este archivo a control de versiones (.gitignore ya lo excluye)

NODE_ENV=$APP_ENV
PORT=$APP_PORT
APP_PREFIX=api
CORS_ORIGINS=$CORS

# ── Seguridad ──────────────────────────────────────────────────────────────
# SESSION_SECRET: firma HMAC de los tokens de sesion. Cambiar en produccion.
SESSION_SECRET=$SESSION_SECRET_In
SESSION_TTL_HOURS=$SESSION_TTL
# ADMIN_SECRET: protege POST/GET /api/admin/tenants.
# Usa este valor en el campo 'Admin Key' del panel web.
ADMIN_SECRET=$ADMIN_SECRET_In

# ── PostgreSQL ─────────────────────────────────────────────────────────────
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_USERNAME=$DB_USER
DB_PASSWORD=$DB_PASS
DB_NAME=$DB_NAME
DB_POOL_SIZE=$DB_POOL
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=10000

# ── Redis ──────────────────────────────────────────────────────────────────
REDIS_HOST=$REDIS_HOST
REDIS_PORT=$REDIS_PORT
REDIS_PASSWORD=$REDIS_PASS
REDIS_DB=0

# ── Webhook externo ────────────────────────────────────────────────────────
EXTERNAL_WEBHOOK_URL=$WH_URL
EXTERNAL_WEBHOOK_SECRET=$WH_SEC
EXTERNAL_WEBHOOK_TIMEOUT=10000
EXTERNAL_WEBHOOK_RETRIES=3

# ── Rate limiting ──────────────────────────────────────────────────────────
THROTTLE_TTL=60000
THROTTLE_LIMIT=100000

# ── Logs ───────────────────────────────────────────────────────────────────
LOG_LEVEL=info
LOG_DIR=logs

# ── Cola de trabajos BullMQ ────────────────────────────────────────────────
QUEUE_CONCURRENCY=10
QUEUE_MAX_JOBS=10000
"

[System.IO.File]::WriteAllText("$BACKEND\.env", $ENV_CONTENT, [System.Text.Encoding]::UTF8)
Write-OK ".env generado en backend/.env"

# ============================================================
# PASO 6 -- Verificar prerequisitos
# ============================================================
Write-Step 6 "Verificando prerequisitos"

try   { $nodeVer = node --version 2>&1; Write-OK "Node.js $nodeVer" }
catch { Write-Err "Node.js no instalado. Descarga desde https://nodejs.org"; exit 1 }

try   { $npmVer = npm --version 2>&1; Write-OK "npm v$npmVer" }
catch { Write-Err "npm no encontrado"; exit 1 }

$PSQL = $null
$PSQL_PATHS = @(
  "C:\Program Files\PostgreSQL\18\bin\psql.exe",
  "C:\Program Files\PostgreSQL\17\bin\psql.exe",
  "C:\Program Files\PostgreSQL\16\bin\psql.exe",
  "C:\Program Files\PostgreSQL\15\bin\psql.exe",
  "psql"
)
foreach ($p in $PSQL_PATHS) {
  if (Get-Command $p -ErrorAction SilentlyContinue) { $PSQL = $p; break }
  if (Test-Path   $p -ErrorAction SilentlyContinue) { $PSQL = $p; break }
}
if ($PSQL) { Write-OK "psql encontrado: $PSQL" }
else       { Write-Warn "psql no encontrado -- la BD debe existir ya creada manualmente" }

# ============================================================
# PASO 7 -- Crear base de datos
# ============================================================
Write-Step 7 "Preparando base de datos"

if ($PSQL) {
  $POSTGRES_PASS = Ask-Secret "Contrasena del superusuario 'postgres'"
  $env:PGPASSWORD = $POSTGRES_PASS

  $SQL = @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';
  ELSE
    ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASS';
  END IF;
END
`$`$;
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')`gexec
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
"@

  $result = $SQL | & $PSQL -h $DB_HOST -p $DB_PORT -U postgres 2>&1
  $env:PGPASSWORD = ""

  if ($LASTEXITCODE -eq 0) { Write-OK "Base de datos '$DB_NAME' lista" }
  else {
    Write-Warn "Advertencia al preparar la BD (puede que ya existiera):"
    $result | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  }
} else {
  Write-Warn "Crea manualmente la BD '$DB_NAME' con usuario '$DB_USER' y luego presiona Enter."
  Read-Host "  >> Presiona Enter cuando la base de datos este lista"
}

# ============================================================
# PASO 8 -- Instalar dependencias
# ============================================================
Write-Step 8 "Instalando dependencias"
Write-Host "  Backend..." -ForegroundColor DarkGray
Set-Location $BACKEND
npm install --silent 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Err "Error en npm install del backend"; exit 1 }
Write-OK "Dependencias del backend instaladas"

Write-Host "  Frontend..." -ForegroundColor DarkGray
Set-Location $FRONTEND
npm install --silent 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Err "Error en npm install del frontend"; exit 1 }
Write-OK "Dependencias del frontend instaladas"

# ============================================================
# PASO 9 -- Sincronizar tablas (arranque rapido del backend)
# ============================================================
Write-Step 9 "Creando tablas en la base de datos via TypeORM"
Write-Host "  Iniciando backend brevemente para sincronizar el esquema..." -ForegroundColor DarkGray

Set-Location $BACKEND
$syncJob = Start-Job -ScriptBlock {
  param($p) Set-Location $p; npm run start:dev 2>&1
} -ArgumentList $BACKEND

$syncOk = $false
for ($i = 0; $i -lt 35; $i++) {
  Start-Sleep -Seconds 2
  $out = Receive-Job $syncJob 2>&1
  if ($out -match "Nest application successfully started") { $syncOk = $true; break }
  if ($out -match "ECONNREFUSED|password authentication failed|does not exist") {
    Write-Err "Error de conexion a la base de datos:"
    Write-Host ($out -join "`n") -ForegroundColor Red
    Stop-Job $syncJob; Remove-Job $syncJob -Force 2>&1 | Out-Null
    exit 1
  }
}
Stop-Job  $syncJob
Remove-Job $syncJob -Force 2>&1 | Out-Null
# Matar el proceso de sincronizacion
$conn = Get-NetTCPConnection -LocalPort ([int]$APP_PORT) -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue }

if ($syncOk) { Write-OK "Tablas creadas: tenants, viajes, vehiculos" }
else         { Write-Warn "No se confirmo sincronizacion -- revisa logs al iniciar" }

# ============================================================
# PASO 10 -- Iniciar servicios
# ============================================================
Write-Step 10 "Iniciar servicios ahora?"
Write-Host ""
$iniciar = Ask-Input "Levantar backend y frontend (s/n)" "s"

Set-Location $ROOT

if ($iniciar -match "^[sS]") {
  foreach ($port in @([int]$APP_PORT, 5173)) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
  }
  Start-Process "powershell" `
    -ArgumentList "-NoProfile", "-Command", "Set-Location '$BACKEND'; npm run start:dev" `
    -PassThru | Out-Null
  Start-Sleep -Seconds 12
  Start-Process "powershell" `
    -ArgumentList "-NoProfile", "-Command", "Set-Location '$FRONTEND'; npm run dev" `
    -PassThru | Out-Null
  Write-OK "Servicios iniciados"
}

# ============================================================
# RESUMEN FINAL
# ============================================================
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "    EXELIXI-API CONFIGURADO EXITOSAMENTE" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "  Frontend :  http://localhost:5173" -ForegroundColor Green
Write-Host "  Backend  :  http://localhost:$APP_PORT/api" -ForegroundColor Green
Write-Host "  Swagger  :  http://localhost:$APP_PORT/api/docs" -ForegroundColor Green
Write-Host "  Health   :  http://localhost:$APP_PORT/api/health" -ForegroundColor Green
Write-Host "  Config   :  backend\.env" -ForegroundColor Green
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Yellow
Write-Host "  ADMIN_SECRET (guarda esto en lugar seguro):" -ForegroundColor Yellow
Write-Host "  $ADMIN_SECRET_In" -ForegroundColor White
Write-Host "  ============================================================" -ForegroundColor Yellow
Write-Host "  Usalo en el campo 'Admin Key' del panel web para crear" -ForegroundColor Yellow
Write-Host "  los primeros clientes." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Para iniciar en el futuro :  .\start-dev.ps1" -ForegroundColor DarkGray
Write-Host "  Para detener              :  .\stop.ps1" -ForegroundColor DarkGray
Write-Host ""
