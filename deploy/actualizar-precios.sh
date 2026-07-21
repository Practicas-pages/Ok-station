#!/usr/bin/env bash
# ==============================================================================
# Ok.station — Refresco POR HORA de precios y stock de la tienda
# ------------------------------------------------------------------------------
# Complemento LIGERO del sync nocturno (deploy/actualizar-catalogo.sh). Corre cada
# hora y solo trae de Exel lo que cambia seguido: PRECIOS, STOCK, OFERTAS y las
# altas/bajas del catálogo. NO baja imágenes ni consulta Icecat (eso es pesado y no
# cambia hora a hora: se queda en la corrida de la madrugada).
#
# Por qué existe:
#   El catálogo lo maneja Exel del Norte y sus precios/existencias se mueven durante
#   el día. Con solo el sync nocturno, un cliente podía ver un precio de anoche. Esto
#   mantiene la tienda fresca sin la churn de fotos ni la carga de re-consultar Icecat.
#   (El checkout ya bloquea por su cuenta si el precio derivó >3% desde el carrito;
#   esto reduce que ese bloqueo salte.)
#
# Uso:   bash deploy/actualizar-precios.sh
# Cron:  30 * * * * cd /home/okstation/htdocs/okstation.mx && bash deploy/actualizar-precios.sh >> /var/log/okstation-precios.log 2>&1
#        (al minuto :30 de cada hora; el sync COMPLETO sigue a las 2:15 — corre a los :30
#         para no encimarse con él. Aunque se encimaran no habría daño: los UPSERT son
#         atómicos y la salvaguarda del 70% protege el catálogo.)
# ==============================================================================
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

PHP="${PHP_BIN:-php}"
FALLOS=0

echo "──────────────────────────────────────────────"
echo "  Precios Ok.station — $(date '+%Y-%m-%d %H:%M:%S')"
echo "──────────────────────────────────────────────"

# ── 1. Refresco ligero de precio + stock ──────────────────────────────────────
# La misma salvaguarda del 70% del runner completo aplica: si Exel manda un feed
# incompleto, aborta SOLO y deja el catálogo como estaba (mejor precios de hace una
# hora que una tienda vacía).
if "$PHP" backend/tools/exel-sync.php --solo-precios; then
  echo "   ✓ Precios y stock al día"
else
  echo "   ✗ Falló el refresco — el catálogo quedó como estaba. Revisa la API de Exel."
  FALLOS=$((FALLOS + 1))
fi

# ── 2. Purga de caché ─────────────────────────────────────────────────────────
# Para que el cliente vea los precios de esta hora y no los de la anterior.
if command -v varnishadm >/dev/null 2>&1; then
  if varnishadm "ban req.http.host ~ okstation.mx" >/dev/null 2>&1; then
    echo "   ✓ Varnish purgado"
  else
    echo "   ⚠ No se pudo purgar Varnish por CLI (usa el botón de CloudPanel)"
  fi
else
  echo "   · Varnish no está en este servidor"
fi

if [ "$FALLOS" -eq 0 ]; then
  exit 0
fi
exit 1
