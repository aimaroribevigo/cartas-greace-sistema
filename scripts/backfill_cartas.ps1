# Backfill referencia operativa + especialista responsable (area) en cartas históricas
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$dry = $args -contains "--dry-run"
$pyArgs = @("backfill_cartas.py")
if ($dry) { $pyArgs += "--dry-run" }

# Cargar variables de entorno locales si existen
if (Test-Path "env") { Get-Content "env" | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
} }

python @pyArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $dry) {
    Write-Host ""
    Write-Host "Backfill aplicado. Recarga el dashboard para ver los cambios."
}

# Solo corregir responsables (OFICINA TECNICA / legacy):
# python backfill_cartas.py --fix-areas-only
