<?php
/** GET /backend/api/shop/geo-reverse.php?lat=..&lon=.. — dirección aproximada desde
 *  coordenadas (geolocalización del teléfono en el checkout). Requiere sesión: lo usa
 *  el checkout para PRE-LLENAR el formulario de dirección; el cliente siempre puede
 *  corregir lo que salga.
 *
 *  Va por el SERVIDOR (no directo del navegador) por dos razones:
 *   1. El CSP del sitio (connect-src 'self') bloquea llamadas del navegador a terceros.
 *   2. Nominatim (OpenStreetMap) exige User-Agent identificado y ≤1 req/s: aquí se
 *      cachea por coordenada redondeada para respetarlo.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

current_user();   // solo usuarios con sesión (el checkout la exige de todos modos)

$lat = (float) ($_GET['lat'] ?? 0);
$lon = (float) ($_GET['lon'] ?? 0);
if ($lat < 14 || $lat > 33.5 || $lon < -119 || $lon > -86) {
    fail('Coordenadas fuera de México.');   // el negocio solo envía dentro del país
}

/* Caché en disco por coordenada redondeada a ~100 m: la misma casa no se re-consulta. */
$key   = sprintf('%.3f,%.3f', $lat, $lon);
$cacheDir = __DIR__ . '/../../storage/cache/georev';
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0775, true);
$cacheFile = $cacheDir . '/' . md5($key) . '.json';
if (is_file($cacheFile) && filemtime($cacheFile) > time() - 86400 * 30) {
    $j = json_decode((string) file_get_contents($cacheFile), true);
    if (is_array($j)) { respond(['ok' => true, 'address' => $j, 'cached' => true]); }
}

$url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1'
     . '&lat=' . rawurlencode((string) $lat) . '&lon=' . rawurlencode((string) $lon)
     . '&accept-language=es';
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 8,
    CURLOPT_HTTPHEADER     => ['User-Agent: OKstation-checkout/1.0 (station@okdock.mx)'],
]);
$resp = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
if ($resp === false || $code !== 200) {
    fail('No se pudo identificar la dirección; escríbela manualmente.', 502);
}

$j = json_decode((string) $resp, true);
$a = is_array($j) ? ($j['address'] ?? []) : [];

/* Se normaliza al formato de la libreta de direcciones. Nominatim en México suele
   mandar: road, house_number, neighbourhood|suburb (colonia), postcode,
   city|town|village, state. */
$out = [
    'street'   => trim((string) ($a['road'] ?? '')),
    'ext_num'  => trim((string) ($a['house_number'] ?? '')),
    'colonia'  => trim((string) ($a['neighbourhood'] ?? $a['suburb'] ?? $a['quarter'] ?? '')),
    'zip'      => trim((string) ($a['postcode'] ?? '')),
    'city'     => trim((string) ($a['city'] ?? $a['town'] ?? $a['village'] ?? $a['municipality'] ?? '')),
    'state'    => trim((string) ($a['state'] ?? '')),
    'display'  => trim((string) ($j['display_name'] ?? '')),
];

@file_put_contents($cacheFile, json_encode($out, JSON_UNESCAPED_UNICODE));
respond(['ok' => true, 'address' => $out, 'cached' => false]);
