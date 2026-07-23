<?php
/**
 * GET /backend/api/admin/product-detail.php?id=N — ficha COMPLETA de un producto.
 * Devuelve los datos del catálogo, sus imágenes, la ficha técnica agrupada y la
 * bitácora de enriquecimiento (qué fuente se consultó y cómo le fue). Requiere 'shop.view'.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = require_permission('shop.view');

$id = (int) ($_GET['id'] ?? 0);
if ($id <= 0) fail('Producto inválido.');

$st = db()->prepare('SELECT * FROM products WHERE id = ?');
$st->execute([$id]);
$p = $st->fetch();
if (!$p) fail('El producto no existe.', 404);

/* Misma resolución que la tienda: copia local si existe, si no la URL de origen. */
$sti = db()->prepare(
    'SELECT id, url, stored_path, COALESCE(stored_path, url) AS src,
            source, sort_order, is_primary
       FROM product_images WHERE product_id = ?
      ORDER BY is_primary DESC, sort_order ASC, id ASC'
);
$sti->execute([$id]);
$images = $sti->fetchAll();
foreach ($images as &$im) {
    $im['is_primary'] = (int) $im['is_primary'];
    $im['local']      = !empty($im['stored_path']);
}
unset($im);

/* La ficha de Icecat llega como {"specs":[{group,name,value},…]}. Se agrupa AQUÍ y
   no en el navegador: la vista solo debe pintar, no interpretar. */
$byGroup = [];
if (!empty($p['specs_json'])) {
    $raw = json_decode((string) $p['specs_json'], true);
    foreach (($raw['specs'] ?? []) as $s) {
        $g = trim((string) ($s['group'] ?? '')) ?: 'Otras características';
        $byGroup[$g][] = [
            'name'  => (string) ($s['name'] ?? ''),
            'value' => is_scalar($s['value'] ?? null) ? (string) $s['value'] : '',
        ];
    }
}
$specs = [];
foreach ($byGroup as $g => $items) $specs[] = ['group' => $g, 'items' => $items];

/* specs_json ya viene desglosado arriba: mandarlo otra vez solo engordaría la
   respuesta (son varios KB por producto). */
unset($p['specs_json']);

/* Bitácora de enriquecimiento (0036). La tabla es nueva: si un entorno todavía no
   corrió la migración, la ficha debe abrir igual en vez de tronar. */
$enrichment = [];
try {
    $ste = db()->prepare(
        'SELECT source, status, fields, source_url, confidence, detail, tried_at, retry_after
           FROM product_enrichment WHERE product_id = ? ORDER BY tried_at DESC'
    );
    $ste->execute([$id]);
    $enrichment = $ste->fetchAll();
} catch (Throwable $e) {
    $enrichment = [];
}

foreach (['stock', 'is_active', 'is_papeleria'] as $k) $p[$k] = (int) $p[$k];

log_activity((int) $user['id'], 'shop.view', 'products', $id, []);

respond([
    'ok'         => true,
    'product'    => $p,
    'images'     => $images,
    'specs'      => $specs,
    'enrichment' => $enrichment,
    'max_images' => 5,
]);
