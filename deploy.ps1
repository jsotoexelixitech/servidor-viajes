#!/usr/bin/env pwsh
# ╔══════════════════════════════════════════════════════════════════════╗
# ║           EXELIXI-API — SCRIPT DE DESPLIEGUE EN PRODUCCIÓN          ║
# ║  Uso: .\deploy.ps1 [-Tunnel] [-Port 3000] [-SkipBuild]             ║
# ╚══════════════════════════════════════════════════════════════════════╝

param(
    [switch]$Tunnel,      # Levantar Cloudflare Quick Tunnel automáticamente
    [int]$Port = 3000,    # Puerto del backend (default 3000)
    [switch]$SkipBuild    # Saltar el build (si ya fue compilado antes)
)

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

# ── Colores ──────────────────────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "`n  ▶  $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "  ✔  $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  ⚠  $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "  ✖  $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "  ║        EXELIXI-API — Deploy Producción       ║" -ForegroundColor Magenta
Write-Host "  ╚══════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# ── 1. Verificar Node.js ─────────────────────────────────────────────────────
Write-Step "Verificando Node.js..."
try {
    $nodeVer = node --version 2>&1
    Write-OK "Node.js $nodeVer"
} catch {
    Write-Fail "Node.js no encontrado. Instálalo desde https://nodejs.org"
}

# ── 2. Verificar PostgreSQL ──────────────────────────────────────────────────
Write-Step "Verificando PostgreSQL (puerto 5432)..."
$pgConn = Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue
if (-not $pgConn) { Write-Warn "PostgreSQL no encontrado en puerto 5432. Asegúrate de que esté corriendo." }
else { Write-OK "PostgreSQL escuchando en :5432" }

# ── 3. Verificar Redis ───────────────────────────────────────────────────────
Write-Step "Verificando Redis (puerto 6379)..."
$redisConn = Get-NetTCPConnection -LocalPort 6379 -State Listen -ErrorAction SilentlyContinue
if (-not $redisConn) { Write-Warn "Redis no encontrado en puerto 6379. Asegúrate de que esté corriendo." }
else { Write-OK "Redis escuchando en :6379" }

# ── 4. Liberar puerto si está ocupado ────────────────────────────────────────
Write-Step "Liberando puerto $Port si está en uso..."
$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existing) {
    Stop-Process -Id $existing.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 1000
    Write-OK "Puerto $Port liberado"
} else {
    Write-OK "Puerto $Port disponible"
}

if (-not $SkipBuild) {
    # ── 5. Build Frontend ────────────────────────────────────────────────────
    Write-Step "Compilando frontend React..."
    Set-Location "$ROOT\frontend"
    $env:VITE_API_URL = "/api"
    npm ci --silent 2>&1 | Out-Null
    npm run build 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Fail "Error al compilar el frontend" }
    Write-OK "Frontend compilado en frontend/dist"

    # ── 6. Build Backend ─────────────────────────────────────────────────────
    Write-Step "Compilando backend NestJS..."
    Set-Location "$ROOT\backend"
    npm ci --silent 2>&1 | Out-Null
    npm run build 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Fail "Error al compilar el backend" }
    Write-OK "Backend compilado en backend/dist"
} else {
    Write-Warn "Build omitido (--SkipBuild activo)"
}

# ── 7. Crear/actualizar .env de producción ───────────────────────────────────
Write-Step "Configurando variables de entorno..."
$envProd = "$ROOT\backend\.env.production"
if (-not (Test-Path $envProd)) {
    Copy-Item "$ROOT\backend\.env" $envProd
    (Get-Content $envProd) -replace "NODE_ENV=development", "NODE_ENV=production" | Set-Content $envProd
    Write-OK ".env.production creado desde .env (ajústalo con credenciales reales)"
} else {
    Write-OK ".env.production ya existe"
}

# ── 8. Arrancar Backend ──────────────────────────────────────────────────────
Write-Step "Arrancando backend en puerto $Port (modo producción)..."
Set-Location "$ROOT\backend"

# Verificar si PM2 está disponible (gestión de procesos recomendada)
$pm2Available = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2Available) {
    # PM2: auto-restart, logs, cluster mode
    $pm2Config = @"
module.exports = {
  apps: [{
    name: 'exelixi-api',
    script: 'dist/main.js',
    cwd: '$($ROOT.Replace('\','\\'))\\backend',
    instances: 1,
    exec_mode: 'cluster',
    env_file: '.env.production',
    env: { NODE_ENV: 'production', PORT: $Port },
    max_memory_restart: '1G',
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    time: true,
  }]
}
"@
    $pm2Config | Out-File -FilePath "$ROOT\backend\ecosystem.config.js" -Encoding UTF8
    pm2 delete exelixi-api 2>&1 | Out-Null
    pm2 start "$ROOT\backend\ecosystem.config.js" --env production
    Write-OK "Backend arrancado con PM2 (auto-restart habilitado)"
} else {
    # Sin PM2: Start-Process en background
    $backendProc = Start-Process -FilePath "node" `
        -ArgumentList "dist/main.js" `
        -WorkingDirectory "$ROOT\backend" `
        -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput "$ROOT\backend\logs\stdout.log" `
        -RedirectStandardError "$ROOT\backend\logs\stderr.log"
    Write-OK "Backend arrancado (PID $($backendProc.Id)) — logs en backend/logs/"
    Write-Warn "Instala PM2 para auto-restart: npm install -g pm2"
}

# ── 9. Esperar que el backend arranque ───────────────────────────────────────
Write-Step "Esperando que el backend responda..."
$maxWait = 30
$waited = 0
$started = $false
while ($waited -lt $maxWait) {
    try {
        $health = Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 3 -ErrorAction Stop
        $started = $true
        break
    } catch { }
    Start-Sleep -Seconds 2
    $waited += 2
    Write-Host "  ⏳ Esperando... ($waited/$maxWait s)" -ForegroundColor DarkGray
}

if ($started) {
    Write-OK "Backend respondiendo en http://localhost:$Port/api"
} else {
    Write-Warn "El backend tardó más de ${maxWait}s. Revisa logs/stderr.log"
}

# ── 10. Cloudflare Tunnel ────────────────────────────────────────────────────
if ($Tunnel) {
    Write-Step "Levantando Cloudflare Quick Tunnel..."
    $cloudflared = "$ROOT\cloudflared.exe"

    if (-not (Test-Path $cloudflared)) {
        Write-Step "Descargando cloudflared..."
        Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
            -OutFile $cloudflared -UseBasicParsing
        Write-OK "cloudflared descargado"
    }

    # Arrancar túnel y capturar URL
    $tunnelLog = "$ROOT\tunnel.log"
    Start-Process -FilePath $cloudflared `
        -ArgumentList "tunnel --url http://localhost:$Port" `
        -RedirectStandardError $tunnelLog `
        -WindowStyle Hidden

    # Esperar la URL
    $tunnelUrl = $null
    $waitTunnel = 0
    while ($waitTunnel -lt 30) {
        Start-Sleep -Seconds 2
        $waitTunnel += 2
        if (Test-Path $tunnelLog) {
            $content = Get-Content $tunnelLog -Raw -ErrorAction SilentlyContinue
            if ($content -match "https://[a-z0-9\-]+\.trycloudflare\.com") {
                $tunnelUrl = $Matches[0]
                break
            }
        }
    }

    if ($tunnelUrl) {
        Write-OK "Túnel activo: $tunnelUrl"
        $tunnelUrl | Out-File "$ROOT\tunnel-url.txt" -Encoding UTF8
    } else {
        Write-Warn "No se pudo leer la URL del túnel. Revisa tunnel.log"
    }
}

# ── 11. Resumen final ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║              ✅  EXELIXI-API EN PRODUCCIÓN              ║" -ForegroundColor Green
Write-Host "  ╠══════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "  ║  Local:    http://localhost:$Port                          ║" -ForegroundColor Green
Write-Host "  ║  API:      http://localhost:$Port/api                      ║" -ForegroundColor Green
Write-Host "  ║  Swagger:  http://localhost:$Port/api/docs                 ║" -ForegroundColor Green
Write-Host "  ║  Health:   http://localhost:$Port/api/health               ║" -ForegroundColor Green
if ($tunnelUrl) {
Write-Host "  ╠══════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "  ║  🌐 PÚBLICO: $tunnelUrl" -ForegroundColor Yellow
}
Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

if (-not $pm2Available) {
    Write-Host "  ℹ  Para detener el servidor: Stop-Process -Name 'node'" -ForegroundColor DarkGray
}
Set-Location $ROOT
