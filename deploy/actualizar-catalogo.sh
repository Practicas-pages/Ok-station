#!/usr/bin/env bash
# ==============================================================================
# Ok.station — Actualización diaria del catálogo de la tienda
# ------------------------------------------------------------------------------
# Un solo comando para el cron. Corre los runners EN ORDEN, porque cada uno
# depende del anterior:
#
#   1. exel-sync            Catálogo de Exel del Norte (almacén 4, papelería).
#                           Trae altas, bajas, PRECIOS, EXISTENCIAS, OFERTAS e
#                           IMÁGENES del proveedor. Es el que de verdad importa.
#   2. icecat-enrich        Rellena los huecos que Exel no cubre: productos sin
#                           foto, sin descripción o sin ficha técnica.
#   3. rescate oficial      Busca coincidencias exactas en fabricantes compatibles.
#   4. descarga de imágenes Copia al servidor las fotos remotas registradas.
#   5. purga de Varnish     Para que el cliente vea los precios de hoy y no los
#                           de anoche.
#
# NO usa `set -e` a propósito: si Icecat falla, el catálogo de Exel ya quedó bien
# y no tiene sentido abortar. Cada paso reporta por separado y el código de salida
# final refleja si algo falló, para que el cron avise.
#
# Uso:   bash deploy/actualizar-catalogo.sh
# Cron:  15 2 * * * cd /home/okstation/htdocs/okstation.mx && bash deploy/actualizar-catalogo.sh >> /var/log/okstation-catalogo.log 2>&1
# ==============================================================================
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

PHP="${PHP_BIN:-php}"
ICECAT_TOPE="${ICECAT_TOPE:-1000}"     # productos por noche que se consultan a Icecat
IMG_DOWNLOAD_TOPE="${IMG_DOWNLOAD_TOPE:-500}" # imágenes remotas que se localizan por noche
RESCATE_TOPE="${RESCATE_TOPE:-250}"     # faltantes que revisa la tercera pasada
FALLOS=0

echo "════════════════════════════════════════════════════════════"
echo "  Catálogo Ok.station — $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════════════"

# ── 1. Exel del Norte ─────────────────────────────────────────────────────────
# Si el feed llega incompleto, el runner aborta SOLO y deja el catálogo anterior
# intacto (mejor precios de ayer que una tienda vacía). Eso cuenta como fallo
# para que te enteres, pero no impide seguir.
echo ""
echo "▶ 1/5  Exel del Norte (catálogo, precios, stock, ofertas e imágenes)"
if "$PHP" backend/tools/exel-sync.php; then
  echo "   ✓ Exel al día"
else
  echo "   ✗ Exel FALLÓ — el catálogo quedó como estaba. Revisa la API o la llave."
  FALLOS=$((FALLOS + 1))
fi

# ── 2. Icecat ─────────────────────────────────────────────────────────────────
# Solo mira los productos a los que les falta algo, y prioriza los que no tienen
# foto. Los que ya consultó quedan marcados y no se vuelven a preguntar, así que
# tras unas noches esto se queda casi sin trabajo: solo los productos NUEVOS.
echo ""
echo "▶ 2/5  Icecat (rellena imágenes, descripciones y fichas que falten)"
if "$PHP" backend/tools/icecat-enrich.php "$ICECAT_TOPE"; then
  echo "   ✓ Icecat al día"
else
  echo "   ✗ Icecat falló — no es grave: los productos se quedan con lo de Exel."
  FALLOS=$((FALLOS + 1))
fi

# ── 3. Rescate exacto en fabricantes ─────────────────────────────────────────
echo ""
echo "▶ 3/5  Rescate de imágenes oficiales (hasta ${RESCATE_TOPE} faltantes)"
if "$PHP" backend/tools/rescate-imagenes.php "$RESCATE_TOPE"; then
  echo "   ✓ Tercera pasada completada"
else
  echo "   ✗ El rescate tuvo errores temporales; se reintentará en la siguiente corrida."
  FALLOS=$((FALLOS + 1))
fi

# ── 4. Copia local de imágenes ────────────────────────────────────────────────
echo ""
echo "▶ 4/5  Imágenes (copia local de hasta ${IMG_DOWNLOAD_TOPE} remotas)"
if "$PHP" backend/tools/download-product-images.php --limit="$IMG_DOWNLOAD_TOPE"; then
  echo "   ✓ Lote de imágenes procesado"
else
  echo "   ✗ No se pudo descargar ninguna imagen del lote. Revisa red, permisos y CDNs."
  FALLOS=$((FALLOS + 1))
fi

# ── 5. Caché ──────────────────────────────────────────────────────────────────
echo ""
echo "▶ 5/5  Purgando caché"
if command -v varnishadm >/dev/null 2>&1; then
  if varnishadm "ban req.http.host ~ okstation.mx" >/dev/null 2>&1; then
    echo "   ✓ Varnish purgado"
  else
    echo "   ⚠ No se pudo purgar Varnish por CLI (usa el botón de CloudPanel)"
  fi
else
  echo "   · Varnish no está en este servidor"
fi

# ── Resumen ───────────────────────────────────────────────────────────────────
echo ""
echo "── Estado del catálogo ──"
"$PHP" -r '
require "backend/api/lib/env.php"; load_env("backend/.env");
$c = require "backend/api/config.php"; $d = $c["db"];
try {
    $pdo = new PDO("mysql:host={$d["host"]};port={$d["port"]};dbname={$d["name"]};charset=utf8mb4",
                   $d["user"], $d["pass"], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $q = $pdo->query("SELECT COUNT(*) act,
        SUM(EXISTS(SELECT 1 FROM product_images i WHERE i.product_id=p.id)) img,
        SUM(COALESCE(p.description,\"\") <> \"\") des,
        SUM(p.specs_json IS NOT NULL) fic,
        SUM(p.old_price > p.price) ofe
        FROM products p WHERE p.is_active=1")->fetch(PDO::FETCH_ASSOC);
    $n = max(1, (int) $q["act"]);
    printf("  Productos activos: %d\n", $q["act"]);
    printf("  Con imagen:        %d (%d%%)\n", $q["img"], round($q["img"] * 100 / $n));
    printf("  Con descripción:   %d (%d%%)\n", $q["des"], round($q["des"] * 100 / $n));
    printf("  Con ficha Icecat:  %d (%d%%)\n", $q["fic"], round($q["fic"] * 100 / $n));
    printf("  En oferta:         %d\n", $q["ofe"]);
} catch (Throwable $e) {
    echo "  (no se pudo leer el estado: " . $e->getMessage() . ")\n";
}'

echo ""
if [ "$FALLOS" -eq 0 ]; then
  echo "✓ Catálogo actualizado sin incidencias."
  exit 0
fi
echo "✗ Terminó con $FALLOS paso(s) con problemas. Revisa el log de arriba."
exit 1
