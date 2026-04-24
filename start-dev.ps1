#!/usr/bin/env pwsh
# ╔══════════════════════════════════════════════════════════════════════╗
# ║           EXELIXI-API — SCRIPT DE DESARROLLO LOCAL                  ║
# ║  Uso: .\start-dev.ps1 [-Tunnel]                                    ║
# ╚══════════════════════════════════════════════════════════════════════╝

param(
    [switch]$Tunnel   # Levantar Cloudflare Quick Tunnel automáticamente
)

$ROOT = $PSScriptRoot

function Write-Step { param($msg) Write-Host "`n  ▶  $msg" -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host "  ✔  $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  ⚠  $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "  ║        EXELIXI-API — Modo Desarrollo         ║" -ForegroundColor Blue
Write-Host "  ╚══════════════════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""

# ── 1. Matar procesos previos en puertos 3000 y 5173 ────────────────────────
Write-Step "Liberando puertos..."
foreach ($port in @(3000, 5173)) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Write-OK "Puerto $port liberado"
    }
}
Start-Sleep -Milliseconds 500

# ── 2. Crear carpeta de logs si no existe ────────────────────────────────────
New-Item -ItemType Directory -Path "$ROOT\backend\logs" -Force | Out-Null

# ── 3. Arrancar Backend (dev con hot-reload) ─────────────────────────────────
Write-Step "Arrancando backend NestJS (hot-reload)..."
$backendJob = Start-Process -FilePath "powershell" `
    -ArgumentList "-NoProfile", "-Command", "Set-Location '$ROOT\backend'; npm run start:dev 2>&1 | Tee-Object -FilePath '$ROOT\backend\logs\dev.log'" `
    -PassThru -WindowStyle Minimized
Write-OK "Backend iniciado (PID $($backendJob.Id)) — logs en backend/logs/dev.log"

# ── 4. Esperar que el backend arranque ───────────────────────────────────────
Write-Step "Esperando backend..."
$waited = 0
while ($waited -lt 45) {
    try {
        Invoke-RestMethod "http://localhost:3000/api/health" -TimeoutSec 3 -ErrorAction Stop | Out-Null
        Write-OK "Backend listo en http://localhost:3000"
        break
    } catch { }
    Start-Sleep -Seconds 2
    $waited += 2
    Write-Host "  ⏳ ($waited s)..." -ForegroundColor DarkGray
}

# ── 5. Arrancar Frontend (Vite dev server con proxy) ─────────────────────────
Write-Step "Arrancando frontend Vite..."
$frontendJob = Start-Process -FilePath "powershell" `
    -ArgumentList "-NoProfile", "-Command", "Set-Location '$ROOT\frontend'; npm run dev 2>&1" `
    -PassThru -WindowStyle Minimized
Write-OK "Frontend iniciado (PID $($frontendJob.Id))"

# Esperar Vite
Start-Sleep -Seconds 5

# ── 6. Cloudflare Tunnel (opcional) ─────────────────────────────────────────
$tunnelUrl = $null
if ($Tunnel) {
    Write-Step "Levantando Cloudflare Quick Tunnel (puerto 5173)..."
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
        -ArgumentList "tunnel --url http://localhost:5173" `
        -RedirectStandardError $tunnelLog `
        -WindowStyle Hidden

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
    if ($tunnelUrl) { Write-OK "Túnel: $tunnelUrl"; $tunnelUrl | Out-File "$ROOT\tunnel-url.txt" }
    else            { Write-Warn "No se obtuvo URL del túnel. Revisa tunnel.log" }
}

# ── 7. Resumen ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔════════════════════════════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "  ║              ✅  EXELIXI-API EN DESARROLLO                ║" -ForegroundColor Blue
Write-Host "  ╠════════════════════════════════════════════════════════════╣" -ForegroundColor Blue
Write-Host "  ║  Frontend:  http://localhost:5173                          ║" -ForegroundColor Blue
Write-Host "  ║  Backend:   http://localhost:3000/api                      ║" -ForegroundColor Blue
Write-Host "  ║  Swagger:   http://localhost:3000/api/docs                 ║" -ForegroundColor Blue
Write-Host "  ║  Health:    http://localhost:3000/api/health               ║" -ForegroundColor Blue
if ($tunnelUrl) {
Write-Host "  ╠════════════════════════════════════════════════════════════╣" -ForegroundColor Blue
Write-Host "  ║  🌐 PÚBLICO: $tunnelUrl" -ForegroundColor Yellow
}
Write-Host "  ╚════════════════════════════════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""
Write-Host "  Para detener todo: cierra las ventanas minimizadas o ejecuta:" -ForegroundColor DarkGray
Write-Host "  .\stop.ps1" -ForegroundColor DarkGray
Write-Host ""
