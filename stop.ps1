#!/usr/bin/env pwsh
# ╔══════════════════════════════════════════════════════════════════════╗
# ║           EXELIXI-API — DETENER TODOS LOS SERVICIOS                 ║
# ╚══════════════════════════════════════════════════════════════════════╝

function Write-OK { param($msg) Write-Host "  ✔  $msg" -ForegroundColor Green }

Write-Host "`n  Deteniendo servicios Exelixi-API...`n" -ForegroundColor Yellow

# Matar procesos en puertos conocidos
foreach ($port in @(3000, 5173)) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Write-OK "Puerto $port liberado"
    }
}

# Matar cloudflared
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-OK "cloudflared detenido"

# PM2 si está disponible
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    pm2 delete exelixi-api 2>&1 | Out-Null
    Write-OK "PM2: exelixi-api detenido"
}

Write-Host "`n  Todo detenido.`n" -ForegroundColor Green
