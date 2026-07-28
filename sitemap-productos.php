<?php
/**
 * Ok.station — Sitemap DINÁMICO de las fichas de producto.
 * -----------------------------------------------------------------------------
 * El sitemap.xml estático solo lista las páginas fijas: las fichas
 * (/producto/49-toner-hp-85a) quedaban fuera y Google no las descubría, aunque
 * cada una ya trae su schema.org Product con precio y existencia.
 *
 * Se genera al vuelo desde la BD para que NO haya que mantenerlo a mano: cuando
 * el runner de Exel meta cientos de productos nuevos, aquí salen solos.
 *
 * Publica solo lo que el catálogo publica (is_active = 1), reusando
 * ShopProduct::url() para que la URL sea EXACTAMENTE la misma que la del sitio
 * (si cambia el formato del slug, cambia en un solo lugar).
 *
 * Declarado en robots.txt. Probar: /sitemap-productos.php
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

/* Mismo filtro que usa el catálogo público (backend/api/shop/products.php). */
$rows = $pdo->query(
    "SELECT id, name, updated_at
       FROM products
      WHERE is_active = 1
      ORDER BY id"
)->fetchAll();

/* ── Fotos de cada producto, para el sitemap de IMÁGENES ──
   Una papelería se busca mucho por foto ("cuaderno profesional pasta dura"), y
   Google Imágenes es una entrada de tráfico aparte de la búsqueda normal. Las fotos
   ya están en el HTML de la ficha con su alt, así que esto no las "arregla": lo que
   hace es que Google no tenga que renderizar 5,500 páginas para encontrarlas.
   Una sola consulta para todo el catálogo (no una por producto) y máximo 5 fotos por
   ficha: pasada la quinta son ángulos del mismo objeto y solo engordan el archivo. */
$fotos = [];
foreach ($pdo->query(
    "SELECT i.product_id, i.url
       FROM product_images i
       JOIN products p ON p.id = i.product_id
      WHERE p.is_active = 1 AND i.url <> ''
   ORDER BY i.product_id, i.is_primary DESC, i.id"
) as $r) {
    $pid = (int) $r['product_id'];
    if (count($fotos[$pid] ?? []) >= 5) continue;
    $fotos[$pid][] = (string) $r['url'];
}

/** Las URLs de Icecat vienen absolutas; las locales, no. Mismo criterio que la ficha. */
function foto_abs(string $u, string $base): string {
    return preg_match('~^https?://~i', $u) ? $u : $base . $u;
}

header('Content-Type: application/xml; charset=UTF-8');
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"' . "\n";
echo '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' . "\n";

foreach ($rows as $r) {
    $loc = $base . ShopProduct::url((int) $r['id'], (string) $r['name']);
    echo "  <url>\n";
    echo '    <loc>' . htmlspecialchars($loc, ENT_XML1 | ENT_QUOTES, 'UTF-8') . "</loc>\n";
    if (!empty($r['updated_at'])) {
        echo '    <lastmod>' . date('Y-m-d', strtotime((string) $r['updated_at'])) . "</lastmod>\n";
    }
    /* Las fichas cambian cuando cambia precio o existencia: semanal es honesto.
       (changefreq es solo una pista para Google, no una promesa.) */
    echo "    <changefreq>weekly</changefreq>\n";
    /* Solo <image:loc>: Google dejó de usar title, caption, license y geo_location
       de este espacio de nombres, así que declararlos sería peso muerto. */
    foreach ($fotos[(int) $r['id']] ?? [] as $u) {
        echo "    <image:image>\n";
        echo '      <image:loc>' . htmlspecialchars(foto_abs($u, $base), ENT_XML1 | ENT_QUOTES, 'UTF-8') . "</image:loc>\n";
        echo "    </image:image>\n";
    }
    echo "  </url>\n";
}

echo '</urlset>';
