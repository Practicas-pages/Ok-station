<?php
/** GET /backend/api/shop/subcategories.php — subcategorías (el "Tipo" de papelería) con
 *  productos activos, para el panel de filtros. Devuelve { ok, subcategories:[{name,count}] }.
 *
 *  Igual que brands.php: se carga BAJO DEMANDA al abrir los filtros, por eso va aparte de
 *  categories.php (que sí pesa en la carga inicial). Acepta ?category= para acotar el "Tipo"
 *  a la categoría que se está viendo (ej. en "Consumibles" → Tinta, Tóner).
 */
require __DIR__ . '/../_bootstrap.php';
only_method('GET');

$category = trim((string) ($_GET['category'] ?? ''));

$where  = ["is_active = 1", "subcategory IS NOT NULL", "subcategory <> ''"];
$params = [];
if ($category !== '') { $where[] = 'category = ?'; $params[] = $category; }

$st = db()->prepare(
    'SELECT subcategory AS name, COUNT(*) AS count
       FROM products WHERE ' . implode(' AND ', $where) . '
      GROUP BY subcategory ORDER BY count DESC, subcategory ASC'
);
$st->execute($params);

$subcategories = array_map(
    fn($r) => ['name' => (string) $r['name'], 'count' => (int) $r['count']],
    $st->fetchAll(PDO::FETCH_ASSOC)
);

respond(['ok' => true, 'subcategories' => $subcategories]);
