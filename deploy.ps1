#!/usr/bin/env pwsh
# ============================================================
#   EXELIXI-API -- DESPLIEGUE EN PRODUCCION
#   Compatible con PowerShell 5.1 y PowerShell 7+
#   Uso: .\deploy.ps1 [-Tunnel] [-Port 3000] [-SkipBuild]
# ============================================================

param(
    [switch]$Tunnel,
    [int]$Port = 3000,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

function Write-Step { param($msg) Write-Host "`n  >>  $msg" -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host "  OK   $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  (!   $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "  ERR  $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Magenta
Write-Host "       EXELIXI-API  --  Despliegue en Produccion             " -ForegroundColor Magenta
Write-Host "  ============================================================" -ForegroundColor Magenta
Write-Host ""

# ── 1. Verificar Node.js ─────────────────────────────────────
Write-Step "Verificando Node.js"
try   { $nodeVer = node --version 2>&1; Write-OK "Node.js $nodeVer" }
catch { Write-Fail "Node.js no encontrado. Instala desde https://nodejs.org" }

# ── 2. Verificar y cargar .env ───────────────────────────────
Write-Step "Verificando variables de entorno"
$envFile = "$ROOT\backend\.env"
if (-not (Test-Path $envFile)) {
    Write-Fail "No existe backend/.env. Ejecuta primero .\setup.ps1"
}
Write-OK "backend/.env encontrado"

# Leer el .env y validar variables criticas
$envVars = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match "^\s*([^#=\s]+)\s*=\s*(.*)$") {
        $envVars[$Matches[1]] = $Matches[2].Trim()
    }
}

$missingOk = $true
$weak      = $false

# Variables obligatorias
foreach ($v in @("SESSION_SECRET","ADMIN_SECRET","DB_HOST","DB_USERNAME","DB_PASSWORD","DB_NAME")) {
    if (-not $envVars[$v] -or $envVars[$v] -eq "") {
        Write-Warn "Variable obligatoria no configurada: $v"
        $missingOk = $false
    }
}

# Detectar valores de ejemplo/debiles en produccion
$exampleValues = @(
    "cambia_esto","change_me","secret","example","test","dev-session"
)
foreach ($v in @("SESSION_SECRET","ADMIN_SECRET")) {
    $val = $envVars[$v]
    if ($val) {
        foreach ($ex in $exampleValues) {
            if ($val -ilike "*$ex*") {
                Write-Warn "$v parece un valor de ejemplo debil. Usa un secreto fuerte en produccion."
                $weak = $true
            }
        }
        if ($val.Length -lt 32) {
            Write-Warn "$v es muy corto ($($val.Length) chars). Minimo recomendado: 32 caracteres."
            $weak = $true
        }
    }
}

if (-not $missingOk) {
    Write-Fail "Configura las variables faltantes en backend/.env y ejecuta de nuevo."
}

if ($weak) {
    Write-Host ""
    Write-Warn "Hay secretos debiles. En produccion se recomienda generarlos con:"
    Write-Host "  node -e `"process.stdout.write(require('crypto').randomBytes(40).toString('hex'))`"" -ForegroundColor DarkGray
    $cont = Read-Host "  >> Continuar de todas formas? (s/n)"
    if ($cont -notmatch "^[sS]") { exit 1 }
}

Write-OK "Variables de entorno validadas"

# ── 3. Verificar PostgreSQL ──────────────────────────────────
Write-Step "Verificando PostgreSQL (puerto 5432)"
$pgConn = Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue
if (-not $pgConn) { Write-Warn "PostgreSQL no detectado en :5432. Asegurate de que este corriendo." }
else              { Write-OK "PostgreSQL escuchando en :5432" }

# ── 4. Verificar Redis ───────────────────────────────────────
Write-Step "Verificando Redis"
$redisRunning = $false
$redisCli     = "C:\redis-portable\redis-cli.exe"
$redisHost    = if ($envVars["REDIS_HOST"]) { $envVars["REDIS_HOST"] } else { "localhost" }
$redisPort    = if ($envVars["REDIS_PORT"]) { $envVars["REDIS_PORT"] } else { "6379" }

if (Test-Path $redisCli) {
    try {
        $ping = & $redisCli -h $redisHost -p $redisPort ping 2>&1
        if ($ping -eq "PONG") { $redisRunning = $true; Write-OK "Redis respondiendo en ${redisHost}:${redisPort}" }
    } catch { }
}
if (-not $redisRunning) {
    $redisExe = "C:\redis-portable\redis-server.exe"
    if (Test-Path $redisExe) {
        Write-Warn "Redis no responde. Iniciando automaticamente..."
        Start-Process -FilePath $redisExe `
            -ArgumentList "--port $redisPort --save 60 1 --dir C:\redis-portable" `
            -WindowStyle Hidden
        Start-Sleep -Seconds 3
        if (Test-Path $redisCli) {
            $ping2 = & $redisCli -h $redisHost -p $redisPort ping 2>&1
            if ($ping2 -eq "PONG") { Write-OK "Redis iniciado"; $redisRunning = $true }
        }
    }
    if (-not $redisRunning) {
        Write-Warn "Redis no disponible. Las colas de reintento no funcionaran."
    }
}

# ── 5. Liberar puerto ────────────────────────────────────────
Write-Step "Liberando puerto $Port"
$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existing) {
    Stop-Process -Id $existing.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 1500
    Write-OK "Puerto $Port liberado"
} else {
    Write-OK "Puerto $Port disponible"
}

if (-not $SkipBuild) {
    # ── 6. Build Frontend ────────────────────────────────────
    Write-Step "Compilando frontend React"
    Set-Location "$ROOT\frontend"
    $env:VITE_API_URL = "/api"
    npm ci --silent 2>&1 | Out-Null
    npm run build 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Fail "Error al compilar el frontend" }
    Write-OK "Frontend compilado en frontend/dist"

    # ── 7. Build Backend ─────────────────────────────────────
    Write-Step "Compilando backend NestJS"
    Set-Location "$ROOT\backend"
    npm ci --silent 2>&1 | Out-Null
    npm run build 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Fail "Error al compilar el backend" }
    Write-OK "Backend compilado en backend/dist"
} else {
    Write-Warn "Build omitido (-SkipBuild activo)"
}

# ── 8. Preparar .env.production ──────────────────────────────
Write-Step "Configurando variables para produccion"
$envProd = "$ROOT\backend\.env"
(Get-Content $envProd) -replace "NODE_ENV=development", "NODE_ENV=production" |
    Set-Content $envProd
Write-OK "NODE_ENV=production configurado"

# ── 9. Arrancar Backend ──────────────────────────────────────
Write-Step "Arrancando backend en puerto $Port (produccion)"
Set-Location "$ROOT\backend"
New-Item -ItemType Directory -Path "logs" -Force | Out-Null

$pm2Available = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2Available) {
    $ecoFile = "$ROOT\backend\ecosystem.config.js"
    $ecoContent = "module.exports = { apps: [{ name: 'exelixi-api', script: 'dist/main.js', cwd: '$($ROOT.Replace('\','\\'))\\backend', instances: 1, exec_mode: 'cluster', env_file: '.env', env: { NODE_ENV: 'production', PORT: $Port }, max_memory_restart: '1G', error_file: 'logs/pm2-error.log', out_file: 'logs/pm2-out.log', time: true }] }"
    [System.IO.File]::WriteAllText($ecoFile, $ecoContent, [System.Text.Encoding]::UTF8)
    pm2 delete exelixi-api 2>&1 | Out-Null
    pm2 start $ecoFile --env production
    Write-OK "Backend arrancado con PM2 (auto-restart habilitado)"
} else {
    $backendProc = Start-Process -FilePath "node" `
        -ArgumentList "dist/main.js" `
        -WorkingDirectory "$ROOT\backend" `
        -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput "$ROOT\backend\logs\stdout.log" `
        -RedirectStandardError  "$ROOT\backend\logs\stderr.log"
    Write-OK "Backend arrancado (PID $($backendProc.Id)) -- logs en backend/logs/"
    Write-Warn "Instala PM2 para auto-restart: npm install -g pm2"
}

# ── 10. Esperar que el backend responda ──────────────────────
Write-Step "Esperando que el backend responda"
$maxWait = 60
$waited  = 0
$started = $false
while ($waited -lt $maxWait) {
    try {
        Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 3 -ErrorAction Stop | Out-Null
        $started = $true; break
    } catch { }
    Start-Sleep -Seconds 3
    $waited += 3
    Write-Host "  ... ($waited/$maxWait s)" -ForegroundColor DarkGray
}

if ($started) { Write-OK "Backend respondiendo en http://localhost:$Port/api" }
else          { Write-Warn "Backend no responde aun. Revisa logs/stderr.log" }

# ── 11. Cloudflare Tunnel (opcional) ─────────────────────────
$tunnelUrl = $null
if ($Tunnel) {
    Write-Step "Levantando Cloudflare Quick Tunnel"
    $cloudflared = "$ROOT\cloudflared.exe"
    if (-not (Test-Path $cloudflared)) {
        Write-Step "Descargando cloudflared..."
        Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
            -OutFile $cloudflared -UseBasicParsing
        Write-OK "cloudflared descargado"
    }
    $tunnelLog = "$ROOT\tunnel.log"
    Remove-Item $tunnelLog -ErrorAction SilentlyContinue
    Start-Process -FilePath $cloudflared `
        -ArgumentList "tunnel --url http://localhost:$Port" `
        -RedirectStandardError $tunnelLog -WindowStyle Hidden

    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 2
        if (Test-Path $tunnelLog) {
            $content = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
            if ($content -match "https://[a-z0-9\-]+\.trycloudflare\.com") {
                $tunnelUrl = $Matches[0]; break
            }
        }
    }
    if ($tunnelUrl) {
        Write-OK "Tunel activo: $tunnelUrl"
        $tunnelUrl | Out-File "$ROOT\tunnel-url.txt" -Encoding UTF8
    } else {
        Write-Warn "No se obtuvo URL del tunel. Revisa tunnel.log"
    }
}

# ── 12. Resumen final ────────────────────────────────────────
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "       EXELIXI-API EN PRODUCCION" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "  API    :  http://localhost:$Port/api" -ForegroundColor Green
Write-Host "  Health :  http://localhost:$Port/api/health" -ForegroundColor Green
if ($APP_ENV -ne "production") {
Write-Host "  Swagger:  http://localhost:$Port/api/docs" -ForegroundColor Green
}
if ($tunnelUrl) {
Write-Host ""
Write-Host "  PUBLICO: $tunnelUrl" -ForegroundColor Yellow
Write-Host "  Guardado en: tunnel-url.txt" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Yellow
Write-Host "  ADMIN_SECRET (necesario para crear clientes en el panel):" -ForegroundColor Yellow
Write-Host "  $($envVars['ADMIN_SECRET'])" -ForegroundColor White
Write-Host "  ============================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Para detener: .\stop.ps1" -ForegroundColor DarkGray
Write-Host ""

Set-Location $ROOT
