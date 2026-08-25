#!/usr/bin/env bash
# Arranque del stack Docker independiente SistemaGreace
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Creado .env desde .env.example — revisa contraseñas y puertos."
fi

docker compose up --build -d
echo "Web:  http://localhost:${WEB_HOST_PORT:-5080}"
echo "MySQL host port: ${MYSQL_HOST_PORT:-3307}"
echo "Health: http://localhost:${WEB_HOST_PORT:-5080}/api/health"
