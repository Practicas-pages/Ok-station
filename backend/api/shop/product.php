<?php
/**
 * GET /backend/api/shop/product.php?id=123   (o ?ref=EXEL_REFERENCIA)
 * -----------------------------------------------------------------------------
 * Detalle de un producto de la tienda. Devuelve la info del PROVEEDOR (Exel) +
 * la de ICECAT (ficha técnica e imágenes), tal como pidió el negocio: "al entrar
 * a ver un producto se muestra la información de los proveedores más la de Icecat".
 *
 * Enriquecimiento PEREZOSO: si el producto aún no se ha enriquecido (enriched_at
 * NULL) y hay Icecat configurado, se enriquece UNA vez en esta primera vista y se
 * cachea en la BD; las siguientes vistas ya salen al instante desde la BD (no se
 * llama a Icecat en cada visita → no se quema la cuota).
 *
 * Público (no requiere sesión). Si la tabla `products` aún no existe (migración
 * 0030 sin aplicar), responde 503 con un mensaje claro en vez de romper.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/Icecat.php';
require __DIR__ . '/../lib/ProductEnricher.php';
only_method('GET');

if (!table_has_column('products', 'id')) {
    fail('El catálogo de productos aún no está disponible.', 503);
}

$id  = (int) ($_GET['id'] ?? 0);
$ref = trim((string) ($_GET['ref'] ?? ''));

if ($id <= 0 && $ref === '') fail('Falta el producto (id o ref).', 400);

/* ── Carga del producto ── */
function shop_load_product($id, $ref): ?array
{
    if ($id > 0) {
        $st = db()->prepare('SELECT * FROM products WHERE id = ? AND is_active = 1 LIMIT 1');
        $st->execute([$id]);
    } else {
        $st = db()->prepare("SELECT * FROM products WHERE supplier = 'exel' AND supplier_ref = ? AND is_active = 1 LIMIT 1");
        $st->execute([$ref]);
    }
    $p = $st->fetch(PDO::FETCH_ASSOC);
    return $p ?: null;
}

$p = shop_load_product($id, $ref);
if (!$p) fail('Producto no encontrado.', 404);

/* ── Enriquecimiento perezoso (primera vista) ── */
$enrichInfo = null;
if ($p['enriched_at'] === null && Icecat::available()) {
    $enrichInfo = ProductEnricher::enrich(db(), (int) $p['id']);
    if (!empty($enrichInfo['enriched'])) {
        $p = shop_load_product((int) $p['id'], '') ?? $p;   // recarga con lo nuevo
    }
}

/* ── Imágenes (de product_images; Icecat y/o Exel) ── */
$imgs = [];
try {
    $st = db()->prepare(
        'SELECT url, stored_path, source, is_primary
           FROM product_images WHERE product_id = ?
          ORDER BY is_primary DESC, sort_order ASC LIMIT 5'
    );
    $st->execute([(int) $p['id']]);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
        // Preferir la copia local (stored_path) si ya se descargó; si no, la URL origen.
        $src = trim((string) ($r['stored_path'] ?? '')) !== '' ? $r['stored_path'] : $r['url'];
        if ($src) $imgs[] = ['src' => $src, 'source' => $r['source'], 'is_primary' => (bool) $r['is_primary']];
    }
} catch (Throwable $e) {}

/* ── Ficha técnica (specs_json) ── */
$specs = [];
if (!empty($p['specs_json'])) {
    $sj = json_decode((string) $p['specs_json'], true);
    if (is_array($sj)) $specs = $sj['specs'] ?? $sj;
}

/* ── Respuesta: info del proveedor (Exel) + Icecat ── */
respond([
    'ok' => true,
    'product' => [
        'id'          => (int) $p['id'],
        'sku'         => $p['sku'],
        'ref'         => $p['supplier_ref'],
        'barcode'     => $p['barcode'],
        'name'        => $p['name'],
        'description' => $p['description'],
        'brand'       => $p['brand'],
        'category'    => $p['category'],
        'subcategory' => $p['subcategory'],
        'currency'    => $p['currency'],
        'price'       => (float) $p['price'],   // público SIN IVA (el IVA se aplica por geo en el checkout)
        'stock'       => (int) $p['stock'],
        'supplier'    => $p['supplier'],
        'image_source'=> $p['image_source'],
        'enriched'    => $p['enriched_at'] !== null,
        'images'      => $imgs,
        'specs'       => $specs,   // [{group,name,value}] de Icecat / ficha Exel
    ],
]);
