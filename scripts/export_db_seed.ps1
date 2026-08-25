# Exporta la BBDD MySQL actual a docker/mysql/init/02_seed_data.sql
# Ejecutar tras cambios importantes en cartas/usuarios/hilos para actualizar el seed del repo.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$container = "sistemagreace-db"
$out = "docker/mysql/init/02_seed_data.sql"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker no está disponible."
}

$running = docker ps --filter "name=$container" --format "{{.Names}}"
if (-not $running) {
    throw "Contenedor $container no está en ejecución. Usa: docker compose up -d"
}

docker exec $container sh -c @"
mysqldump -ugreace -pgreace_pass_change_me \
  --no-create-info --skip-triggers --single-transaction \
  --set-gtid-purged=OFF --default-character-set=utf8mb4 \
  --no-tablespaces \
  sistemagreace cartas hilos usuarios whatsapp_alert_log consultas resumen \
  > /tmp/02_seed_data.sql
"@

docker cp "${container}:/tmp/02_seed_data.sql" $out
$size = (Get-Item $out).Length
Write-Host "Exportado: $out ($([math]::Round($size/1MB, 2)) MB)"
Write-Host "Revisa git diff y haz commit cuando quieras publicar el snapshot."
