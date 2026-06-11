#!/usr/bin/env bash
# ============================================================
# OK.station — Despliegue en CloudPanel (Linux VPS)
# Ejecutar desde la raíz pública del sitio:  bash deploy/deploy.sh
# ============================================================
set -euo pipefail
echo "▶ OK.station — despliegue de producción"

# 1) Verificar .env
if [ ! -f backend/.env ]; then
  echo "✗ Falta backend/.env  → copia backend/.env.example a backend/.env y complétalo."
  exit 1
fi

# 2) Crear config.php si no existe (solo lee del .env)
if [ ! -f backend/api/config.php ]; then
  cp backend/api/config.example.php backend/api/config.php
  echo "✓ backend/api/config.php creado"
fi

# 3) Migraciones (crea/actualiza todas las tablas + seed idempotente)
echo "▶ Aplicando migraciones..."
php backend/database/migrate.php

# 4) Almacenamiento de archivos
STORAGE=$(grep -E '^STORAGE_PATH=' backend/.env | cut -d= -f2- | tr -d '"' || true)
STORAGE=${STORAGE:-backend/storage}
mkdir -p "$STORAGE/uploads" "$STORAGE/tickets"
chmod -R 775 "$STORAGE" || true
echo "✓ Storage listo en: $STORAGE"

echo "✓ Despliegue completo. Recuerda: APP_ENV=production y DEMO=false ya están activos."
