<?php
/**
 * GET /backend/api/reviews/google.php
 * Reseñas y calificación de Google (Places API), cacheadas ~24h en `settings`.
 * Público. Si NO hay API key / Place ID configurados, devuelve lista vacía
 * (el front sigue mostrando solo las reseñas propias, sin romperse).
 *
 * Política de Google: máximo 5 reseñas, con atribución y sin almacenarlas
 * de forma permanente → por eso se cachean solo 24h.
 */
require __DIR__ . '/../_bootstrap.php';
only_method('GET');

global $CONFIG;
$key     = (string) ($CONFIG['google_places_api_key'] ?? '');
$placeId = (string) ($CONFIG['google_place_id'] ?? '');

if ($key === '' || $placeId === '') {
    respond(['ok' => true, 'configured' => false, 'rating' => null, 'total' => 0, 'reviews' => []]);
}

const GOOGLE_CACHE_KEY = 'google_reviews_cache';
const GOOGLE_CACHE_TTL = 86400; // 24 h

function gset_get(string $k): ?string {
    $st = db()->prepare('SELECT `value` FROM settings WHERE `key` = ?');
    $st->execute([$k]);
    $r = $st->fetch();
    return $r ? (string) $r['value'] : null;
}
function gset_put(string $k, string $v): void {
    db()->prepare('INSERT INTO settings (`key`,`value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)')
        ->execute([$k, $v]);
}

/* ── Cache fresco ── */
$cachedRaw = gset_get(GOOGLE_CACHE_KEY);
if ($cachedRaw) {
    $c = json_decode($cachedRaw, true);
    if (is_array($c) && isset($c['_at']) && (time() - (int) $c['_at']) < GOOGLE_CACHE_TTL) {
        unset($c['_at']);
        respond($c);
    }
}

/* ── Llamada a Google (Place Details) ── */
$url = 'https://maps.googleapis.com/maps/api/place/details/json?' . http_build_query([
    'place_id'     => $placeId,
    'fields'       => 'rating,user_ratings_total,reviews',
    'reviews_sort' => 'newest',
    'language'     => 'es',
    'key'          => $key,
]);

$raw = false;
if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_SSL_VERIFYPEER => true]);
    $raw = curl_exec($ch);
    curl_close($ch);
}
if ($raw === false) {
    $raw = @file_get_contents($url); // respaldo si cURL no está disponible
}

$data = $raw ? json_decode($raw, true) : null;

/* ── Falla: devuelve cache viejo si existe; si no, vacío ── */
if (!is_array($data) || ($data['status'] ?? '') !== 'OK') {
    if ($cachedRaw) {
        $c = json_decode($cachedRaw, true);
        if (is_array($c)) { unset($c['_at']); respond($c); }
    }
    respond(['ok' => true, 'configured' => true, 'rating' => null, 'total' => 0, 'reviews' => []]);
}

$res = $data['result'] ?? [];
$reviews = [];
foreach (($res['reviews'] ?? []) as $rv) {
    $text = trim((string) ($rv['text'] ?? ''));
    if ($text === '') continue; // omite reseñas sin comentario
    $reviews[] = [
        'author'    => (string) ($rv['author_name'] ?? 'Usuario de Google'),
        'rating'    => (int) ($rv['rating'] ?? 0),
        'comment'   => $text,
        'photo'     => (string) ($rv['profile_photo_url'] ?? ''),
        'time_desc' => (string) ($rv['relative_time_description'] ?? ''),
        'url'       => (string) ($rv['author_url'] ?? ''),
    ];
}

$out = [
    'ok'         => true,
    'configured' => true,
    'rating'     => isset($res['rating']) ? (float) $res['rating'] : null,
    'total'      => (int) ($res['user_ratings_total'] ?? 0),
    'reviews'    => $reviews,
];

gset_put(GOOGLE_CACHE_KEY, json_encode(array_merge($out, ['_at' => time()]), JSON_UNESCAPED_UNICODE));
respond($out);
