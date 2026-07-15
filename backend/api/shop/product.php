<?php
/** GET /backend/api/shop/product.php?id=##  (o ?sku=XXX) — detalle PÚBLICO de un producto.
 *  Solo activos. No expone costo/margen ni datos internos del proveedor.
 */
require __DIR__ . '/../_bootstrap.php';
only_method('GET');

$id  = (int) ($_GET['id'] ?? 0);
$sku = trim((string) ($_GET['sku'] ?? ''));

if ($id > 0) {
    $st = db()->prepare('SELECT * FROM products WHERE id = ? AND is_active = 1 LIMIT 1');
    $st->execute([$id]);
} elseif ($sku !== '') {
    $st = db()->prepare('SELECT * FROM products WHERE sku = ? AND is_active = 1 LIMIT 1');
    $st->execute([$sku]);
} else {
    fail('Falta id o sku.');
}
$p = $st->fetch();
if (!$p) fail('Producto no encontrado.', 404);

/* Imágenes (principal primero). */
$sti = db()->prepare(
    "SELECT COALESCE(stored_path, url) AS src
       FROM product_images WHERE product_id = ?
      ORDER BY is_primary DESC, sort_order ASC, id ASC"
);
$sti->execute([(int) $p['id']]);
$images = array_values(array_filter(array_column($sti->fetchAll(), 'src')));

$specs = !empty($p['specs_json']) ? json_decode((string) $p['specs_json'], true) : null;

respond(['ok' => true, 'product' => [
    'id'          => (int) $p['id'],
    'sku'         => $p['sku'],
    'name'        => $p['name'],
    'description' => $p['description'],
    'brand'       => $p['brand'],
    'category'    => $p['category'],
    'subcategory' => $p['subcategory'],
    'specs'       => $specs,
    'price'       => round((float) $p['price'] * 1.08, 2), // lista con IVA 8% incl
    'stock'       => (int) $p['stock'],
    'available'   => ((int) $p['stock'] > 0),
    'images'      => $images,
]]);
