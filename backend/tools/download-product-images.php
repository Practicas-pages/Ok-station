<?php
/**
 * Ok.station — Descarga las imágenes de los productos al SERVIDOR (formato local).
 * -----------------------------------------------------------------------------
 * Las imágenes de Icecat/Exel viven en sus CDNs; este runner las baja a
 * assets/img/products/{product_id}/ y guarda la ruta local en product_images.stored_path.
 * El endpoint (shop/product.php) ya prefiere stored_path sobre url, así que la tienda
 * las sirve LOCAL (más rápido y sin depender del CDN externo).
 *
 * Uso:
 *   php backend/tools/download-product-images.php            # todas las que falten
 *   php backend/tools/download-product-images.php 5          # solo el producto 5
 */
declare(strict_types=1);

require __DIR__ . '/../api/lib/env.php';
load_env(__DIR__ . '/../.env');
$cfg = require __DIR__ . '/../api/config.php';
$d = $cfg['db'];
try {
    $pdo = new PDO(
        "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
        $d['user'], $d['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (Throwable $e) {
    fwrite(STDERR, "✗ No se pudo conectar a la BD: {$e->getMessage()}\n"); exit(1);
}

$onlyId  = isset($argv[1]) ? (int) $argv[1] : 0;
$webRoot = realpath(__DIR__ . '/../..');          // raíz pública del sitio
$pubBase = $webRoot . '/assets/img/products';

$where = "url IS NOT NULL AND url <> '' AND (stored_path IS NULL OR stored_path = '')";
if ($onlyId) $where .= " AND product_id = " . $onlyId;
$rows = $pdo->query("SELECT id, product_id, url FROM product_images WHERE $where ORDER BY product_id, sort_order")->fetchAll();
echo count($rows) . " imagen(es) por descargar" . ($onlyId ? " (producto {$onlyId})" : "") . "\n";

$ok = 0;
foreach ($rows as $r) {
    $pid = (int) $r['product_id'];
    $dir = $pubBase . '/' . $pid;
    if (!is_dir($dir)) @mkdir($dir, 0775, true);

    $ext = 'jpg';
    if (preg_match('/\.(jpe?g|png|gif|webp)(\?|$)/i', $r['url'], $m)) $ext = strtolower($m[1]) === 'jpeg' ? 'jpg' : strtolower($m[1]);
    $fname = $r['id'] . '.' . $ext;

    /* Con 3 intentos: los fallos del CDN suelen ser pasajeros y, sin reintento, el
       producto se quedaba SIN FOTO hasta la siguiente corrida. */
    $data = false; $code = 0;
    for ($try = 1; $try <= 3; $try++) {
        $ch = curl_init($r['url']);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20,
            CURLOPT_FOLLOWLOCATION => true, CURLOPT_USERAGENT => 'OkStation/1.0 (+images)',
        ]);
        $data = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($data !== false && $code === 200 && strlen($data) >= 100) break;
        $data = false;
        if ($try < 3) usleep(400000);                      // 0.4 s y va de nuevo
    }
    if ($data === false) { echo "  ✗ #{$r['id']} HTTP {$code} (3 intentos)\n"; continue; }

    file_put_contents($dir . '/' . $fname, $data);
    $rel = '/assets/img/products/' . $pid . '/' . $fname;
    $pdo->prepare("UPDATE product_images SET stored_path = ? WHERE id = ?")->execute([$rel, $r['id']]);
    $ok++;
    echo "  ✓ #{$r['id']} → {$rel}  (" . round(strlen($data) / 1024) . " KB)\n";
}
echo "Listo: {$ok} descargada(s).\n";
