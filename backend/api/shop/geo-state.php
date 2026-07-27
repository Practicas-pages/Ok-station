<?php
/** GET /backend/api/shop/geo-state.php?lat=..&lon=.. — SOLO el estado (y su IVA)
 *  desde coordenadas del navegador. Público (no requiere sesión): lo llama la
 *  tienda al cargar cuando el permiso de ubicación YA está concedido, para afinar
 *  el estado que geo.php estimó por IP. El IVA definitivo se confirma con el
 *  domicilio en el checkout, igual que siempre.
 *
 *  PRIVACIDAD Y CUOTA: las coordenadas se REDONDEAN a 2 decimales (~1 km) antes
 *  de tocar Nominatim y de cachear — para saber el ESTADO sobra, no se guarda ni
 *  se consulta la ubicación fina de nadie, y la caché por celda (30 días) respeta
 *  el límite de 1 req/s de Nominatim aunque el endpoint sea público.
 *  (geo-reverse.php sí es fino y por eso exige sesión: prellenar una dirección
 *  necesita calle y número; esto solo necesita el estado.)
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/Geo.php';
only_method('GET');

$lat = round((float) ($_GET['lat'] ?? 0), 2);
$lon = round((float) ($_GET['lon'] ?? 0), 2);
if ($lat < 14 || $lat > 33.5 || $lon < -119 || $lon > -86) {
    fail('Coordenadas fuera de México.');   // la tienda solo vende dentro del país
}

/** Respuesta con la MISMA forma que geo.php para que la página use una u otra igual. */
function geo_state_respond(string $state): void {
    respond([
        'ok'       => true,
        'country'  => 'MX',
        'state'    => $state,
        'city'     => '',
        'zip'      => '',
        'is_bc'    => Geo::isBC($state),
        'iva_rate' => Geo::ivaForState($state),
        'iva_pct'  => (int) round(Geo::ivaForState($state) * 100),
        'source'   => 'gps',
    ]);
}

/* Caché en disco por celda de ~1 km: estados no cambian, 30 días de vida. */
$key      = sprintf('%.2f,%.2f', $lat, $lon);
$cacheDir = __DIR__ . '/../../storage/cache/geostate';
if (!is_dir($cacheDir)) @mkdir($cacheDir, 0775, true);
$cacheFile = $cacheDir . '/' . md5($key) . '.json';
if (is_file($cacheFile) && filemtime($cacheFile) > time() - 86400 * 30) {
    $j = json_decode((string) file_get_contents($cacheFile), true);
    if (is_array($j) && ($j['state'] ?? '') !== '') { geo_state_respond((string) $j['state']); }
}

/* zoom=5 = nivel estado: Nominatim no baja a calle y la respuesta es más ligera. */
$url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=5'
     . '&lat=' . rawurlencode((string) $lat) . '&lon=' . rawurlencode((string) $lon)
     . '&accept-language=es';
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 8,
    CURLOPT_HTTPHEADER     => ['User-Agent: OKstation-tienda/1.0 (station@okdock.mx)'],
]);
$resp = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
if ($resp === false || $code !== 200) {
    fail('No se pudo identificar el estado.', 502);
}

$j = json_decode((string) $resp, true);
$state = trim((string) (is_array($j) ? (($j['address'] ?? [])['state'] ?? '') : ''));
if ($state === '') fail('No se pudo identificar el estado.', 502);

@file_put_contents($cacheFile, json_encode(['state' => $state], JSON_UNESCAPED_UNICODE));
geo_state_respond($state);
