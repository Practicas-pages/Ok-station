<?php
/**
 * Ok.station — Página de CATEGORÍA (armada en el servidor).
 * -----------------------------------------------------------------------------
 * Por qué existe: el catálogo de /tienda se pinta con JavaScript, así que al
 * rastrear el sitio Google NO encuentra ni un enlace a las fichas de producto.
 * Quedaban "huérfanas": el sitemap las lista, pero nada apunta a ellas.
 *
 * Esta página resuelve las dos cosas de un golpe:
 *   1. Da un camino RASTREABLE hacia cada ficha (enlaces <a> de verdad en el HTML).
 *   2. Compite por búsquedas reales de compra ("tinta y tóner Tijuana").
 *
 * Sigue el mismo patrón que producto.php (de Oscar): sin autoloader, PDO directo,
 * y reusa ShopProduct SOLO EN LECTURA (slug/url/price) — no modifica nada suyo.
 *
 * Mientras no esté la regla en .htaccess se prueba así:
 *     /categoria.php?slug=tinta-y-toner
 * Con la regla (2 líneas, espejo de la de producto) quedaría:
 *     /categoria/tinta-y-toner
 */
declare(strict_types=1);

$CONFIG = require __DIR__ . '/backend/api/config.php';
$BASE   = rtrim((string) ($CONFIG['app_url'] ?? 'https://okstation.mx'), '/');

$d = $CONFIG['db'];
try {
    $pdo = new PDO(
        "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
        $d['user'], $d['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (Throwable $e) {
    http_response_code(503);
    exit('Servicio no disponible.');
}
function db(): PDO { global $pdo; return $pdo; }
/* Este backend NO tiene autoloader: cada entrada requiere sus clases a mano. */
require __DIR__ . '/backend/api/lib/ShopProduct.php';

function e(?string $s): string { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }

/** 404 de verdad (para Google) con la página de error del sitio. */
function cat_404(): void {
    http_response_code(404);
    $f = __DIR__ . '/404.html';
    if (is_file($f)) { readfile($f); } else { echo 'Categoría no encontrada.'; }
    exit;
}

$slugPedido = trim((string) ($_GET['slug'] ?? ''));
if ($slugPedido === '') { header('Location: /tienda', true, 301); exit; }

/* ── Buscar la categoría por su slug ──
   Las categorías vienen de Exel como texto ("Tinta y Tóner"), no hay tabla de
   categorías con id. Se genera el slug de cada una con el MISMO ShopProduct::slug()
   que usan las fichas, así ambas URLs siempre coinciden. */
$cats = $pdo->query(
    "SELECT category, COUNT(*) AS n
       FROM products
      WHERE is_active = 1 AND category <> ''
   GROUP BY category
   ORDER BY category"
)->fetchAll();

$cat = null;
foreach ($cats as $c) {
    if (ShopProduct::slug((string) $c['category']) === $slugPedido) { $cat = $c; break; }
}
if ($cat === null) { cat_404(); }

$nombre = (string) $cat['category'];
$slug   = ShopProduct::slug($nombre);
$canon  = $BASE . '/categoria/' . $slug;

/* ── Productos de la categoría ──
   Mismo filtro que el catálogo público (is_active = 1). Con existencia primero:
   de nada sirve encabezar la lista con lo agotado. */
$st = $pdo->prepare(
    "SELECT id, name, brand, subcategory, price, old_price, stock
       FROM products
      WHERE is_active = 1 AND category = ?
   ORDER BY (stock > 0) DESC, name
      LIMIT 200"
);
$st->execute([$nombre]);
$prods = $st->fetchAll();

/* Fotos (la principal de cada producto) en UNA sola consulta, no una por producto. */
$imgs = [];
if ($prods) {
    $ids = array_column($prods, 'id');
    $in  = implode(',', array_fill(0, count($ids), '?'));
    $qi  = $pdo->prepare("SELECT product_id, url FROM product_images WHERE is_primary = 1 AND product_id IN ($in)");
    $qi->execute($ids);
    foreach ($qi->fetchAll() as $r) { $imgs[(int) $r['product_id']] = (string) $r['url']; }
}

$total    = count($prods);
$title    = $nombre . ' en Tijuana | Ok.station';
$metaDesc = 'Compra ' . mb_strtolower($nombre) . ' en línea en Ok.station Tijuana: '
          . $total . ' productos con precio y existencia. Recoge gratis en Otay o recíbelo a domicilio en todo México.';

/* ── schema.org ──
   ItemList: le dice a Google que esto es un listado y en qué orden va cada ficha.
   BreadcrumbList: la ruta Inicio › Tienda › Categoría (sale en los resultados). */
$ldList = [
    '@context' => 'https://schema.org',
    '@type'    => 'ItemList',
    'name'     => $nombre,
    'numberOfItems' => $total,
    'itemListElement' => [],
];
foreach ($prods as $i => $p) {
    $ldList['itemListElement'][] = [
        '@type'    => 'ListItem',
        'position' => $i + 1,
        'url'      => $BASE . ShopProduct::url((int) $p['id'], (string) $p['name']),
        'name'     => (string) $p['name'],
    ];
}
$ldCrumbs = [
    '@context' => 'https://schema.org',
    '@type'    => 'BreadcrumbList',
    'itemListElement' => [
        ['@type' => 'ListItem', 'position' => 1, 'name' => 'Inicio',  'item' => $BASE . '/'],
        ['@type' => 'ListItem', 'position' => 2, 'name' => 'Tienda',  'item' => $BASE . '/tienda'],
        ['@type' => 'ListItem', 'position' => 3, 'name' => $nombre,   'item' => $canon],
    ],
];

function mxn($n): string { return '$' . number_format((float) $n, 2); }
?>
<!DOCTYPE html>
<html lang="es-MX">
<head>
  <meta charset="UTF-8">
  <!-- Puerta de mantenimiento: primero que nada, para redirigir antes de pintar. -->
  <script src="/assets/site-guard.js?v=20260720a"></script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <title><?= e($title) ?></title>
  <meta name="description" content="<?= e($metaDesc) ?>">
  <meta name="theme-color" content="#066CFF">
  <meta name="geo.region" content="MX-BCN">
  <meta name="geo.placename" content="Tijuana, Baja California">
  <link rel="canonical" href="<?= e($canon) ?>">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Ok.station">
  <meta property="og:locale" content="es_MX">
  <meta property="og:title" content="<?= e($title) ?>">
  <meta property="og:description" content="<?= e($metaDesc) ?>">
  <meta property="og:url" content="<?= e($canon) ?>">
  <link rel="icon" href="/assets/img/OKD-Isotipo-Azul-96.png" type="image/png" sizes="96x96">
  <!-- Tema (claro/oscuro): antes de los estilos para pintar ya con el tema elegido -->
  <script src="/assets/theme.js?v=20260721a"></script>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap"></noscript>
  <script type="application/ld+json"><?= json_encode($ldList, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?></script>
  <script type="application/ld+json"><?= json_encode($ldCrumbs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?></script>
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#F5F8FD;color:#12141C;
      font-family:"Poppins",system-ui,-apple-system,"Segoe UI",sans-serif}
    .bar{background:#066CFF;color:#fff;padding:14px max(16px,calc((100% - 1180px)/2));
      display:flex;align-items:center;gap:16px}
    .bar a{color:#fff;text-decoration:none;font-weight:700}
    .bar .sep{opacity:.5}
    .wrap{max-width:1180px;margin:0 auto;padding:26px max(16px,calc((100% - 1180px)/2)) 60px}
    .crumbs{font-size:.84rem;color:#5b6474;margin:0 0 14px}
    .crumbs a{color:#066CFF;text-decoration:none}
    h1{font-size:clamp(1.6rem,4vw,2.2rem);margin:0 0 8px;letter-spacing:-.02em}
    .lead{color:#5b6474;margin:0 0 26px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:14px}
    .card{background:#fff;border:1px solid #E3E8F1;border-radius:14px;padding:14px;
      display:flex;flex-direction:column;text-decoration:none;color:inherit;transition:.15s}
    .card:hover{border-color:#066CFF;box-shadow:0 8px 24px rgba(6,108,255,.10)}
    .thumb{height:140px;border-radius:10px;background:#F5F8FD;display:grid;place-items:center;
      margin-bottom:12px;overflow:hidden}
    .thumb img{max-width:100%;max-height:100%;object-fit:contain}
    .brand{font-size:.7rem;font-weight:700;color:#8b93a3;text-transform:uppercase;letter-spacing:.05em}
    .name{font-size:.92rem;font-weight:600;margin:4px 0 10px;line-height:1.35;flex:1}
    .price{font-size:1.1rem;font-weight:800;color:#12141C}
    .price s{font-size:.85rem;font-weight:500;color:#8b93a3;margin-left:6px}
    .stock{font-size:.76rem;color:#0E9F6E;margin-top:4px}
    .stock.out{color:#8b93a3}
    .empty{background:#fff;border:1px solid #E3E8F1;border-radius:14px;padding:40px;text-align:center;color:#5b6474}
    .otras{margin-top:44px}
    .otras h2{font-size:1.05rem;margin:0 0 12px}
    .chips{display:flex;flex-wrap:wrap;gap:9px}
    .chips a{background:#fff;border:1.5px solid #E3E8F1;border-radius:99px;padding:8px 15px;
      font-size:.86rem;font-weight:600;color:#33404f;text-decoration:none}
    .chips a:hover{border-color:#066CFF;color:#066CFF}

    /* ── Modo oscuro (html[data-theme="dark"], lo pone theme.js). Esta página no
       carga styles.css, así que trae su propio bloque. Las miniaturas (.thumb)
       se quedan claras: la mercancía luce sobre fondo claro. ── */
    html[data-theme="dark"] body{background:#0F1524;color:#E9EDF6}
    html[data-theme="dark"] :is(.card,.empty,.chips a){background:#171F31;border-color:#26314A;color:#E9EDF6}
    html[data-theme="dark"] .name{color:#E9EDF6}
    html[data-theme="dark"] .price{color:#E9EDF6}
    html[data-theme="dark"] :is(.lead,.crumbs,.brand,.stock.out,.empty){color:#8A94AB}
    html[data-theme="dark"] .chips a:hover{border-color:#3E8BFF;color:#3E8BFF}

    /* Botón de tema en la barra azul: fantasma blanco y a la derecha del todo.
       (La barra es azul en AMBOS temas, así que no cambia con el modo oscuro.) */
    .bar .theme-toggle{margin-left:auto;width:34px;height:34px;
      border:1.5px solid rgba(255,255,255,.55);background:transparent;color:#fff}
    .bar .theme-toggle:hover{background:rgba(255,255,255,.16);border-color:#fff;color:#fff}
  </style>
</head>
<body>
  <nav class="bar" aria-label="Principal">
    <a href="/">Ok.station</a><span class="sep">·</span>
    <a href="/tienda">Ver toda la tienda</a>
  </nav>

  <main class="wrap">
    <p class="crumbs"><a href="/">Inicio</a> › <a href="/tienda">Tienda</a> › <?= e($nombre) ?></p>
    <h1><?= e($nombre) ?> en Tijuana</h1>
    <p class="lead"><?= $total ?> producto<?= $total === 1 ? '' : 's' ?> con precio y existencia al día.
       Recoge gratis en OK.station (Centro Comercial Otay) o recíbelo a domicilio en todo México.</p>

    <?php if (!$prods): ?>
      <p class="empty">Por ahora no hay productos en esta categoría. <a href="/tienda">Ver toda la tienda</a></p>
    <?php else: ?>
      <!-- El punto de esta página: enlaces <a href> REALES a cada ficha, en el HTML,
           sin depender de JavaScript. Es el camino que Google necesita para llegar. -->
      <div class="grid">
        <?php foreach ($prods as $p):
          $url = ShopProduct::url((int) $p['id'], (string) $p['name']);
          $img = $imgs[(int) $p['id']] ?? '';
          $hay = ((int) $p['stock']) > 0; ?>
          <a class="card" href="<?= e($url) ?>">
            <span class="thumb">
              <?php if ($img): ?><img src="<?= e($img) ?>" alt="<?= e($p['name']) ?>" loading="lazy" width="180" height="140">
              <?php else: /* sin foto → wordmark Ok.station (fondo transparente) */ ?><img src="/assets/img/placeholder-producto.svg" alt="" loading="lazy" width="180" height="140" style="object-fit:contain;padding:14px;box-sizing:border-box"><?php endif; ?>
            </span>
            <?php if ($p['brand']): ?><span class="brand"><?= e($p['brand']) ?></span><?php endif; ?>
            <span class="name"><?= e($p['name']) ?></span>
            <span class="price"><?= mxn($p['price']) ?><?php if (!empty($p['old_price']) && $p['old_price'] > $p['price']): ?><s><?= mxn($p['old_price']) ?></s><?php endif; ?></span>
            <span class="stock<?= $hay ? '' : ' out' ?>"><?= $hay ? 'Disponible' : 'Sobre pedido' ?></span>
          </a>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>

    <!-- Enlaces entre categorías: teje la red interna para que Google recorra todo. -->
    <?php if (count($cats) > 1): ?>
    <section class="otras">
      <h2>Otras categorías</h2>
      <div class="chips">
        <?php foreach ($cats as $c):
          if ((string) $c['category'] === $nombre) continue; ?>
          <a href="/categoria/<?= e(ShopProduct::slug((string) $c['category'])) ?>"><?= e($c['category']) ?> (<?= (int) $c['n'] ?>)</a>
        <?php endforeach; ?>
      </div>
    </section>
    <?php endif; ?>
  </main>
</body>
</html>
