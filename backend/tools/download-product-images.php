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
 *   php backend/tools/download-product-images.php --limit=500 # lote para el cron
 *
 * Solo CLI: descarga archivos remotos y escribe bajo el webroot. Por HTTP
 * quedaría expuesto (el vhost no bloquea backend/tools/).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Solo CLI.\n");
}

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

$onlyId = 0;
$limit  = 0;
foreach (array_slice($argv, 1) as $arg) {
    if (preg_match('/^--limit=(\d+)$/', $arg, $m)) {
        $limit = (int) $m[1];
    } elseif (ctype_digit($arg) && (int) $arg > 0 && $onlyId === 0) {
        $onlyId = (int) $arg;
    } else {
        fwrite(STDERR, "Uso: php download-product-images.php [product_id] [--limit=N]\n");
        exit(2);
    }
}
$webRoot = realpath(__DIR__ . '/../..');          // raíz pública del sitio
$pubBase = $webRoot . '/assets/img/products';

$where = "i.url IS NOT NULL AND i.url <> ''
          AND (i.stored_path IS NULL OR i.stored_path = '')
          AND p.is_active = 1";
if ($onlyId) $where .= " AND i.product_id = " . $onlyId;
$total = (int) $pdo->query(
    "SELECT COUNT(*) FROM product_images i
      JOIN products p ON p.id = i.product_id WHERE {$where}"
)->fetchColumn();
$sql = "SELECT i.id, i.product_id, i.url FROM product_images i
         JOIN products p ON p.id = i.product_id
        WHERE {$where}
        ORDER BY i.is_primary DESC, i.product_id, i.sort_order";
if ($limit > 0) $sql .= " LIMIT " . $limit;
$rows = $pdo->query($sql)->fetchAll();
echo "{$total} imagen(es) activa(s) pendientes";
if ($onlyId) echo " (producto {$onlyId})";
if ($limit > 0 && $total > count($rows)) echo "; procesando lote de " . count($rows);
echo "\n";

$ok = 0; $failed = 0;
foreach ($rows as $r) {
    $pid = (int) $r['product_id'];
    $dir = $pubBase . '/' . $pid;
    if (!is_dir($dir)) @mkdir($dir, 0775, true);

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
    if ($data === false) {
        $failed++;
        echo "  ✗ #{$r['id']} HTTP {$code} (3 intentos)\n";
        continue;
    }

    /* La extensión de la URL no es confiable. Se valida el contenido real antes de
       publicarlo para no guardar una página HTML de error con nombre .jpg. */
    $info = @getimagesizefromstring($data);
    $mime = (string) ($info['mime'] ?? '');
    $exts = ['image/jpeg'=>'jpg', 'image/png'=>'png', 'image/gif'=>'gif', 'image/webp'=>'webp'];
    if (!$info || !isset($exts[$mime]) || strlen($data) > 8 * 1024 * 1024) {
        $failed++;
        echo "  ✗ #{$r['id']} no es una imagen válida o excede 8 MB\n";
        continue;
    }
    $fname = $r['id'] . '.' . $exts[$mime];
    $target = $dir . '/' . $fname;
    $tmp = $target . '.part';
    if (file_put_contents($tmp, $data, LOCK_EX) === false || !@rename($tmp, $target)) {
        @unlink($tmp);
        $failed++;
        echo "  ✗ #{$r['id']} no se pudo guardar en disco\n";
        continue;
    }
    $rel = '/assets/img/products/' . $pid . '/' . $fname;
    $pdo->prepare("UPDATE product_images SET stored_path = ? WHERE id = ?")->execute([$rel, $r['id']]);
    $ok++;
    echo "  ✓ #{$r['id']} → {$rel}  (" . round(strlen($data) / 1024) . " KB)\n";
}
echo "Listo: {$ok} descargada(s), {$failed} fallida(s), " . max(0, $total - $ok) . " pendiente(s).\n";
/* Un CDN aislado no debe echar abajo todo el catálogo. Solo se marca fallo si había
   trabajo y el lote completo resultó imposible, para que el cron sí lo reporte. */
if ($rows && $ok === 0 && $failed > 0) exit(1);
