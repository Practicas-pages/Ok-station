<?php
/** GET /backend/api/shop/products.php — catálogo PÚBLICO de la tienda (lee de `products`).
 *  Solo productos activos (con stock). Nunca expone costo ni datos internos del proveedor.
 *  Params: q (búsqueda), category, subcategory, brand (una o varias con coma),
 *          ofertas, sort, page, per_page.
 *  El filtrado es AQUÍ (no en el navegador) porque el catálogo se pagina: filtrar en el
 *  cliente solo miraría la página cargada y "escondería" el resto del catálogo.
 *  Precio devuelto = lista con IVA 8% incluido (misma convención que ShopCatalog/catalogo.js);
 *  en el checkout se re-aplica el IVA por geolocalización.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/_synonyms.php';
only_method('GET');

$q        = trim((string) ($_GET['q'] ?? ''));
$category = trim((string) ($_GET['category'] ?? ''));
$subcat   = trim((string) ($_GET['subcategory'] ?? ''));
$brand    = trim((string) ($_GET['brand'] ?? ''));
$ofertas  = ($_GET['ofertas'] ?? '') === '1';
$page     = max(1, (int) ($_GET['page'] ?? 1));
$perPage  = min(60, max(1, (int) ($_GET['per_page'] ?? 24)));
$offset   = ($page - 1) * $perPage;

/* Filtros (siempre solo activos). */
$where  = ['is_active = 1'];
$params = [];
/* ids=1,2,3 → resolver productos concretos (el carrito/deseados guardados solo
   traen ids y hay que "rehidratarlos" contra el catálogo real, no contra la página
   que la tienda alcanzó a paginar). */
$ids = array_values(array_filter(array_map('intval', explode(',', (string) ($_GET['ids'] ?? ''))), fn($i) => $i > 0));
if ($ids) {
    $ids   = array_slice(array_unique($ids), 0, 100);
    $where[] = 'id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
    array_push($params, ...$ids);
}
if ($q !== '') {
    // Búsqueda con sinónimos de papelería (tinta↔cartucho, hojas↔papel, pluma↔bolígrafo…),
    // tolerante a acentos/mayúsculas/plurales. Ver _synonyms.php.
    [$qSql, $qParams] = shop_search_clause($q);
    if ($qSql !== '') { $where[] = $qSql; array_push($params, ...$qParams); }
}
if ($category !== '') { $where[] = 'category = ?';    $params[] = $category; }
/* subcategory acepta VARIAS separadas por coma (el filtro "Tipo" del panel), igual que
   brand. Una sola (subcategory=Tinta) sigue funcionando igual. */
if ($subcat !== '') {
    $subs = array_values(array_unique(array_filter(array_map('trim', explode(',', $subcat)))));
    $subs = array_slice($subs, 0, 40);
    if ($subs) {
        $where[] = 'subcategory IN (' . implode(',', array_fill(0, count($subs), '?')) . ')';
        array_push($params, ...$subs);
    }
}
/* brand acepta VARIAS separadas por coma (brand=HP,Canon) para el panel de filtros.
   Una sola (brand=HP) sigue funcionando igual: no rompe a quien ya lo usaba. */
if ($brand !== '') {
    $brands = array_values(array_unique(array_filter(array_map('trim', explode(',', $brand)))));
    $brands = array_slice($brands, 0, 30);
    if ($brands) {
        $where[] = 'brand IN (' . implode(',', array_fill(0, count($brands), '?')) . ')';
        array_push($params, ...$brands);
    }
}
if ($ofertas)         { $where[] = 'old_price > price'; }   // "Ofertas del día"
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

/* En una BÚSQUEDA, los productos CON foto van primero: una lista encabezada por
   recuadros vacíos se lee como catálogo incompleto. Los que no tienen foto no se
   quitan ni se ocultan, solo bajan; entre ellos y entre los que sí la tienen se
   respeta el orden elegido ($order).
   Dos condiciones, y las dos importan: solo con búsqueda (en el catálogo normal manda
   el orden del catálogo) y solo con el orden POR OMISIÓN. Si el cliente pidió
   expresamente "precio: menor a mayor", el más barato tiene que salir primero aunque
   no tenga foto: para eso lo eligió. */
if ($q !== '' && ($_GET['sort'] ?? 'name') === 'name') {
    $order = 'EXISTS(SELECT 1 FROM product_images pi'
           . ' WHERE pi.product_id = products.id AND pi.is_primary = 1) DESC, ' . $order;
}

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
