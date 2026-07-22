<?php
/**
 * POST /backend/api/admin/product-image.php — imágenes de un producto desde el panel.
 * Acciones: add | primary | remove.   Requiere 'shop.catalog_manage'.
 *
 * REGLA DEL NEGOCIO: la imagen la elige SIEMPRE una persona. Este endpoint no busca
 * ni descarga nada por su cuenta; solo guarda la que el administrador ya escogió
 * (las candidatas las propone image-candidates.php). Ninguna fuente publica sola.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

const MAX_IMAGES = 5;   // el mismo tope que aplica el runner (ver 0030)

$user = require_permission('shop.catalog_manage');

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

if ($action === 'add') {
    $url    = trim((string) ($b['url'] ?? ''));
    $source = trim((string) ($b['source'] ?? 'manual'));

    /* La URL se va a pintar tal cual en la tienda, así que solo se admite https.
       Sin esto entrarían `javascript:` o `data:` y sería un XSS servido por
       nosotros mismos. El tope de 500 es el ancho de la columna. */
    if (!preg_match('~^https://[^\s"\'<>]{5,}$~i', $url) || strlen($url) > 500) {
        fail('La imagen debe ser una URL https válida.');
    }
    /* El origen viaja al mismo campo que usa la bitácora ('icecat', 'fabricante:3m'…);
       se acota el juego de caracteres para que no entre nada raro. */
    if (!preg_match('~^[a-z0-9][a-z0-9:_.\-]{0,31}$~i', $source)) fail('Origen inválido.');

    $c = $pdo->prepare('SELECT COUNT(*) FROM product_images WHERE product_id = ?');
    $c->execute([$productId]);
    $total = (int) $c->fetchColumn();
    if ($total >= MAX_IMAGES) fail('El producto ya tiene el máximo de ' . MAX_IMAGES . ' imágenes.');

    $d = $pdo->prepare('SELECT id FROM product_images WHERE product_id = ? AND url = ?');
    $d->execute([$productId, $url]);
    if ($d->fetch()) fail('Esa imagen ya está en el producto.');

    $n = $pdo->prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM product_images WHERE product_id = ?');
    $n->execute([$productId]);
    $sort = (int) $n->fetchColumn();

    /* stored_path queda NULL a propósito: aquí solo se registra la elección. Bajar el
       archivo al servidor es trabajo del runner (download-product-images.php), que
       corre en lote y sabe reintentar. */
    $pdo->prepare(
        'INSERT INTO product_images (product_id, url, source, sort_order, is_primary)
         VALUES (?,?,?,?,0)'
    )->execute([$productId, $url, $source, $sort]);
    $newId = (int) $pdo->lastInsertId();

    /* La primera imagen de un producto es su principal; si ya había, se respeta. */
    if ($total === 0) $fixPrimary($productId, $newId);

    /* Se cierra el ciclo de la bitácora (0036): esta fuente SÍ aportó imagen, y la
       aprobó una persona. Va en try porque es un registro de apoyo — si fallara, la
       imagen ya quedó guardada y no tiene por qué perderse la operación. */
    try {
        $pdo->prepare(
            "INSERT INTO product_enrichment (product_id, source, status, fields, source_url, tried_at, retry_after)
             VALUES (?,?,'ok','imagen',?,NOW(),NULL)
             ON DUPLICATE KEY UPDATE status='ok',
               fields = TRIM(BOTH ',' FROM CONCAT(COALESCE(NULLIF(fields,''),''), ',imagen')),
               source_url = VALUES(source_url), tried_at = NOW(), retry_after = NULL"
        )->execute([$productId, $source, $url]);
    } catch (Throwable $e) { /* la bitácora es informativa, no bloquea */ }

    log_activity((int) $user['id'], 'shop.catalog_manage', 'product_images', $newId, ['add' => $url, 'source' => $source]);
    respond(['ok' => true, 'id' => $newId, 'images' => $total + 1]);
}

if ($action === 'primary') {
    $imageId = (int) ($b['image_id'] ?? 0);
    $q = $pdo->prepare('SELECT id FROM product_images WHERE id = ? AND product_id = ?');
    $q->execute([$imageId, $productId]);
    if (!$q->fetch()) fail('Esa imagen no pertenece al producto.', 404);

    $fixPrimary($productId, $imageId);
    log_activity((int) $user['id'], 'shop.catalog_manage', 'product_images', $imageId, ['primary' => true]);
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

    log_activity((int) $user['id'], 'shop.catalog_manage', 'product_images', $imageId, ['remove' => true]);
    respond(['ok' => true]);
}

fail('Acción no reconocida.');
