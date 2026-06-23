<?php
/**
 * GET /backend/api/reviews/google.php
 * Proxy SERVER-SIDE de las reseñas de Google vía Featurable (gratis, sin tarjeta).
 * El navegador pide a NUESTRO servidor (mismo origen) y el servidor consulta a
 * Featurable. Inmune a CORS, caché del navegador, dominio de prueba, etc.
 * Cacheado ~24h en `settings`. Siempre responde 200 con una lista (vacía si falla).
 *
 * Diagnóstico: añade ?debug=1 para ver por qué falla la conexión saliente.
 */
require __DIR__ . '/../_bootstrap.php';
only_method('GET');

/* ID PÚBLICO del widget de Featurable (no es secreto). */
$WIDGET_ID = '30bf3581-fa31-45bf-b825-63cf9e6bb10e';
$DEBUG = isset($_GET['debug']);

const FEAT_CACHE_KEY = 'featurable_reviews_cache';
const FEAT_TTL = 86400; // 24 h

function feat_get(string $k): ?string {
    $st = db()->prepare('SELECT `value` FROM settings WHERE `key` = ?');
    $st->execute([$k]);
    $r = $st->fetch();
    return $r ? (string) $r['value'] : null;
}
function feat_put(string $k, string $v): void {
    db()->prepare('INSERT INTO settings (`key`,`value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)')
        ->execute([$k, $v]);
}
function feat_date_es(?string $iso): string {
    if (!$iso) return '';
    $ts = strtotime($iso);
    if (!$ts) return '';
    $m = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return $m[(int) date('n', $ts)] . ' ' . date('Y', $ts);
}

/* ── Cache fresco (se omite en modo debug) ── */
$cachedRaw = feat_get(FEAT_CACHE_KEY);
if (!$DEBUG && $cachedRaw) {
    $c = json_decode($cachedRaw, true);
    if (is_array($c) && isset($c['_at']) && (time() - (int) $c['_at']) < FEAT_TTL) {
        unset($c['_at']);
        respond($c);
    }
}

/* ── Consulta a Featurable (server-side) ── */
$url = 'https://api.featurable.com/v2/widgets/' . rawurlencode($WIDGET_ID);
$raw = false;
$httpCode = 0;
$curlErr = '';
$via = '';

$BROWSER_HEADERS = [
    'Accept: application/json, text/plain, */*',
    'Accept-Language: es-MX,es;q=0.9',
    'Origin: https://okstation.mx',
    'Referer: https://okstation.mx/',
];
$BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT      => $BROWSER_UA,
        CURLOPT_HTTPHEADER     => $BROWSER_HEADERS,
        CURLOPT_ENCODING       => '',
    ]);
    $raw = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = (string) curl_error($ch);
    curl_close($ch);
    $via = 'curl';

    /* Reintento sin verificación SSL si el certificado del servidor falla
       (algunos servidores no traen el CA bundle actualizado). */
    if ($raw === false && stripos($curlErr, 'SSL') !== false) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT      => 'OKstation/1.0',
        ]);
        $raw = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = (string) curl_error($ch);
        curl_close($ch);
        $via = 'curl-no-ssl';
    }
}
if ($raw === false) {
    $raw = @file_get_contents($url);
    $via = $via ? $via . '+fgc' : 'fgc';
}

$data = $raw ? json_decode($raw, true) : null;

/* ── Diagnóstico ── */
if ($DEBUG) {
    respond(['ok' => true, 'debug' => [
        'curl_available'  => function_exists('curl_init'),
        'via'             => $via,
        'http_code'       => $httpCode,
        'curl_error'      => $curlErr,
        'raw_len'         => strlen((string) $raw),
        'allow_url_fopen' => (bool) ini_get('allow_url_fopen'),
        'parsed_ok'       => is_array($data),
        'api_success'     => is_array($data) ? ($data['success'] ?? null) : null,
        'is_example'      => is_array($data) ? ($data['isExampleReviews'] ?? null) : null,
        'review_count'    => (is_array($data) && isset($data['reviews']) && is_array($data['reviews'])) ? count($data['reviews']) : 0,
        'top_keys'        => is_array($data) ? array_keys($data) : null,
        'raw_head'        => substr((string) $raw, 0, 500),
    ]]);
}

/* Falla o reseñas de ejemplo → devuelve cache viejo si hay; si no, vacío. */
if (!is_array($data) || empty($data['success']) || !empty($data['isExampleReviews'])) {
    if ($cachedRaw) {
        $c = json_decode($cachedRaw, true);
        if (is_array($c)) { unset($c['_at']); respond($c); }
    }
    respond(['ok' => true, 'reviews' => []]);
}

$reviews = [];
foreach (($data['reviews'] ?? []) as $rv) {
    $a    = is_array($rv['author'] ?? null) ? $rv['author'] : [];
    $rt   = is_array($rv['rating'] ?? null) ? $rv['rating'] : [];
    $text = trim((string) ($rv['originalText'] ?? $rv['text'] ?? ''));
    if ($text === '') continue;
    $reviews[] = [
        'author'    => (string) ($a['name'] ?? 'Usuario de Google'),
        'rating'    => (int) ($rt['value'] ?? 0),
        'comment'   => $text,
        'photo'     => (string) ($a['avatarUrl'] ?? ''),
        'url'       => (string) ($rv['url'] ?? $a['profileUrl'] ?? ''),
        'time_desc' => feat_date_es($rv['publishedAt'] ?? null),
    ];
}

$out = ['ok' => true, 'reviews' => $reviews];
feat_put(FEAT_CACHE_KEY, json_encode(array_merge($out, ['_at' => time()]), JSON_UNESCAPED_UNICODE));
respond($out);
