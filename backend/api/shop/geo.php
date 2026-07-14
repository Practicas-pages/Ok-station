<?php
/** GET /backend/api/shop/geo.php — ubicación del cliente + tasa de IVA aplicable.
 *  Público (no requiere sesión). La página lo llama al cargar para mostrar el IVA
 *  correcto. En LOCAL puedes simular un estado con ?sim_state=Jalisco (solo si
 *  APP_ENV != production). El IVA definitivo se confirma con el domicilio en el checkout.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/Geo.php';
only_method('GET');

$sim = isset($_GET['sim_state']) ? (string) $_GET['sim_state'] : null;
$geo = Geo::detect($_SERVER, $sim);

respond([
    'ok'       => true,
    'country'  => $geo['country'],
    'state'    => $geo['state'],
    'is_bc'    => $geo['is_bc'],
    'iva_rate' => $geo['iva_rate'],          // 0.08 (BC) | 0.16 (nacional)
    'iva_pct'  => (int) round($geo['iva_rate'] * 100),
    'source'   => $geo['source'],            // sim | cdn | ip | default
]);
