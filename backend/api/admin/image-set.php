<?php
/**
 * POST /backend/api/admin/image-set.php — el trabajador ELIGE la foto de un producto.
 * -----------------------------------------------------------------------------
 * Complementa la vista de Catálogo (catalog.php, solo lectura): ahí se ve a qué
 * productos les faltan fotos, y aquí se les pone una.
 *
 * Dos formas de mandarla, y las dos acaban igual (archivo propio en nuestro
 * servidor, nunca un enlace prestado):
 *   · product_id + url    → una candidata de una fuente autorizada (Exel, Icecat…)
 *   · product_id + file   → un archivo subido a mano. Esta es la que GARANTIZA que
 *                           cualquier producto pueda tener foto: si el proveedor no
 *                           la tiene, ni Icecat, ni la marca, alguien la toma en la
 *                           tienda y la sube. No depende de que exista en internet.
 *
 * Se descarga y se guarda SIEMPRE en assets/img/products/{id}/, nunca se deja el
 * enlace externo: si Icecat bloquea el hotlinking o el CDN de Exel se cae, el
 * producto se queda sin foto en plena venta. Es justo el riesgo que ZequiDev señaló
 * al separar "registradas" de "descargadas" en la vista de catálogo.
 *
 * Permiso: shop.update_status (el mismo que ya mueve pedidos de la tienda).
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/ImagenSegura.php';
require __DIR__ . '/../lib/EnrichLog.php';
only_method('POST');

$user = require_permission('shop.update_status');

$productId = (int) ($_POST['product_id'] ?? 0);
$url       = trim((string) ($_POST['url'] ?? ''));
$principal = ($_POST['primary'] ?? '1') !== '0';

if ($productId <= 0) fail('Falta el producto.', 422);

$pdo = db();
$st = $pdo->prepare('SELECT id, name, brand FROM products WHERE id = ? LIMIT 1');
$st->execute([$productId]);
$prod = $st->fetch(PDO::FETCH_ASSOC);
if (!$prod) fail('Ese producto no existe.', 404);

/* ── 1. Conseguir los bytes, venga de donde venga ─────────────────────────── */
$subido = isset($_FILES['file']) && is_array($_FILES['file']) && (int) $_FILES['file']['error'] === UPLOAD_ERR_OK;

if ($subido) {
    /* is_uploaded_file: sin esto, un product_id manipulado podría hacer que el
       servidor leyera un archivo cualquiera del disco y lo publicara como foto. */
    if (!is_uploaded_file($_FILES['file']['tmp_name'])) fail('Archivo no válido.', 422);
    $data   = (string) file_get_contents($_FILES['file']['tmp_name']);
    $origen = 'manual';
    $urlOrigen = null;
} elseif ($url !== '') {
    [$data, $motivo] = ImagenSegura::descargar($url);
    if ($data === null) fail($motivo, 422);
    $origen = 'exel';   // product_images.source solo admite 'icecat'|'exel'; ver nota abajo
    if (stripos($url, 'icecat') !== false || stripos($url, 'iceimg') !== false) $origen = 'icecat';
    $urlOrigen = $url;
} else {
    fail('Manda una imagen o la dirección de una.', 422);
}

/* ── 2. Comprobar que de verdad es una imagen usable ──────────────────────── */
[$meta, $motivo] = ImagenSegura::validarBytes($data);
if ($meta === null) fail($motivo, 422);

/* ── 3. Guardar en disco y registrar ──────────────────────────────────────── */
$ruta = ImagenSegura::guardar($productId, $data, $meta['ext']);

$pdo->beginTransaction();
try {
    /* Si esta va a ser la principal, se bajan las demás. NO se borra ninguna: la
       foto anterior se conserva por si la nueva resultó peor de lo que parecía en
       la galería, y el trabajador puede volver a elegir. */
    if ($principal) {
        $pdo->prepare('UPDATE product_images SET is_primary = 0 WHERE product_id = ?')->execute([$productId]);
    }
    /* 'manual' no cabe en el ENUM de product_images.source (icecat|exel) y ampliar
       ese ENUM tocaría una tabla viva. La procedencia REAL queda en la bitácora de
       enriquecimiento, que para eso se hizo y sí distingue el origen. */
    $pdo->prepare(
        'INSERT INTO product_images (product_id, url, stored_path, source, sort_order, is_primary)
         VALUES (?, ?, ?, ?, 0, ?)'
    )->execute([$productId, $urlOrigen, $ruta, $origen === 'icecat' ? 'icecat' : 'exel', $principal ? 1 : 0]);

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo guardar la imagen.', 500);
}

/* Queda asentado QUIÉN la puso y de dónde salió. Estado 'ok' con confianza 100:
   la eligió una persona mirándola, que es la única fuente que no puede equivocarse
   de variante. Es exactamente el punto de que este flujo lo revise un humano. */
EnrichLog::registrar($pdo, $productId, $subido ? 'manual' : 'panel:' . $origen, 'ok', [
    'fields'     => 'imagen',
    'source_url' => $urlOrigen,
    'confidence' => 100,
    'detail'     => 'Elegida en el panel por ' . (string) ($user['name'] ?? $user['email'] ?? 'un administrador'),
]);

respond([
    'ok'      => true,
    'path'    => $ruta,
    'width'   => $meta['w'],
    'height'  => $meta['h'],
    'bytes'   => $meta['bytes'],
    'mensaje' => 'Imagen guardada para ' . $prod['name'],
]);
