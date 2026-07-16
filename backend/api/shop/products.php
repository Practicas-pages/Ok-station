<?php
/** GET /backend/api/shop/products.php — catálogo PÚBLICO de la tienda (lee de `products`).
 *  Solo productos activos (con stock). Nunca expone costo ni datos internos del proveedor.
 *  Params: q (búsqueda), category, brand, sort, page, per_page.
 *  Precio devuelto = lista con IVA 8% incluido (misma convención que ShopCatalog/catalogo.js);
 *  en el checkout se re-aplica el IVA por geolocalización.
 */
require __DIR__ . '/../_bootstrap.php';
only_method('GET');

$q        = trim((string) ($_GET['q'] ?? ''));
$category = trim((string) ($_GET['category'] ?? ''));
$brand    = trim((string) ($_GET['brand'] ?? ''));
$page     = max(1, (int) ($_GET['page'] ?? 1));
$perPage  = min(60, max(1, (int) ($_GET['per_page'] ?? 24)));
$offset   = ($page - 1) * $perPage;

/* Filtros (siempre solo activos). */
$where  = ['is_active = 1'];
$params = [];
if ($q !== '') {
    $where[] = '(name LIKE ? OR brand LIKE ? OR sku LIKE ?)';
    $like = '%' . $q . '%';
    array_push($params, $like, $like, $like);
}
if ($category !== '') { $where[] = 'category = ?'; $params[] = $category; }
if ($brand !== '')    { $where[] = 'brand = ?';    $params[] = $brand; }
$wsql = implode(' AND ', $where);

/* Total (para paginación). */
$stc = db()->prepare("SELECT COUNT(*) FROM products WHERE $wsql");
$stc->execute($params);
$total = (int) $stc->fetchColumn();

/* Orden (lista blanca: nunca interpolamos entrada del usuario en el ORDER BY). */
$order = [
    'price_asc'  => 'price ASC',
    'price_desc' => 'price DESC',
    'newest'     => 'created_at DESC',
    'name'       => 'name ASC',
][(string) ($_GET['sort'] ?? 'name')] ?? 'name ASC';

$st = db()->prepare(
    "SELECT id, sku, name, brand, category, subcategory, price, old_price, stock
       FROM products WHERE $wsql ORDER BY $order LIMIT ? OFFSET ?"
);
$i = 1;
foreach ($params as $p) $st->bindValue($i++, $p);
$st->bindValue($i++, $perPage, PDO::PARAM_INT);
$st->bindValue($i++, $offset, PDO::PARAM_INT);
$st->execute();
$rows = $st->fetchAll();

/* Imagen principal de cada producto, en una sola consulta. */
$imgs = [];
$ids  = array_column($rows, 'id');
if ($ids) {
    $in  = implode(',', array_fill(0, count($ids), '?'));
    $sti = db()->prepare(
        "SELECT product_id, COALESCE(stored_path, url) AS src
           FROM product_images WHERE is_primary = 1 AND product_id IN ($in)"
    );
    $sti->execute($ids);
    foreach ($sti->fetchAll() as $im) $imgs[(int) $im['product_id']] = $im['src'];
}

$items = array_map(function ($r) use ($imgs) {
    return [
        'id'          => (int) $r['id'],
        'sku'         => $r['sku'],
        'name'        => $r['name'],
        'brand'       => $r['brand'],
        'category'    => $r['category'],
        'subcategory' => $r['subcategory'],
        'price'       => round((float) $r['price'] * 1.08, 2), // base × IVA 8% (lista, como catalogo.js)
        // Precio anterior (tachado) → "Ofertas del día". Solo si de verdad es mayor.
        'old'         => ((float) $r['old_price'] > (float) $r['price'])
                             ? round((float) $r['old_price'] * 1.08, 2) : null,
        'stock'       => (int) $r['stock'],
        'image'       => $imgs[(int) $r['id']] ?? null,
    ];
}, $rows);

respond([
    'ok'       => true,
    'items'    => $items,
    'total'    => $total,
    'page'     => $page,
    'per_page' => $perPage,
    'pages'    => (int) ceil($total / max(1, $perPage)),
]);
