# Arranque del stack Docker independiente SistemaGreace (Windows PowerShell)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "Creado .env desde .env.example — revisa contraseñas y puertos."
}

docker compose up --build -d

$envFile = Get-Content .env | Where-Object { $_ -match '^\s*WEB_HOST_PORT=' }
$port = if ($envFile) { ($envFile -split '=', 2)[1].Trim() } else { "5080" }
$url = "http://127.0.0.1:$port/"
Write-Host ""
Write-Host "IMPORTANTE: abre esta URL en el navegador (NO uses :5000 del log de Flask):"
Write-Host "  $url"
Write-Host "  Health: http://127.0.0.1:$port/api/health"
Write-Host "El :5000 del log es interno del contenedor; en tu PC el puerto es $port."
Start-Process $url
