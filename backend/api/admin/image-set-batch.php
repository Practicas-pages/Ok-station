<?php
declare(strict_types=1);
/**
 * POST /backend/api/admin/image-set-batch.php
 * Guarda de una sola vez hasta cinco fotografías elegidas por una persona.
 *
 * Body JSON:
 * {
 *   "product_id": 123,
 *   "images": [{"url":"https://..."}, ...],
 *   "primary_url": "https://..."
 * }
 *
 * Las descargas se validan antes de escribir la galería. La transacción SQL
 * evita dejar solo una parte del lote si alguna inserción falla.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/BuscadorMarca.php';
require __DIR__ . '/../lib/ImagenSegura.php';
require __DIR__ . '/../lib/EnrichLog.php';
only_method('POST');

$user = require_permission('shop.update_status');
$b = body();
$productId = (int) ($b['product_id'] ?? 0);
$rawImages = is_array($b['images'] ?? null) ? $b['images'] : [];
$primaryUrl = trim((string) ($b['primary_url'] ?? ''));

if ($productId <= 0) fail('Falta el producto.', 422);
if (!$rawImages) fail('Selecciona al menos una fotografía.', 422);
if (count($rawImages) > 5) fail('Solo puedes seleccionar hasta 5 fotografías.', 422);

$urls = [];
foreach ($rawImages as $item) {
    $url = trim((string) (is_array($item) ? ($item['url'] ?? '') : $item));
    if ($url === '' || isset($urls[$url])) continue;
    $urls[$url] = true;
}
$urls = array_keys($urls);
if (!$urls) fail('Las fotografías seleccionadas no tienen una dirección válida.', 422);
if ($primaryUrl === '' || !isset(array_flip($urls)[$primaryUrl])) $primaryUrl = $urls[0];

$pdo = db();
$st = $pdo->prepare('SELECT id, name FROM products WHERE id = ? LIMIT 1');
$st->execute([$productId]);
$product = $st->fetch(PDO::FETCH_ASSOC);
if (!$product) fail('Ese producto no existe.', 404);

$st = $pdo->prepare(
    'SELECT id, url, stored_path, source, sort_order, is_primary
       FROM product_images WHERE product_id = ?
      ORDER BY is_primary DESC, sort_order, id'
);
$st->execute([$productId]);
$existing = $st->fetchAll(PDO::FETCH_ASSOC);
if (count($existing) >= 5) fail('Este producto ya tiene 5 imágenes.', 409);

$byUrl = [];
$byPath = [];
foreach ($existing as $img) {
    if (!empty($img['url'])) $byUrl[(string) $img['url']] = $img;
    if (!empty($img['stored_path'])) $byPath[(string) $img['stored_path']] = $img;
}

/** Procedencia verificable a partir del host real, nunca del texto del navegador. */
function batch_image_source(string $url): string
{
    $host = strtolower((string) parse_url($url, PHP_URL_HOST));
    if (str_contains($host, 'icecat') || str_contains($host, 'iceimg')) return 'icecat';
    if (str_contains($host, 'exeldelnorte')) return 'exel';
    return mb_substr('fabricante:' . preg_replace('/^www\./', '', $host), 0, 32);
}

$prepared = [];
$newPaths = [];
$errors = [];
foreach ($urls as $index => $url) {
    if (isset($byUrl[$url])) {
        $prepared[] = ['url' => $url, 'existing_id' => (int) $byUrl[$url]['id']];
        continue;
    }

    [$bytes, $reason] = ImagenSegura::descargar($url, true);
    if ($bytes === null) {
        $errors[] = 'Imagen ' . ($index + 1) . ': ' . $reason;
        break;
    }
    [$meta, $reason] = ImagenSegura::validarBytes($bytes);
    if ($meta === null) {
        $errors[] = 'Imagen ' . ($index + 1) . ': ' . $reason;
        break;
    }

    $path = ImagenSegura::guardar($productId, $bytes, (string) $meta['ext']);
    if (isset($byPath[$path])) {
        $prepared[] = ['url' => $url, 'existing_id' => (int) $byPath[$path]['id']];
        continue;
    }

    /* Dos URLs distintas pueden entregar exactamente el mismo archivo. */
    $sameBatch = null;
    foreach ($prepared as $prev) {
        if (($prev['path'] ?? null) === $path) { $sameBatch = $prev; break; }
    }
    if ($sameBatch) {
        $prepared[] = ['url' => $url, 'duplicate_of_url' => $sameBatch['url']];
        continue;
    }

    $prepared[] = [
        'url' => $url,
        'path' => $path,
        'source' => batch_image_source($url),
    ];
    $newPaths[$path] = true;
}

if ($errors) {
    foreach (array_keys($newPaths) as $path) {
        $file = dirname(__DIR__, 3) . $path;
        if (is_file($file)) @unlink($file);
    }
    fail(implode(' ', $errors), 422);
}

$newCount = count(array_filter($prepared, fn($p) => isset($p['path'])));
if (count($existing) + $newCount > 5) {
    foreach (array_keys($newPaths) as $path) {
        $file = dirname(__DIR__, 3) . $path;
        if (is_file($file)) @unlink($file);
    }
    fail('La selección supera el máximo de 5 imágenes del producto.', 409);
}

$inserted = 0;
$reused = 0;
$urlToId = [];
$pdo->beginTransaction();
try {
    /* Bloquea el producto para que dos administradores no superen juntos el tope. */
    $lock = $pdo->prepare('SELECT id FROM products WHERE id = ? FOR UPDATE');
    $lock->execute([$productId]);
    $count = $pdo->prepare('SELECT COUNT(*) FROM product_images WHERE product_id = ?');
    $count->execute([$productId]);
    $currentCount = (int) $count->fetchColumn();
    if ($currentCount + $newCount > 5) {
        throw new RuntimeException('La galería cambió mientras seleccionabas. Actualízala e inténtalo de nuevo.');
    }

    $nextOrder = $currentCount;
    $ins = $pdo->prepare(
        'INSERT INTO product_images
            (product_id, url, stored_path, source, sort_order, is_primary)
         VALUES (?, ?, ?, ?, ?, 0)'
    );
    foreach ($prepared as $item) {
        if (isset($item['existing_id'])) {
            $urlToId[$item['url']] = (int) $item['existing_id'];
            $reused++;
            continue;
        }
        if (isset($item['duplicate_of_url'])) {
            $urlToId[$item['url']] = $urlToId[$item['duplicate_of_url']] ?? 0;
            $reused++;
            continue;
        }
        $ins->execute([$productId, $item['url'], $item['path'], $item['source'], $nextOrder++]);
        $urlToId[$item['url']] = (int) $pdo->lastInsertId();
        $inserted++;
    }

    $primaryId = (int) ($urlToId[$primaryUrl] ?? 0);
    if ($primaryId > 0) {
        $pdo->prepare('UPDATE product_images SET is_primary = 0 WHERE product_id = ?')->execute([$productId]);
        $pdo->prepare('UPDATE product_images SET is_primary = 1 WHERE id = ? AND product_id = ?')
            ->execute([$primaryId, $productId]);
    }
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    foreach (array_keys($newPaths) as $path) {
        $used = $pdo->prepare('SELECT COUNT(*) FROM product_images WHERE stored_path = ?');
        $used->execute([$path]);
        $file = dirname(__DIR__, 3) . $path;
        if ((int) $used->fetchColumn() === 0 && is_file($file)) @unlink($file);
    }
    $message = $e instanceof RuntimeException
        ? $e->getMessage()
        : 'No se pudo guardar el conjunto de fotografías.';
    fail($message, 409);
}

EnrichLog::registrar($pdo, $productId, 'panel:lote', 'ok', [
    'fields' => 'imagen',
    'source_url' => $primaryUrl,
    'confidence' => 100,
    'detail' => $inserted . ' imagen(es) agregadas y ' . $reused
              . ' reutilizadas; selección confirmada por '
              . (string) ($user['name'] ?? $user['email'] ?? 'un administrador'),
]);
log_activity((int) $user['id'], 'shop.images_batch_added', 'product_images', $productId, [
    'added' => $inserted,
    'reused' => $reused,
    'primary_url' => $primaryUrl,
]);

respond([
    'ok' => true,
    'added' => $inserted,
    'reused' => $reused,
    'total' => count($existing) + $inserted,
    'message' => $inserted . ' fotografía(s) agregadas a ' . $product['name'] . '.',
]);
