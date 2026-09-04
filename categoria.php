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

/* ── Y las FAMILIAS (subcategory) ──
   El feed de Exel mete TODO el catálogo bajo una sola category ("Oficina y
   Escolar"), así que con categorías puras esta página existía UNA vez: una sola
   URL indexable para miles de productos, y nadie busca "oficina y escolar". Lo que
   la gente sí escribe es la familia — "marcadores", "cuadernos profesionales",
   "tinta para impresora" —, que es justo lo que Exel guarda en subcategory y lo que
   la tienda ya usa como barra de categorías. Sirviendo también las familias, el
   mismo archivo pasa de una página a decenas, cada una peleando por una búsqueda
   de compra concreta, y de paso cada ficha queda a un clic de una página rastreable
   (con LIMIT 200 sobre una categoría de miles, la mayoría no se alcanzaba).
   MIN(category) es la categoría padre, solo para las migas de pan. */
$fams = $pdo->query(
    "SELECT subcategory, MIN(category) AS category, COUNT(*) AS n
       FROM products
      WHERE is_active = 1 AND subcategory <> ''
   GROUP BY subcategory
   ORDER BY n DESC, subcategory"
)->fetchAll();

/* Primero categoría, luego familia: si algún día un nombre se repitiera en las dos,
   gana la categoría y la URL sigue significando lo mismo que significaba ayer. */
$cat = null; $esFamilia = false;
foreach ($cats as $c) {
    if (ShopProduct::slug((string) $c['category']) === $slugPedido) { $cat = $c; break; }
}
if ($cat === null) {
    foreach ($fams as $f) {
        if (ShopProduct::slug((string) $f['subcategory']) === $slugPedido) { $cat = $f; $esFamilia = true; break; }
    }
}
if ($cat === null) { cat_404(); }

$nombre = $esFamilia ? (string) $cat['subcategory'] : (string) $cat['category'];
$padre  = $esFamilia ? trim((string) ($cat['category'] ?? '')) : '';
$slug   = ShopProduct::slug($nombre);
$canon  = $BASE . '/categoria/' . $slug;

/* ── Productos de la categoría ──
   Mismo filtro que el catálogo público (is_active = 1). Con existencia primero:
   de nada sirve encabezar la lista con lo agotado. */
/* La columna por la que se filtra depende de qué resolvió el slug. Se interpola el
   NOMBRE de la columna (no un valor), y sale de este if — nunca de la URL. */
$st = $pdo->prepare(
    "SELECT id, name, brand, subcategory, price, old_price, stock
       FROM products
      WHERE is_active = 1 AND " . ($esFamilia ? 'subcategory' : 'category') . " = ?
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

/* Imagen para compartir (WhatsApp, Facebook, X) y para el resultado de Google: la
   foto del PRIMER producto de la categoría, que es la que representa lo que se va a
   encontrar. Si la categoría todavía no tiene ninguna foto, cae en el hero del sitio.
   Ojo con el mismo detalle que ya mordió en la ficha: las URLs de Icecat vienen
   ABSOLUTAS y anteponerles el dominio produce "https://okstation.mxhttps://…", que
   deja la tarjeta sin miniatura. */
$ogImage = $BASE . '/assets/img/hero-okstation.webp';
foreach ($prods as $p) {
    $u = $imgs[(int) $p['id']] ?? '';
    if ($u !== '') { $ogImage = preg_match('~^https?://~i', $u) ? $u : $BASE . $u; break; }
}

/* OJO: el total NO es count($prods). La consulta trae LIMIT 200, así que en una
   categoría de mil productos count() diría "200" y tanto el texto de la página como
   la meta description y el numberOfItems del schema estarían mintiendo. El número
   bueno ya venía en la consulta de agrupación ($cat['n'] = COUNT(*) de esa
   categoría o familia); count($prods) queda como el número de fichas REALMENTE
   listadas, que es otra cosa. */
$total    = (int) ($cat['n'] ?? count($prods));
$listados = count($prods);
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
/* En una FAMILIA la ruta lleva un escalón más (Inicio › Tienda › Categoría › Familia),
   que es lo que Google pinta debajo del título del resultado. */
$rutaCrumbs = [['Inicio', $BASE . '/'], ['Tienda', $BASE . '/tienda']];
if ($esFamilia && $padre !== '') {
    $rutaCrumbs[] = [$padre, $BASE . '/categoria/' . ShopProduct::slug($padre)];
}
$rutaCrumbs[] = [$nombre, $canon];
$ldCrumbs = [
    '@context' => 'https://schema.org',
    '@type'    => 'BreadcrumbList',
    'itemListElement' => array_map(fn($c, $i) => [
        '@type' => 'ListItem', 'position' => $i + 1, 'name' => $c[0], 'item' => $c[1],
    ], $rutaCrumbs, array_keys($rutaCrumbs)),
];

function mxn($n): string { return '$' . number_format((float) $n, 2); }
?>
<!DOCTYPE html>
<html lang="es-MX">
<head>
  <meta charset="UTF-8">
  <script src="/assets/site-guard.js?v=20260728n"></script>
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
  <?php /* Sin og:image la categoría se compartía como un enlace pelón, y la tarjeta con
           foto es la diferencia entre que alguien abra el enlace o lo ignore. Las
           twitter:* van aparte porque X no lee las og: cuando falta twitter:card. */ ?>
  <meta property="og:image" content="<?= e($ogImage) ?>">
  <meta property="og:image:alt" content="<?= e($nombre) ?> en Ok.station Tijuana">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="<?= e($title) ?>">
  <meta name="twitter:description" content="<?= e($metaDesc) ?>">
  <meta name="twitter:image" content="<?= e($ogImage) ?>">
  <meta name="author" content="Ok.station — OK Dock">
  <link rel="icon" href="/assets/img/OKD-Isotipo-Azul-96.png" type="image/png" sizes="96x96">
  <script src="/assets/theme.js?v=20260721a"></script>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"></noscript>
  <script type="application/ld+json"><?= json_encode($ldList, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?></script>
  <script type="application/ld+json"><?= json_encode($ldCrumbs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?></script>
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#F5F8FD;color:#12141C;
      font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
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

    html[data-theme="dark"] body{background:#0F1524;color:#E9EDF6}
    html[data-theme="dark"] :is(.card,.empty,.chips a){background:#171F31;border-color:#26314A;color:#E9EDF6}
    html[data-theme="dark"] .name{color:#E9EDF6}
    html[data-theme="dark"] .price{color:#E9EDF6}
    html[data-theme="dark"] :is(.lead,.crumbs,.brand,.stock.out,.empty){color:#8A94AB}
    html[data-theme="dark"] .chips a:hover{border-color:#3E8BFF;color:#3E8BFF}

    .bar .theme-toggle{margin-left:auto;width:34px;height:34px;
      border:1.5px solid rgba(255,255,255,.55);background:transparent;color:#fff}
    .bar .theme-toggle:hover{background:rgba(255,255,255,.16);border-color:#fff;color:#fff}
  </style>
  <link rel="stylesheet" href="/assets/oknav.css?v=20260728r">
</head>
<body>
<header class="oknav" id="oknav">

  <div class="oknav__belt">
    <div class="oknav__wrap">
      <nav class="oknav__beltlinks" aria-label="Enlaces rápidos">
        <a href="/quienes-somos.html">¿Quiénes somos?</a>
        <a href="/contactanos.html">Contacto</a>
      </nav>
      <p class="oknav__belttag">Te atendemos con gusto y una sonrisa — tú lo imaginas, nosotros lo hacemos. Aquí en Centro Comercial Otay, Tijuana.</p>
      <div class="oknav__beltsocial">
        <a href="https://www.facebook.com/okdock.station" target="_blank" rel="noopener" aria-label="Facebook">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        </a>
        <a href="https://www.instagram.com/okdock.station/" target="_blank" rel="noopener" aria-label="Instagram">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
        </a>
        <a href="mailto:station@okdock.mx" aria-label="Correo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
        </a>
      </div>
    </div>
  </div>

  <div class="oknav__row oknav__row--main">
    <div class="oknav__wrap">

      <button type="button" class="oknav__burger" id="oknavBurger"
              aria-label="Abrir menú" aria-expanded="false" aria-controls="oknavDrawer">
        <span></span><span></span><span></span>
      </button>

      <a class="oknav__logo" href="/" aria-label="Ok.station — Ir al inicio">
        <span class="oknav__brandmark" aria-hidden="true"><strong>OK.</strong><span>station</span></span>
      </a>

      <div class="oknav__search">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
        </svg>
        <input id="oknavQ" type="search" autocomplete="off" role="combobox"
               aria-expanded="false" aria-autocomplete="list" aria-controls="oknavAc"
               aria-label="Buscar productos (escribe y pulsa Enter)"
               placeholder="Busca tinta, tóner, papel, carpetas y más…">
        <div class="oknav__ac" id="oknavAc" role="listbox" aria-label="Sugerencias" hidden></div>
      </div>

      <div class="oknav__actions" id="oknavActions">

        <button type="button" class="oknav__loc" id="oknavLoc" aria-label="Ubicación de entrega">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <span class="oknav__loctxt">
            <small id="oknavLocTop" hidden>Entrega en</small>
            <b id="oknavLocMain">Elige tu ubicación</b>
          </span>
        </button>

        <a class="oknav__acct" id="oknavAcct" href="/cuenta.html" aria-label="Iniciar sesión">
          <span class="oknav__acctbox">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <span class="oknav__lbl">Cuenta</span>
          </span>
        </a>

        <button type="button" class="oknav__ico" id="oknavWish" aria-label="Favoritos" title="Favoritos">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/>
          </svg>
          <span class="oknav__ct" id="oknavWishCt" hidden>0</span>
        </button>

        <button type="button" class="oknav__cart" id="oknavCart" aria-label="Ver carrito">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6"/>
          </svg>
          <span id="oknavCartTotal">$0.00</span>
          <span class="oknav__ct" id="oknavCartCt" hidden>0</span>
        </button>

      </div>
    </div>
  </div>

  <div class="oknav__row oknav__row--nav">
    <div class="oknav__wrap">
      <nav class="oknav__mobile-stores" aria-label="Accesos de compra">
        <a class="oknav__mobile-store" href="/tienda.html#store">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 9l2-5h14l2 5"/><path d="M5 13v7h14v-7"/><path d="M9 20v-5h6v5"/>
            <path d="M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0"/>
          </svg>
          Tienda
        </a>
        <a class="oknav__mobile-store oknav__mobile-store--quick" href="/tienda-dinamica.html">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M13 2L4 14h8l-1 8 9-12h-8l1-8z"/>
          </svg>
          Tienda rápida
        </a>
      </nav>

      <button type="button" class="oknav__cats" id="oknavCats"
              aria-expanded="false" aria-controls="oknavCatsMenu" aria-haspopup="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
          <line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>
        </svg>
        Categorías
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      <a class="oknav__ofertas" id="oknavOfertas" href="/tienda.html#store">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        Ofertas
      </a>

      <span class="oknav__sep" aria-hidden="true"></span>

      <nav class="oknav__links" aria-label="Servicios">
        <a href="/index.html#citas">Citas</a>
        <a href="/index.html#fotos">Imprime tus fotos</a>
        <a href="/index.html#testimonios">Reseñas</a>
        <a href="/index.html#visitanos">Visítanos</a>
        <a class="oknav__gostore" href="/tienda.html#store">Tienda</a>
        <a class="oknav__gostore oknav__gostore--rapida" href="/tienda-dinamica.html">Tienda rápida</a>
      </nav>

      <a class="oknav__wa" href="https://wa.me/526647194117?text=Hola,%20quiero%20solicitar%20informaci%C3%B3n"
         target="_blank" rel="noopener">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.040z"/>
        </svg>
        WhatsApp
      </a>

    </div>
  </div>

  <div class="oknav__catsmenu" id="oknavCatsMenu" hidden></div>
</header>

<div class="oknav__scrim" id="oknavScrim" hidden></div>
<aside class="oknav__drawer" id="oknavDrawer" aria-label="Menú" hidden>
  <div class="oknav__dhead">
    <span class="oknav__brandmark" aria-label="Ok.station"><strong>OK.</strong><span>station</span></span>
    <button type="button" class="oknav__dclose" id="oknavDClose" aria-label="Cerrar menú">&times;</button>
  </div>

  <p class="oknav__dtitle">Tienda</p>
  <div class="oknav__dlist">
    <a href="/tienda.html#store">Ver todo el catálogo</a>
    <a href="/tienda.html#store" data-cat="ofertas">Ofertas del día</a>
    <a href="/tienda.html#cart">Mi carrito</a>
    <a href="/tienda.html#deseados">Mis favoritos</a>
    <a href="/tienda.html#ubicacion">Ubicación de entrega</a>
  </div>

  <p class="oknav__dtitle">Servicios</p>
  <div class="oknav__dlist">
    <a href="/index.html#citas">Citas</a>
    <a href="/index.html#fotos">Imprime tus fotos</a>
    <a href="/index.html#testimonios">Reseñas</a>
    <a href="/index.html#visitanos">Visítanos</a>
  </div>

  <p class="oknav__dtitle">Ok.station</p>
  <div class="oknav__dlist">
    <button type="button" id="oknavTema">Modo oscuro <span id="oknavTemaEstado"></span></button>
    <a href="/quienes-somos.html">¿Quiénes somos?</a>
    <a href="/contactanos.html">Contacto</a>
    <a href="https://wa.me/526647194117?text=Hola,%20quiero%20solicitar%20informaci%C3%B3n" target="_blank" rel="noopener">Escríbenos por WhatsApp</a>
  </div>

  <p class="oknav__dtitle">Síguenos</p>
  <div class="oknav__dsocial">
    <a href="https://www.facebook.com/okdock.station" target="_blank" rel="noopener" aria-label="Facebook">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
    </a>
    <a href="https://www.instagram.com/okdock.station/" target="_blank" rel="noopener" aria-label="Instagram">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
    </a>
    <a href="mailto:station@okdock.mx" aria-label="Correo">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
    </a>
  </div>
</aside>


  <main class="wrap">
    <p class="crumbs"><a href="/">Inicio</a> › <a href="/tienda">Tienda</a><?php
      if ($esFamilia && $padre !== ''): ?> › <a href="/categoria/<?= e(ShopProduct::slug($padre)) ?>"><?= e($padre) ?></a><?php
      endif; ?> › <?= e($nombre) ?></p>
    <h1><?= e($nombre) ?> en Tijuana</h1>
    <p class="lead"><?= $total ?> producto<?= $total === 1 ? '' : 's' ?> con precio y existencia al día.<?php
      /* Si la categoría trae más de lo que cabe en la página, se dice — anunciar 1,200
         y enseñar 200 sin avisar se lee como que faltan cosas. */
      if ($listados < $total): ?> Aquí abajo, los <?= $listados ?> primeros.<?php endif; ?>
       Recoge gratis en OK.station (Centro Comercial Otay) o recíbelo a domicilio en todo México.</p>

    <?php if (!$prods): ?>
      <p class="empty">Por ahora no hay productos en esta categoría. <a href="/tienda">Ver toda la tienda</a></p>
    <?php else: ?>
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

    <?php if ($fams): ?>
    <section class="otras">
      <h2><?= $esFamilia ? 'Otras familias de productos' : 'Busca por tipo de producto' ?></h2>
      <div class="chips">
        <?php $puestos = 0; foreach ($fams as $f):
          if ((string) $f['subcategory'] === $nombre) continue;
          if (++$puestos > 40) break; ?>
          <a href="/categoria/<?= e(ShopProduct::slug((string) $f['subcategory'])) ?>"><?= e($f['subcategory']) ?> (<?= (int) $f['n'] ?>)</a>
        <?php endforeach; ?>
      </div>
    </section>
    <?php endif; ?>

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
  <script src="/assets/oknav.js?v=20260724a" defer></script>
</body>
</html>
