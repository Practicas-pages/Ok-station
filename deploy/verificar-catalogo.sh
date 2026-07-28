#!/usr/bin/env bash
# ==============================================================================
# Ok.station — Verifica la corrida nocturna y la repara solo si hace falta
# ------------------------------------------------------------------------------
# Uso normal (solo lectura):
#   bash deploy/verificar-catalogo.sh
#
# Verificar y ejecutar el pipeline completo si la última sincronización de Exel
# tiene 30 horas o más:
#   bash deploy/verificar-catalogo.sh --actualizar-si-atrasado
#
# No imprime variables de entorno ni credenciales. El umbral de 30 h evita repetir
# la corrida antes de las 02:15 y, al mismo tiempo, detecta una noche perdida.
# ==============================================================================
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

PHP="${PHP_BIN:-php}"
UMBRAL_HORAS="${CATALOGO_MAX_AGE_HOURS:-30}"
MODO="${1:-}"

leer_estado() {
  "$PHP" <<'PHP'
<?php
declare(strict_types=1);

require 'backend/api/lib/env.php';
load_env('backend/.env');
$config = require 'backend/api/config.php';
$d = $config['db'];

try {
    $pdo = new PDO(
        "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset=utf8mb4",
        $d['user'],
        $d['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    $row = $pdo->query(
        "SELECT
            MAX(CASE WHEN supplier='exel' THEN last_synced_at END) ultima_exel,
            TIMESTAMPDIFF(HOUR,
                MAX(CASE WHEN supplier='exel' THEN last_synced_at END),
                NOW()
            ) edad_horas,
            SUM(supplier='exel' AND is_active=1) activos_exel,
            SUM(supplier='exel' AND is_active=1 AND warehouse_id='4') activos_almacen_4,
            MAX(enriched_at) ultima_icecat,
            SUM(is_active=1 AND enriched_at IS NULL) pendientes_icecat
         FROM products"
    )->fetch();

    echo ($row['ultima_exel'] ?? '') . PHP_EOL;
    echo ($row['edad_horas'] ?? '') . PHP_EOL;
    echo (int) ($row['activos_exel'] ?? 0) . PHP_EOL;
    echo (int) ($row['activos_almacen_4'] ?? 0) . PHP_EOL;
    echo ($row['ultima_icecat'] ?? '') . PHP_EOL;
    echo (int) ($row['pendientes_icecat'] ?? 0) . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, "No se pudo consultar el estado del catálogo.\n");
    exit(1);
}
PHP
}

mostrar_estado() {
  mapfile -t ESTADO < <(leer_estado | tr -d '\r')
  if [ "${#ESTADO[@]}" -lt 6 ]; then
    echo "✗ La consulta del catálogo no devolvió un estado completo."
    return 1
  fi

  ULTIMA_EXEL="${ESTADO[0]}"
  EDAD_HORAS="${ESTADO[1]}"
  ACTIVOS_EXEL="${ESTADO[2]}"
  ACTIVOS_ALMACEN_4="${ESTADO[3]}"
  ULTIMA_ICECAT="${ESTADO[4]}"
  PENDIENTES_ICECAT="${ESTADO[5]}"

  echo "════════════════════════════════════════════════════════════"
  echo "  Estado del catálogo Ok.station"
  echo "════════════════════════════════════════════════════════════"
  echo "  Última sincronización Exel: ${ULTIMA_EXEL:-NUNCA}"
  echo "  Antigüedad:                 ${EDAD_HORAS:-desconocida} hora(s)"
  echo "  Productos Exel activos:     ${ACTIVOS_EXEL}"
  echo "  Etiquetados almacén 4:      ${ACTIVOS_ALMACEN_4}"
  echo "  Último enriquecimiento:     ${ULTIMA_ICECAT:-NUNCA}"
  echo "  Pendientes de Icecat:       ${PENDIENTES_ICECAT}"
  echo ""
  echo "  Nota: warehouse_id=4 confirma la configuración usada por el sync."
  echo "  Solo confirma origen exclusivo cuando el feed de Exel incluye un campo"
  echo "  real de almacén; si Exel lo omite, el runner lo reporta durante la corrida."

  if [ -z "$EDAD_HORAS" ] || ! [[ "$EDAD_HORAS" =~ ^[0-9]+$ ]]; then
    ATRASADO=1
  elif [ "$EDAD_HORAS" -ge "$UMBRAL_HORAS" ]; then
    ATRASADO=1
  else
    ATRASADO=0
  fi
}

if ! mostrar_estado; then
  exit 1
fi

if [ "$ATRASADO" -eq 0 ]; then
  echo ""
  echo "✓ La sincronización nocturna está vigente; no se vuelve a consumir Exel."
  exit 0
fi

echo ""
echo "⚠ El catálogo está atrasado o nunca se ha sincronizado."

if [ "$MODO" != "--actualizar-si-atrasado" ]; then
  echo "  Para repararlo: bash deploy/verificar-catalogo.sh --actualizar-si-atrasado"
  exit 2
fi

echo "▶ Ejecutando el pipeline oficial Exel → Icecat → imágenes..."
if ! bash deploy/actualizar-catalogo.sh; then
  echo "✗ El pipeline terminó con incidencias. Revisa el detalle anterior."
  exit 1
fi

echo ""
echo "▶ Verificación posterior"
if ! mostrar_estado; then
  exit 1
fi
if [ "$ATRASADO" -ne 0 ]; then
  echo "✗ La fecha de Exel sigue atrasada después de ejecutar el pipeline."
  exit 1
fi
echo ""
echo "✓ Catálogo reparado y vigente."
