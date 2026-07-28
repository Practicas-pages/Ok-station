<?php
/**
 * Ok.station — Sitemap DINÁMICO de las páginas de categoría y familia.
 * -----------------------------------------------------------------------------
 * Hermano de sitemap-productos.php. Las URLs /categoria/<slug> no estaban en
 * NINGÚN sitemap: el estático solo lista las páginas fijas y el dinámico solo las
 * fichas, así que las páginas que agrupan el catálogo —justo las que pelean por
 * "marcadores Tijuana" o "cuadernos Tijuana"— dependían de que Google las
 * descubriera por enlaces.
 *
 * Emite las DOS cosas que categoria.php sabe resolver:
 *   · las categorías  (products.category)
 *   · las familias    (products.subcategory) ← son la mayoría de las páginas
 * y usa el MISMO ShopProduct::slug() que ellas, para que la URL del sitemap sea
 * exactamente la que responde 200 (un sitemap que apunta a 404 es peor que no
 * tener sitemap: Google deja de confiar en él).
 *
 * Declarado en robots.txt. Probar: /sitemap-categorias.php
 */
declare(strict_types=1);

$CONFIG = require __DIR__ . '/backend/api/config.php';

/* Dominio público: del .env (APP_URL) para no dejarlo escrito a mano aquí. */
$base = rtrim((string) ($CONFIG['app_url'] ?? $CONFIG['APP_URL'] ?? 'https://okstation.mx'), '/');

$d = $CONFIG['db'];
try {
    $pdo = new PDO(
        "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
        $d['user'], $d['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (Throwable $e) {
    /* Si la BD no responde, un sitemap vacío es mejor que un 500: Google lo
       reintenta y no marca el sitio como roto. */
    header('Content-Type: application/xml; charset=UTF-8');
    http_response_code(503);
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';
    exit;
}

function db(): PDO { global $pdo; return $pdo; }
require __DIR__ . '/backend/api/lib/ShopProduct.php';

/* Mismo filtro que el catálogo público y que categoria.php (is_active = 1).
   MAX(updated_at) del grupo = cuándo cambió algo de esa categoría por última vez,
   que es lo que significa lastmod para una página de listado. */
$cats = $pdo->query(
    "SELECT category AS nombre, MAX(updated_at) AS visto
       FROM products
      WHERE is_active = 1 AND category <> ''
   GROUP BY category"
)->fetchAll();

$fams = $pdo->query(
    "SELECT subcategory AS nombre, MAX(updated_at) AS visto
       FROM products
      WHERE is_active = 1 AND subcategory <> ''
   GROUP BY subcategory"
)->fetchAll();

header('Content-Type: application/xml; charset=UTF-8');
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";

/* Si una familia se llamara igual que una categoría, categoria.php resuelve la
   CATEGORÍA (ese es su orden) y la familia no tendría página propia: se emite el
   slug una sola vez para no mandar a Google dos entradas a la misma URL. */
$vistos = [];
foreach (array_merge($cats, $fams) as $r) {
    $nombre = trim((string) $r['nombre']);
    if ($nombre === '') continue;
    $slug = ShopProduct::slug($nombre);
    if ($slug === '' || isset($vistos[$slug])) continue;
    $vistos[$slug] = true;

    echo "  <url>\n";
    echo '    <loc>' . htmlspecialchars($base . '/categoria/' . $slug, ENT_XML1 | ENT_QUOTES, 'UTF-8') . "</loc>\n";
    if (!empty($r['visto'])) {
        echo '    <lastmod>' . date('Y-m-d', strtotime((string) $r['visto'])) . "</lastmod>\n";
    }
    /* Un listado cambia cada vez que cambia el precio o la existencia de cualquiera
       de sus productos, y eso pasa con cada corrida del runner de Exel. */
    echo "    <changefreq>weekly</changefreq>\n";
    echo "  </url>\n";
}

echo '</urlset>';
