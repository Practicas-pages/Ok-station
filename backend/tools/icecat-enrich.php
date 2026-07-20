<?php
/**
 * Ok.station — Runner de enriquecimiento con Icecat (CLI, sin dependencias)
 * -----------------------------------------------------------------------------
 * Segunda pasada del pipeline (después del runner de Exel): recorre los productos
 * que aún NO se han enriquecido (products.enriched_at IS NULL) y les baja de Icecat
 * la ficha técnica y las imágenes. Es el "respaldo por lotes" del enriquecimiento
 * perezoso del endpoint: garantiza que TODO el catálogo quede vestido aunque nadie
 * haya abierto el producto todavía.
 *
 * Uso (terminal del sitio):
 *     php backend/tools/icecat-enrich.php            # hasta 200 productos
 *     php backend/tools/icecat-enrich.php 1000       # hasta 1000
 *
 * Idempotente y reanudable: solo toca los que faltan. Pensado para un systemd
 * timer nocturno (referencia: Compustar corre a las 02:15).
 * Requiere: ICECAT_USERNAME (y opcional ICECAT_API_TOKEN) en backend/.env.
 *
 * Solo CLI: quema cuota de Icecat y escribe en la base. Por HTTP quedaría
 * expuesto (el vhost no bloquea backend/tools/).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Solo CLI.\n");
}

require __DIR__ . '/../api/lib/env.php';
load_env(__DIR__ . '/../.env');

/* $CONFIG: usa config.php del servidor si existe; si no, arma lo mínimo del .env. */
$cfgFile = __DIR__ . '/../api/config.php';
if (is_file($cfgFile)) {
    $CONFIG = require $cfgFile;
} else {
    $CONFIG = [
        'db' => [
            'host' => env('DATABASE_HOST', '127.0.0.1'), 'port' => (int) env('DATABASE_PORT', 3306),
            'name' => env('DATABASE_NAME', 'okstation'), 'user' => env('DATABASE_USER', 'root'),
            'pass' => env('DATABASE_PASSWORD', ''), 'charset' => 'utf8mb4',
        ],
        'storage_path' => rtrim((string) env('STORAGE_PATH', __DIR__ . '/../storage'), '/'),
        'icecat' => [
            'username'  => env('ICECAT_USERNAME', ''),
            'api_token' => env('ICECAT_API_TOKEN', ''),
            'lang'      => env('ICECAT_LANG', 'ES'),
        ],
    ];
}
$GLOBALS['CONFIG'] = $CONFIG;   // Icecat.php lo lee como global

require __DIR__ . '/../api/lib/Icecat.php';
require __DIR__ . '/../api/lib/ProductEnricher.php';

if (!Icecat::available()) {
    fwrite(STDERR, "✗ Falta ICECAT_USERNAME en backend/.env. No hay con qué consultar Icecat.\n");
    exit(1);
}

/* Tope por corrida. Sube de 200 a 1000 porque el catálogo real de Exel son ~5500
   productos: a 200 por noche tardaría cuatro semanas en vestirse, y como el
   enriquecimiento en vivo se quitó de las páginas públicas (ocupaba workers de
   PHP-FPM hasta 8 s por producto), este runner es el ÚNICO que trae fichas e
   imágenes. A 1000 por noche el catálogo queda completo en menos de una semana. */
$limit = max(1, min(5000, (int) ($argv[1] ?? 1000)));

$d = $CONFIG['db'];
try {
    $pdo = new PDO(
        "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
        $d['user'], $d['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (Throwable $e) {
    fwrite(STDERR, "✗ No se pudo conectar a la BD: {$e->getMessage()}\n");
    exit(1);
}

/* Pendientes: activos, sin enriquecer, con algo con qué buscar (barcode o marca+sku). */
$rows = $pdo->prepare(
    "SELECT id, barcode, brand, sku FROM products
      WHERE is_active = 1 AND enriched_at IS NULL
        AND (CHAR_LENGTH(COALESCE(barcode,'')) >= 8 OR (COALESCE(brand,'') <> '' AND COALESCE(sku,'') <> ''))
      ORDER BY id ASC LIMIT {$limit}"
);
$rows->execute();
$pend = $rows->fetchAll();

$total = count($pend);
echo "Icecat: {$total} producto(s) por enriquecer (tope {$limit}).\n";

$ok = 0; $sinFicha = 0; $err = 0; $imgs = 0;
foreach ($pend as $i => $p) {
    $r = ProductEnricher::enrich($pdo, (int) $p['id']);
    if (!empty($r['enriched'])) { $ok++; $imgs += (int) $r['images']; $mark = "✓ {$r['images']} img, {$r['specs']} specs"; }
    elseif (($r['reason'] ?? '') === 'no_en_icecat') { $sinFicha++; $mark = "· no está en Icecat"; }
    else { $err++; $mark = "✗ {$r['reason']}"; }
    printf("  [%d/%d] #%d %s\n", $i + 1, $total, (int) $p['id'], $mark);
}

echo "\nListo. Enriquecidos: {$ok} ({$imgs} imágenes) · sin ficha: {$sinFicha} · errores: {$err}\n";
