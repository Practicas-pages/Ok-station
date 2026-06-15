#!/usr/bin/env bash
# ============================================================
# OK.station — Publicar cambios en producción (CloudPanel)
# Ejecutar desde la raíz del sitio en el servidor:
#   bash deploy/publicar.sh
# Hace: git pull  →  purga Varnish  →  verifica caché
# ============================================================
set -euo pipefail

echo "▶ 1/3  Bajando últimos cambios de GitHub..."
git pull --ff-only

echo "▶ 2/3  Purgando caché de Varnish..."
if command -v varnishadm >/dev/null 2>&1; then
  if varnishadm "ban req.http.host ~ okstation.mx" >/dev/null 2>&1; then
    echo "   ✓ Varnish purgado"
  else
    echo "   ⚠ No se pudo purgar por CLI. Usa el botón 'Clear Cache' en CloudPanel."
  fi
else
  echo "   ⚠ varnishadm no disponible. Usa el botón 'Clear Cache' en CloudPanel."
fi

echo "▶ 3/3  Verificando cabeceras de caché de styles.css..."
curl -sI "https://okstation.mx/styles.css" | grep -i -E "cache-control|expires" || true

echo "✓ Listo. Abre el sitio y recarga con Ctrl+Shift+R."
echo "  Debe decir:  Cache-Control: no-cache, must-revalidate"
