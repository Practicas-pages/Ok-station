<?php
/**
 * GET /backend/api/reviews/google.php
 * Proxy SERVER-SIDE de las reseñas de Google vía Featurable (gratis, sin tarjeta).
 * El navegador pide a NUESTRO servidor (mismo origen) y el servidor consulta a
 * Featurable. Así es inmune a CORS, caché del navegador, dominio de prueba, etc.
 * Cacheado ~24h en `settings`. Siempre responde 200 con una lista (vacía si falla).
 */
require __DIR__ . '/../_bootstrap.php';
only_method('GET');

/* ID PÚBLICO del widget de Featurable (no es secreto). */
$WIDGET_ID = '30bf3581-fa31-45bf-b825-63cf9e6bb10e';

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

/* ── Cache fresco ── */
$cachedRaw = feat_get(FEAT_CACHE_KEY);
if ($cachedRaw) {
    $c = json_decode($cachedRaw, true);
    if (is_array($c) && isset($c['_at']) && (time() - (int) $c['_at']) < FEAT_TTL) {
        unset($c['_at']);
        respond($c);
    }
}

/* ── Consulta a Featurable (server-side) ── */
$url = 'https://api.featurable.com/v2/widgets/' . rawurlencode($WIDGET_ID);
$raw = false;
if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT      => 'OKstation/1.0',
    ]);
    $raw = curl_exec($ch);
    curl_close($ch);
}
if ($raw === false) {
    $raw = @file_get_contents($url);
}

$data = $raw ? json_decode($raw, true) : null;

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
    $text = trim((string) ($rv['originalText'] ?? $rv['text'] ?? '')); // prioriza idioma original
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
