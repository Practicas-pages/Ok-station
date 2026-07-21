#!/usr/bin/env bash
# ============================================================
# Ok.station — Publicar cambios en producción (CloudPanel)
# Ejecutar desde la raíz del sitio en el servidor:
#   bash deploy/publicar.sh
# Hace: git pull  →  re-versiona assets (?v=<commit>)  →
#       purga Varnish (si aplica)  →  verifica caché
#
# El re-versionado reescribe TODOS los ?v= de los .html con el hash
# del commit publicado. Como el HTML se sirve sin caché, cualquier
# navegador ve las URLs nuevas en su siguiente visita y descarga los
# CSS/JS/imágenes frescos — incluso si tenía copias "immutable" de
# configuraciones de caché viejas. Nadie tiene que subir el ?v= a
# mano ni recargar con Ctrl+Shift+R.
# ============================================================
set -euo pipefail

echo "▶ 1/4  Bajando últimos cambios de GitHub..."
# Los .html del servidor traen el ?v= reescrito de la publicación anterior;
# se restauran a su versión de git para que el pull --ff-only no falle.
git checkout -- '*.html' 2>/dev/null || true
git pull --ff-only

echo "▶ 1b/4 Aplicando migraciones de base de datos pendientes..."
# Idempotente: si no hay nada nuevo dice "ya está al día". Va ANTES de servir el
# código nuevo: un endpoint que espera una columna que aún no existe tira 500 en
# todos los pedidos (pasó con contact_email/0034).
if php backend/database/migrate.php; then
  echo "   ✓ Base de datos al día"
else
  echo "   ✗ Las migraciones fallaron — REVISA antes de continuar (el código nuevo"
  echo "     puede requerir columnas que aún no existen)."
fi

echo "▶ 2/4  Versionando assets con el commit publicado (cache-busting)..."
HASH=$(git rev-parse --short HEAD)
sed -i -E "s/\?v=[0-9A-Za-z]+/?v=${HASH}/g" ./*.html
echo "   ✓ Assets versionados como ?v=${HASH}"

echo "▶ 3/4  Purgando caché de Varnish (si aplica)..."
if command -v varnishadm >/dev/null 2>&1; then
  if varnishadm "ban req.http.host ~ okstation.mx" >/dev/null 2>&1; then
    echo "   ✓ Varnish purgado"
  else
    echo "   ⚠ No se pudo purgar por CLI. Usa el botón 'Clear Cache' en CloudPanel."
  fi
else
  echo "   ✓ Varnish no está en este servidor (no hace falta purgar)."
fi

echo "▶ 4/4  Verificando cabeceras de caché de styles.css..."
curl -sI "https://okstation.mx/styles.css" | grep -i -E "cache-control|expires" || true

echo "✓ Listo. Los visitantes verán los cambios en su siguiente visita o con una"
echo "  recarga NORMAL (F5). Ya no hace falta Ctrl+Shift+R ni subir ?v= a mano."
