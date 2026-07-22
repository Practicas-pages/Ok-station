<?php
/**
 * POST /backend/api/admin/product-image.php — administra las imágenes que un producto
 * YA TIENE. Acciones: primary | remove.
 *
 * Deliberadamente NO agrega imágenes: de eso se encarga image-set.php, que además
 * las descarga a nuestro servidor. Aquí vive solo lo que aquél no cubre —
 * cambiar cuál es la principal y quitar una que no debía publicarse.
 *
 * Permiso 'shop.update_status', el mismo que usa image-set.php: quien puede ponerle
 * foto a un producto puede corregirla.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

$user = require_permission('shop.update_status');

$b         = body();
$action    = (string) ($b['action'] ?? '');
$productId = (int) ($b['product_id'] ?? 0);

if ($productId <= 0) fail('Producto inválido.');
$st = db()->prepare('SELECT id FROM products WHERE id = ?');
$st->execute([$productId]);
if (!$st->fetch()) fail('El producto no existe.', 404);

$pdo = db();

/** Deja exactamente UNA imagen principal: la indicada, o la primera que quede. */
$fixPrimary = function (int $productId, ?int $preferId = null) use ($pdo) {
    $pdo->prepare('UPDATE product_images SET is_primary = 0 WHERE product_id = ?')->execute([$productId]);
    if ($preferId) {
        $pdo->prepare('UPDATE product_images SET is_primary = 1 WHERE id = ? AND product_id = ?')
            ->execute([$preferId, $productId]);
        return;
    }
    $pdo->prepare(
        'UPDATE product_images SET is_primary = 1
          WHERE product_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1'
    )->execute([$productId]);
};

if ($action === 'primary') {
    $imageId = (int) ($b['image_id'] ?? 0);
    $q = $pdo->prepare('SELECT id FROM product_images WHERE id = ? AND product_id = ?');
    $q->execute([$imageId, $productId]);
    if (!$q->fetch()) fail('Esa imagen no pertenece al producto.', 404);

    $fixPrimary($productId, $imageId);
    log_activity((int) $user['id'], 'shop.update_status', 'product_images', $imageId, ['primary' => true]);
    respond(['ok' => true]);
}

if ($action === 'remove') {
    $imageId = (int) ($b['image_id'] ?? 0);
    $q = $pdo->prepare('SELECT id, is_primary, source FROM product_images WHERE id = ? AND product_id = ?');
    $q->execute([$imageId, $productId]);
    $img = $q->fetch();
    if (!$img) fail('Esa imagen no pertenece al producto.', 404);

    $pdo->prepare('DELETE FROM product_images WHERE id = ?')->execute([$imageId]);
    /* Si se borró la principal, otra tiene que tomar su lugar: sin principal, la
       tienda se queda sin miniatura aunque el producto tenga fotos. */
    if ((int) $img['is_primary'] === 1) $fixPrimary($productId, null);

    /* Si esa fuente ya no aporta NINGUNA imagen, hay que reabrirla en la bitácora.
       Si se quedara en 'ok' con retry_after NULL, ningún runner volvería a mirar
       este producto nunca — que es exactamente el callejón sin salida que la 0036
       vino a arreglar. Se devuelve a la cola con la misma política de 30 días. */
    try {
        $rest = $pdo->prepare('SELECT COUNT(*) FROM product_images WHERE product_id = ? AND source = ?');
        $rest->execute([$productId, $img['source']]);
        if ((int) $rest->fetchColumn() === 0) {
            $pdo->prepare(
                "UPDATE product_enrichment
                    SET fields = NULLIF(TRIM(BOTH ',' FROM REPLACE(CONCAT(',', COALESCE(fields,''), ','), ',imagen,', ',')), ''),
                        status = 'sin_datos',
                        retry_after = DATE_ADD(NOW(), INTERVAL 30 DAY)
                  WHERE product_id = ? AND source = ?"
            )->execute([$productId, $img['source']]);
        }
    } catch (Throwable $e) { /* la bitácora es de apoyo: no debe impedir el borrado */ }

    log_activity((int) $user['id'], 'shop.update_status', 'product_images', $imageId, ['remove' => true]);
    respond(['ok' => true]);
}

fail('Acción no reconocida.');
