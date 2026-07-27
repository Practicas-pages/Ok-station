<?php
/**
 * GET /backend/api/admin/catalog.php — CATÁLOGO de productos de la tienda para el panel.
 * Lista los productos con el CONTEO DE IMÁGENES de cada uno para detectar de un vistazo
 * a qué productos les faltan fotos. Requiere el permiso 'shop.view'.
 * Filtros: ?q= (nombre/sku/referencia/marca)
 *          &images=sin|pocas|ok|remotas &active=1|0
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/CatalogoAlcance.php';   // sin autoloader: hay que pedirlo
only_method('GET');

$user = require_permission('shop.view');

$q        = trim((string) ($_GET['q'] ?? ''));
$images   = $_GET['images'] ?? null;   // sin | pocas | ok
$active   = $_GET['active'] ?? null;   // '1' | '0'

/* Los dos conteos van como subconsulta correlacionada (mismo patrón que `items` en
   shop-orders.php): una sola consulta para TODOS los productos, no una por producto.
     images        → filas registradas en product_images
     images_stored → las que YA se descargaron al servidor (stored_path)
   Se muestran por separado a propósito: un producto puede tener 5 imágenes registradas
   y 0 descargadas; hoy depende por completo del CDN remoto. "Tiene fotos" no significa
   que ya estén protegidas por una copia local. */
$imgCount    = "(SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id)";
$storedCount = "(SELECT COUNT(*) FROM product_images i WHERE i.product_id = p.id
                  AND i.stored_path IS NOT NULL AND i.stored_path <> '')";

$sql = "SELECT p.id, p.supplier_ref, p.sku, p.name, p.brand, p.category, p.subcategory,
               p.cost, p.price, p.stock, p.image_source, p.is_active, p.is_papeleria,
               p.enriched_at, p.last_synced_at,
               $imgCount    AS images,
               $storedCount AS images_stored,
               /* Misma resolución que la tienda (ShopProduct.php): copia local si
                  existe, si no la URL de origen. Así el panel muestra exactamente
                  la foto que ve el cliente, no una miniatura vacía. */
               (SELECT COALESCE(i.stored_path, i.url) FROM product_images i
                 WHERE i.product_id = p.id
                 ORDER BY i.is_primary DESC, i.sort_order ASC LIMIT 1) AS thumb
        FROM products p";

$where = []; $params = [];
if ($q !== '') {
    $like = '%' . $q . '%';
    $where[] = "(p.name LIKE ? OR p.sku LIKE ? OR p.supplier_ref LIKE ? OR p.brand LIKE ?)";
    array_push($params, $like, $like, $like, $like);
}
/* ALCANCE: esta vista solo muestra lo que OK.station vende. Sin esto, el panel
   listaba los 2,714 productos apagados de Consumibles, Papel e Impresión —
   "5,609 productos, 343 sin fotos"— y el trabajador se ponía a buscarle fotos a
   cosas que ya no están a la venta. Los conteos de arriba también se inflaban.
   Se resuelve con la MISMA lista blanca que usa el sync, no con una copia.
   Esta consulta usa placeholders POSICIONALES (?), así que aquí no se puede usar
   alcance_sql() —devuelve nombrados y PDO no deja mezclarlos—, pero sí se usa su
   misma fuente de verdad: categorias_permitidas(). */
$catsOk = categorias_permitidas();
if ($catsOk) {
    $where[] = 'p.category IN (' . implode(',', array_fill(0, count($catsOk), '?')) . ')';
    foreach ($catsOk as $c) $params[] = $c;
}
if ($active === '1' || $active === '0') { $where[] = "p.is_active = ?"; $params[] = (int) $active; }
/* El alias `images` no existe todavía en el WHERE (SQL lo evalúa después), por eso
   aquí se repite la subconsulta en vez de reusar el alias. En el ORDER BY sí se puede. */
if ($images === 'sin')   $where[] = "$imgCount = 0";
if ($images === 'pocas') $where[] = "$imgCount BETWEEN 1 AND 2";
if ($images === 'ok')    $where[] = "$imgCount >= 3";
if ($images === 'remotas') $where[] = "$imgCount > 0 AND $storedCount = 0";
if ($where) $sql .= " WHERE " . implode(' AND ', $where);

/* Orden por defecto: primero los que MENOS fotos tienen. Esta vista existe para
   cazar huecos, así que los problemas van arriba sin tener que filtrar. */
$sql .= " ORDER BY images ASC, p.name ASC LIMIT 500";

$st = db()->prepare($sql);
$st->execute($params);
$rows = $st->fetchAll();

/* PDO devuelve todo como texto; el front compara con números (< 3, === 0). */
foreach ($rows as &$r) {
    $r['images']        = (int) $r['images'];
    $r['images_stored'] = (int) $r['images_stored'];
    $r['stock']         = (int) $r['stock'];
    $r['is_active']     = (int) $r['is_active'];
    $r['is_papeleria']  = (int) $r['is_papeleria'];
}
unset($r);

/* Resumen del catálogo (no del filtro de búsqueda): el semáforo de arriba debe
   decir siempre cómo va el catálogo, aunque estés viendo una búsqueda.
   Acotado al ALCANCE por la misma razón que la lista: contar los productos
   apagados hacía que el panel dijera "5,609 productos, 343 sin fotos" cuando lo
   que de verdad hay que atender son los de Oficina y Escolar. Un número que
   incluye trabajo que nadie va a hacer no ayuda a decidir. */
$stAlc = ''; $pAlc = [];
if ($catsOk) {
    $stAlc = ' WHERE p.category IN (' . implode(',', array_fill(0, count($catsOk), '?')) . ')';
    $pAlc  = $catsOk;
}
$stStats = db()->prepare(
    "SELECT COUNT(*)                          AS total,
            SUM(n.c = 0)                      AS sin_imagenes,
            SUM(n.c BETWEEN 1 AND 2)          AS pocas,
            SUM(n.c >= 3)                     AS ok,
            SUM(n.c > 0 AND n.s = 0)          AS sin_descargar
     FROM (SELECT p.id, $imgCount AS c, $storedCount AS s FROM products p{$stAlc}) n"
);
$stStats->execute($pAlc);
$stats = $stStats->fetch();

log_activity((int) $user['id'], 'shop.view', 'products', null, ['q' => $q, 'images' => $images]);

respond([
    'ok'         => true,
    'products'   => $rows,
    'count'      => count($rows),
    'limit'      => 500,
    'stats'      => [
        'total'         => (int) ($stats['total'] ?? 0),
        'sin_imagenes'  => (int) ($stats['sin_imagenes'] ?? 0),
        'pocas'         => (int) ($stats['pocas'] ?? 0),
        'ok'            => (int) ($stats['ok'] ?? 0),
        'sin_descargar' => (int) ($stats['sin_descargar'] ?? 0),
    ],
]);
