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
require __DIR__ . '/../lib/BuscadorMarca.php';   // aporta los dominios de marca a la lista blanca
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
    /* true = la eligió una PERSONA en el panel, viendo la foto. Eso releva de la
       lista blanca de dominios (que protege la procedencia frente a un proceso
       automático, no la seguridad) pero NO de nada más: sigue exigiéndose https,
       se sigue rechazando cualquier dirección de red interna, y la imagen se sigue
       validando por tipo, tamaño y peso antes de guardarla.
       Sin esto no se podría elegir ninguna candidata del buscador, que salen de
       sitios distintos cada vez. */
    [$data, $motivo] = ImagenSegura::descargar($url, true);
    if ($data === null) fail($motivo, 422);
    /* Se deduce del dominio real de donde salió, no de lo que diga el cliente.
       Tras la 0037 el valor se guarda tal cual, así que 'fabricante:3m' queda
       registrado como 'fabricante:3m' y no disfrazado de otra cosa. */
    $host   = strtolower((string) parse_url($url, PHP_URL_HOST));
    $origen = 'exel';
    if (str_contains($host, 'icecat') || str_contains($host, 'iceimg'))            $origen = 'icecat';
    elseif (!str_contains($host, 'exeldelnorte'))                                  $origen = 'fabricante:' . preg_replace('/^www\./', '', $host);
    /* La columna de procedencia admite 32 caracteres. Un host largo no debe
       convertir una selección válida en un error SQL difícil de entender. */
    $origen = mb_substr($origen, 0, 32);
    $urlOrigen = $url;
} else {
    fail('Manda una imagen o la dirección de una.', 422);
}

/* ── 2. Comprobar que de verdad es una imagen usable ──────────────────────── */
[$meta, $motivo] = ImagenSegura::validarBytes($data);
if ($meta === null) fail($motivo, 422);

/* ── 3. Guardar en disco y registrar ──────────────────────────────────────── */
$ruta = ImagenSegura::guardar($productId, $data, $meta['ext']);

/* La ruta incluye la huella del contenido. Si la misma fotografía llegó desde
   dos fuentes o se eligió dos veces, se reutiliza la fila existente en vez de
   inflar el contador y mostrar duplicados en la ficha. */
$dup = $pdo->prepare(
    'SELECT id, source FROM product_images
      WHERE product_id = ? AND (stored_path = ? OR (url IS NOT NULL AND url = ?))
      ORDER BY is_primary DESC, id LIMIT 1'
);
$dup->execute([$productId, $ruta, $urlOrigen]);
$existente = $dup->fetch(PDO::FETCH_ASSOC);
if ($existente) {
    if ($principal) {
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE product_images SET is_primary = 0 WHERE product_id = ?')->execute([$productId]);
            $pdo->prepare('UPDATE product_images SET is_primary = 1 WHERE id = ?')->execute([(int) $existente['id']]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            fail('No se pudo actualizar la imagen principal.', 500);
        }
    }
    EnrichLog::registrar($pdo, $productId, $subido ? 'manual' : 'panel:' . (string) $existente['source'], 'ok', [
        'fields'     => 'imagen',
        'source_url' => $urlOrigen,
        'confidence' => 100,
        'detail'     => 'Imagen ya registrada; fue confirmada de nuevo en el panel por '
                      . (string) ($user['name'] ?? $user['email'] ?? 'un administrador'),
    ]);
    respond([
        'ok' => true, 'path' => $ruta, 'width' => $meta['w'], 'height' => $meta['h'],
        'bytes' => $meta['bytes'], 'existing' => true,
        'mensaje' => 'La imagen ya estaba guardada para ' . $prod['name'],
    ]);
}

/* La tabla documenta un máximo de cinco imágenes, pero hasta ahora solo lo
   respetaban los runners; el panel podía insertar una sexta, séptima, etc.
   Se valida también aquí, que es la frontera real de escritura manual. */
$countSt = $pdo->prepare('SELECT COUNT(*) FROM product_images WHERE product_id = ?');
$countSt->execute([$productId]);
$imageCount = (int) $countSt->fetchColumn();
if ($imageCount >= 5) {
    $archivo = dirname(__DIR__, 3) . $ruta;
    if (is_file($archivo)) @unlink($archivo);
    fail('Este producto ya tiene 5 imágenes. Quita una antes de agregar otra.', 409);
}

$pdo->beginTransaction();
try {
    /* Si esta va a ser la principal, se bajan las demás. NO se borra ninguna: la
       foto anterior se conserva por si la nueva resultó peor de lo que parecía en
       la galería, y el trabajador puede volver a elegir. */
    if ($principal) {
        $pdo->prepare('UPDATE product_images SET is_primary = 0 WHERE product_id = ?')->execute([$productId]);
    }
    /* La procedencia REAL, ahora que se puede. Antes source era ENUM('icecat','exel')
       y una foto subida a mano había que guardarla como 'exel', mintiendo sobre su
       origen — justo el dato que hay que poder auditar después. La 0037 de ZequiDev
       lo pasó a VARCHAR(32) con el mismo criterio que product_enrichment.source,
       así que ambas tablas ya hablan el mismo idioma y se pueden cruzar. */
    $pdo->prepare(
        'INSERT INTO product_images (product_id, url, stored_path, source, sort_order, is_primary)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([$productId, $urlOrigen, $ruta, $origen, $imageCount, $principal ? 1 : 0]);

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    /* La copia en disco ocurre antes que la transacción SQL. Si la fila no pudo
       registrarse, se retira ese archivo huérfano; la ruta siempre fue generada
       por ImagenSegura dentro de assets/img/products/{id}. */
    $archivo = dirname(__DIR__, 3) . $ruta;
    $usada = $pdo->prepare('SELECT COUNT(*) FROM product_images WHERE stored_path = ?');
    $usada->execute([$ruta]);
    if ((int) $usada->fetchColumn() === 0 && is_file($archivo)) @unlink($archivo);
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
