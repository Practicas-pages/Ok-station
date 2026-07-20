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

respond(['ok' => true, 'categories' => array_values($tree)]);
