<?php
/** GET /backend/api/shop/brands.php — marcas con productos activos (para el panel de filtros).
 *  Devuelve { ok, brands:[{name, count}] } ordenadas por cantidad (las más surtidas arriba).
 *
 *  Va aparte de categories.php a propósito: el panel de filtros se abre BAJO DEMANDA,
 *  así que esta consulta no pesa en la carga inicial de la tienda.
 *  Acepta ?category= para acotar las marcas a la categoría que se está viendo.
 */
require __DIR__ . '/../_bootstrap.php';
only_method('GET');

$category = trim((string) ($_GET['category'] ?? ''));

$where  = ["is_active = 1", "brand IS NOT NULL", "brand <> ''"];
$params = [];
if ($category !== '') { $where[] = 'category = ?'; $params[] = $category; }

$st = db()->prepare(
    'SELECT brand AS name, COUNT(*) AS count
       FROM products WHERE ' . implode(' AND ', $where) . '
      GROUP BY brand ORDER BY count DESC, brand ASC'
);
$st->execute($params);

$brands = array_map(
    fn($r) => ['name' => (string) $r['name'], 'count' => (int) $r['count']],
    $st->fetchAll(PDO::FETCH_ASSOC)
);

respond(['ok' => true, 'brands' => $brands]);
