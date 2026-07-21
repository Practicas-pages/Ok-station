<?php
/** GET /backend/api/shop/categories.php — categorías y subcategorías con productos activos
 *  (para el menú/filtros de la tienda). Devuelve el árbol con conteos.
 */
require __DIR__ . '/../_bootstrap.php';
only_method('GET');

$rows = db()->query(
    "SELECT category, subcategory, COUNT(*) AS n
       FROM products
      WHERE is_active = 1 AND category IS NOT NULL AND category <> ''
      GROUP BY category, subcategory
      ORDER BY category, subcategory"
)->fetchAll();

$tree = [];
foreach ($rows as $r) {
    $c = (string) $r['category'];
    if (!isset($tree[$c])) $tree[$c] = ['name' => $c, 'count' => 0, 'subcategories' => []];
    $tree[$c]['count'] += (int) $r['n'];
    $sub = (string) ($r['subcategory'] ?? '');
    if ($sub !== '') {
        $tree[$c]['subcategories'][] = ['name' => $sub, 'count' => (int) $r['n']];
    }
}

/* Imagen de muestra por categoría (un producto activo de esa categoría que SÍ tenga foto),
   para las tarjetas de "Compra por categoría". Sin esto, el frontend solo tenía cargados
   los primeros productos y casi todas las categorías salían con la caja gris "Imagen".
   MIN() solo sirve para elegir una de forma determinista; cualquier foto de la categoría
   vale como miniatura. */
$imgs = db()->query(
    "SELECT p.category AS c, MIN(COALESCE(pi.stored_path, pi.url)) AS img
       FROM products p
       JOIN product_images pi ON pi.product_id = p.id
      WHERE p.is_active = 1 AND p.category IS NOT NULL AND p.category <> ''
      GROUP BY p.category"
)->fetchAll(PDO::FETCH_KEY_PAIR);
foreach ($tree as $c => &$node) { $node['image'] = $imgs[$c] ?? null; }
unset($node);

respond(['ok' => true, 'categories' => array_values($tree)]);
