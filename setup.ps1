#!/usr/bin/env pwsh
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║              EXELIXI-API — SETUP DE SERVIDOR DE PRUEBAS                ║
# ║  Ejecutar una sola vez al descargar el repositorio                     ║
# ║  Uso:  .\setup.ps1                                                     ║
# ╚══════════════════════════════════════════════════════════════════════════╝

$ROOT    = $PSScriptRoot
$BACKEND = "$ROOT\backend"
$FRONTEND= "$ROOT\frontend"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Banner {
  Write-Host ""
  Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Blue
  Write-Host "  ║          EXELIXI-API — Asistente de Configuración       ║" -ForegroundColor Blue
  Write-Host "  ║          Módulo de Seguros RCV · ExelixiTech            ║" -ForegroundColor Blue
  Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Blue
  Write-Host ""
}
function Write-Step  { param($n,$msg) Write-Host "`n  [$n] $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg)    Write-Host "  ✔  $msg"    -ForegroundColor Green }
function Write-Warn  { param($msg)    Write-Host "  ⚠  $msg"    -ForegroundColor Yellow }
function Write-Err   { param($msg)    Write-Host "  ✖  $msg"    -ForegroundColor Red }
function Ask-Input {
  param([string]$prompt, [string]$default = "")
  if ($default) { $label = "$prompt [$default]" } else { $label = $prompt }
  $v = Read-Host "  → $label"
  if (-not $v -and $default) { return $default }
  return $v
}
function Ask-Secret {
  param([string]$prompt)
  $ss = Read-Host "  → $prompt" -AsSecureString
  return [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss)
  )
}

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Banner

Write-Host "  Este asistente configurará todo lo necesario para ejecutar" -ForegroundColor DarkCyan
Write-Host "  el módulo Exelixi-API en un servidor de pruebas:" -ForegroundColor DarkCyan
Write-Host "  · Creará el archivo .env con tus parámetros" -ForegroundColor DarkCyan
Write-Host "  · Instalará dependencias de backend y frontend" -ForegroundColor DarkCyan
Write-Host "  · Creará la base de datos y todas las tablas automáticamente" -ForegroundColor DarkCyan
Write-Host "  · Verificará la conexión a Redis" -ForegroundColor DarkCyan
Write-Host "  · Levantará los servicios" -ForegroundColor DarkCyan
Write-Host ""

# ══════════════════════════════════════════════════════════════════════════════
# PASO 1 — Recolectar configuración de base de datos
# ══════════════════════════════════════════════════════════════════════════════
Write-Step 1 "Configuración de PostgreSQL"
Write-Host "  (Presiona Enter para usar el valor entre corchetes)" -ForegroundColor DarkGray
Write-Host ""

$DB_HOST = Ask-Input "Host de PostgreSQL"       "localhost"
$DB_PORT = Ask-Input "Puerto de PostgreSQL"      "5432"
$DB_USER = Ask-Input "Usuario de PostgreSQL"     "exelixi"
$DB_PASS = Ask-Secret "Contraseña del usuario"
$DB_NAME = Ask-Input "Nombre de la base de datos" "exelixi_api_db"
$DB_POOL = Ask-Input "Tamaño del pool de conexiones" "50"

# ══════════════════════════════════════════════════════════════════════════════
# PASO 2 — Configuración de Redis
# ══════════════════════════════════════════════════════════════════════════════
Write-Step 2 "Configuración de Redis"
Write-Host "  (Redis se usa para colas de trabajo y circuit breaker)" -ForegroundColor DarkGray
Write-Host ""

$REDIS_HOST = Ask-Input "Host de Redis"    "localhost"
$REDIS_PORT = Ask-Input "Puerto de Redis"  "6379"
$REDIS_PASS = Ask-Secret "Contraseña de Redis (dejar vacío si no tiene)"

# ══════════════════════════════════════════════════════════════════════════════
# PASO 3 — Parámetros de la aplicación
# ══════════════════════════════════════════════════════════════════════════════
Write-Step 3 "Parámetros de la aplicación"
Write-Host ""

$APP_PORT = Ask-Input "Puerto del backend"   "3000"
$APP_ENV  = Ask-Input "Entorno (development/production/staging)" "development"
$CORS     = Ask-Input "Orígenes CORS permitidos (separados por coma)" "http://localhost:5173"

Write-Host ""
Write-Host "  ¿Tienes una URL de webhook externo donde enviar los datos de viajes?" -ForegroundColor DarkGray
$WH_URL  = Ask-Input "URL Webhook externo (Enter para omitir)" ""
$WH_SEC  = ""
if ($WH_URL) { $WH_SEC = Ask-Secret "Secret del webhook" }

# ══════════════════════════════════════════════════════════════════════════════
# PASO 4 — Escribir .env
# ══════════════════════════════════════════════════════════════════════════════
Write-Step 4 "Generando archivo .env"

$ENV_CONTENT = @"
# ─── Generado por setup.ps1 · $(Get-Date -Format 'yyyy-MM-dd HH:mm') ───
# IMPORTANTE: No subas este archivo a control de versiones

# Aplicación
NODE_ENV=$APP_ENV
PORT=$APP_PORT
APP_PREFIX=api
CORS_ORIGINS=$CORS

# PostgreSQL
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_USERNAME=$DB_USER
DB_PASSWORD=$DB_PASS
DB_NAME=$DB_NAME
DB_POOL_SIZE=$DB_POOL
DB_POOL_IDLE_TIMEOUT=30000
DB_POOL_CONNECTION_TIMEOUT=10000

# Redis
REDIS_HOST=$REDIS_HOST
REDIS_PORT=$REDIS_PORT
REDIS_PASSWORD=$REDIS_PASS
REDIS_DB=0

# Webhook externo
EXTERNAL_WEBHOOK_URL=$WH_URL
EXTERNAL_WEBHOOK_SECRET=$WH_SEC
EXTERNAL_WEBHOOK_TIMEOUT=10000
EXTERNAL_WEBHOOK_RETRIES=3

# Rate limiting
THROTTLE_TTL=60000
THROTTLE_LIMIT=100000

# Logging
LOG_LEVEL=info
LOG_DIR=logs

# Cola de trabajos
QUEUE_CONCURRENCY=10
QUEUE_MAX_JOBS=10000
"@

$ENV_CONTENT | Out-File -FilePath "$BACKEND\.env" -Encoding UTF8 -NoNewline
Write-OK ".env generado en backend/.env"

# ══════════════════════════════════════════════════════════════════════════════
# PASO 5 — Verificar prerequisitos
# ══════════════════════════════════════════════════════════════════════════════
Write-Step 5 "Verificando prerequisitos"

# Node.js
try {
  $nodeVer = node --version 2>&1
  Write-OK "Node.js $nodeVer encontrado"
} catch {
  Write-Err "Node.js no está instalado. Descarga desde https://nodejs.org"
  exit 1
}

# npm
try {
  $npmVer = npm --version 2>&1
  Write-OK "npm v$npmVer encontrado"
} catch {
  Write-Err "npm no encontrado"
  exit 1
}

# psql (opcional — para crear DB automáticamente)
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
  if (Test-Path $p) { $PSQL = $p; break }
}
if ($PSQL) { Write-OK "psql encontrado: $PSQL" }
else { Write-Warn "psql no encontrado — la DB debe existir ya creada" }

# ══════════════════════════════════════════════════════════════════════════════
# PASO 6 — Crear base de datos y usuario (si hay psql)
# ══════════════════════════════════════════════════════════════════════════════
Write-Step 6 "Preparando base de datos"

if ($PSQL) {
  Write-Host "  Conectando como superusuario postgres para crear usuario y BD..." -ForegroundColor DarkGray
  $POSTGRES_PASS = Ask-Secret "Contraseña del superusuario 'postgres'"

  $SQL = @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';
    RAISE NOTICE 'Usuario $DB_USER creado';
  ELSE
    ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASS';
    RAISE NOTICE 'Contraseña de $DB_USER actualizada';
  END IF;
END
`$`$;

SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')`gexec
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
"@

  $SQL | & $PSQL -h $DB_HOST -p $DB_PORT -U postgres `
    -v "PGPASSWORD=$POSTGRES_PASS" 2>&1 | ForEach-Object {
      $env:PGPASSWORD = $POSTGRES_PASS
      Write-Host "  $_" -ForegroundColor DarkGray
    }
  # Usar variable de entorno para evitar prompt
  $env:PGPASSWORD = $POSTGRES_PASS
  $result = $SQL | & $PSQL -h $DB_HOST -p $DB_PORT -U postgres 2>&1
  $env:PGPASSWORD = ""

  if ($LASTEXITCODE -eq 0) { Write-OK "Base de datos '$DB_NAME' lista" }
  else { Write-Warn "Hubo advertencias al crear la DB — continúa si ya existía" }
} else {
  Write-Warn "Crea manualmente la base de datos '$DB_NAME' con usuario '$DB_USER' antes de continuar"
  Read-Host "  Presiona Enter cuando la base de datos esté lista"
}

# ══════════════════════════════════════════════════════════════════════════════
# PASO 7 — Instalar dependencias
# ══════════════════════════════════════════════════════════════════════════════
Write-Step 7 "Instalando dependencias del backend"
Set-Location $BACKEND
npm install --silent
if ($LASTEXITCODE -ne 0) { Write-Err "Error en npm install del backend"; exit 1 }
Write-OK "Dependencias del backend instaladas"

Write-Host ""
Write-Host "  Instalando dependencias del frontend..." -ForegroundColor Cyan
Set-Location $FRONTEND
npm install --silent
if ($LASTEXITCODE -ne 0) { Write-Err "Error en npm install del frontend"; exit 1 }
Write-OK "Dependencias del frontend instaladas"

# ══════════════════════════════════════════════════════════════════════════════
# PASO 8 — Verificar conexión a DB y crear tablas
# ══════════════════════════════════════════════════════════════════════════════
Write-Step 8 "Creando tablas en la base de datos"
Write-Host "  TypeORM sincronizará el esquema automáticamente al iniciar..." -ForegroundColor DarkGray

# Arrancamos el backend brevemente para forzar la sincronización
Set-Location $BACKEND
Write-Host "  Iniciando backend para sincronizar esquema..." -ForegroundColor DarkGray
$syncJob = Start-Job -ScriptBlock {
  param($p) Set-Location $p; npm run start:dev 2>&1
} -ArgumentList $BACKEND

# Esperar hasta 60 segundos a que sincronice
$syncOk = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 2
  $out = Receive-Job $syncJob 2>&1
  if ($out -match "Nest application successfully started") {
    $syncOk = $true; break
  }
  if ($out -match "Error|Cannot connect|ECONNREFUSED") {
    Write-Err "Error al conectar a la base de datos"
    Write-Host ($out -join "`n") -ForegroundColor Red
    Stop-Job $syncJob; Remove-Job $syncJob
    exit 1
  }
}
Stop-Job $syncJob; Remove-Job $syncJob -Force 2>&1 | Out-Null

if ($syncOk) { Write-OK "Tablas creadas correctamente (tenants, viajes, vehiculos)" }
else { Write-Warn "No se pudo confirmar la sincronización, revisa los logs al iniciar" }

# ══════════════════════════════════════════════════════════════════════════════
# PASO 9 — Preguntar si iniciar los servicios
# ══════════════════════════════════════════════════════════════════════════════
Write-Step 9 "¿Deseas iniciar los servicios ahora?"
Write-Host ""
$iniciar = Ask-Input "Iniciar backend y frontend (s/n)" "s"

Set-Location $ROOT

if ($iniciar -eq "s" -or $iniciar -eq "S" -or $iniciar -eq "si" -or $iniciar -eq "SI") {
  # Liberar puertos
  foreach ($port in @([int]$APP_PORT, 5173)) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
  }

  # Backend
  $bkProc = Start-Process "powershell" `
    -ArgumentList "-NoProfile", "-Command", "Set-Location '$BACKEND'; npm run start:dev; pause" `
    -PassThru
  Write-OK "Backend iniciado (PID $($bkProc.Id))"

  Start-Sleep -Seconds 8

  # Frontend
  $feProc = Start-Process "powershell" `
    -ArgumentList "-NoProfile", "-Command", "Set-Location '$FRONTEND'; npm run dev; pause" `
    -PassThru
  Write-OK "Frontend iniciado (PID $($feProc.Id))"
}

# ══════════════════════════════════════════════════════════════════════════════
# RESUMEN FINAL
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║           ✅  EXELIXI-API CONFIGURADO EXITOSAMENTE         ║" -ForegroundColor Green
Write-Host "  ╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "  ║  Frontend:   http://localhost:5173                           ║" -ForegroundColor Green
Write-Host "  ║  Backend:    http://localhost:$APP_PORT/api                         ║" -ForegroundColor Green
Write-Host "  ║  Swagger:    http://localhost:$APP_PORT/api/docs                    ║" -ForegroundColor Green
Write-Host "  ║  Health:     http://localhost:$APP_PORT/api/health                  ║" -ForegroundColor Green
Write-Host "  ╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "  ║  Tablas creadas:  tenants · viajes · vehiculos              ║" -ForegroundColor Green
Write-Host "  ║  Config en:       backend\.env                               ║" -ForegroundColor Green
Write-Host "  ╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "  ║  Para iniciar en el futuro:  .\start-dev.ps1                ║" -ForegroundColor Green
Write-Host "  ║  Para detener:               .\stop.ps1                      ║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
