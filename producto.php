<?php
declare(strict_types=1);
/**
 * Ok.station — Página PÚBLICA de un producto de la tienda.
 * -----------------------------------------------------------------------------
 * URL canónica:  /producto/49-toner-hp-85a-negro     (la reescribe .htaccess)
 *
 * Es la ÚNICA página del sitio que se arma en el servidor, y es a propósito: una
 * ficha de producto vive del SEO. Al llegar el HTML ya hecho, Google puede leer el
 * título, la descripción y el bloque Product de schema.org (precio, existencia,
 * marca, imágenes) y mostrar el producto con su precio en los resultados. Con una
 * página vacía llenada por JavaScript, eso no pasa.
 *
 * El carrito sigue siendo del NAVEGADOR (localStorage, igual que en la tienda):
 * esta página solo agrega ahí, no inventa un carrito de servidor.
 */

/* ── Arranque propio (NO se usa _bootstrap.php: ese manda cabeceras JSON) ── */
$configFile = __DIR__ . '/backend/api/config.php';
if (!file_exists($configFile)) { http_response_code(500); exit('Falta backend/api/config.php'); }
$CONFIG = require $configFile;

function db(): PDO {
    static $pdo = null;
    global $CONFIG;
    if ($pdo) return $pdo;
    $d = $CONFIG['db'];
    $pdo = new PDO(
        "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
        $d['user'], $d['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    return $pdo;
}
/* Este backend NO tiene autoloader: cada entrada requiere sus clases a mano. */
require __DIR__ . '/backend/api/lib/ShopProduct.php';
/* Icecat.php y ProductEnricher.php ya NO se cargan aquí: el enriquecimiento pasó al
   runner nocturno (ver más abajo). Cargarlas era trabajo muerto en cada vista. */

/** Manda un 404 de verdad (para Google) con la página de error del sitio. */
function producto_404(): void {
    http_response_code(404);
    $f = __DIR__ . '/404.html';
    if (is_file($f)) { readfile($f); exit; }
    exit('Producto no encontrado.');
}

$id = (int) ($_GET['id'] ?? 0);
if ($id <= 0) producto_404();

try { $row = ShopProduct::findRow(db(), $id); }
catch (Throwable $e) { http_response_code(503); exit('La tienda no está disponible en este momento.'); }
if (!$row) producto_404();

/* El enriquecimiento de Icecat NO se hace aquí, a propósito. Antes esta página bajaba
   la ficha en la PRIMERA visita de cada producto, de forma síncrona: hasta 8 s de
   espera (Icecat::HTTP_TIMEOUT) más 5 s de conexión, en la página pública que Google
   rastrea. Con ~5500 productos eso deja el sitio inservible durante un rastreo.
   Lo hace el runner nocturno `backend/tools/icecat-enrich.php`. Hasta entonces la
   ficha se arma con lo de Exel, que es lo que hace falta para vender. */

/* URL canónica: si llegaron con un slug viejo o sin él, se manda un 301 al bueno.
   Sin esto, la misma ficha viviría en muchas URLs y Google reparte el peso entre
   todas (contenido duplicado). */
$canonPath = ShopProduct::url((int) $row['id'], (string) $row['name']);
$reqPath   = (string) parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
if ($reqPath !== '' && rtrim($reqPath, '/') !== $canonPath && strpos($reqPath, '/producto') === 0) {
    header('Location: ' . $canonPath, true, 301);
    exit;
}

$images  = ShopProduct::images(db(), (int) $row['id']);
$specs   = ShopProduct::specs($row);
$related = ShopProduct::related(db(), $row, 6);

$price   = ShopProduct::price($row);
$old     = ShopProduct::oldPrice($row);
$stock   = (int) $row['stock'];
$off     = $old ? (int) round((1 - $price / $old) * 100) : 0;

$name    = (string) $row['name'];
$brand   = trim((string) ($row['brand'] ?? ''));
$cat     = trim((string) ($row['category'] ?? ''));
$sub     = trim((string) ($row['subcategory'] ?? ''));
$sku     = trim((string) ($row['sku'] ?? ''));

/* Descripción: viene de Icecat con HTML; aquí se usa como TEXTO plano. */
$descRaw = trim((string) ($row['description'] ?? ''));
$desc    = trim(preg_replace('/\s+/', ' ', strip_tags($descRaw)) ?? '');

/* Meta description: la de Icecat recortada; si no hay, una honesta con lo que sí sabemos. */
$metaDesc = $desc !== ''
    ? mb_substr($desc, 0, 155)
    : trim("$name" . ($brand ? " de $brand" : '') . ". Cómpralo en OK.station, Otay, Tijuana. Recoge gratis en tienda o pide envío a domicilio.");

$title    = $name . ($brand && stripos($name, $brand) === false ? " · $brand" : '') . ' | OK.station';
$siteUrl  = 'https://okstation.mx';
$canonUrl = $siteUrl . $canonPath;

/* Las imágenes pueden venir de DOS lados: locales (/assets/img/products/…, cuando
   ya corrió download-product-images.php) o del CDN de Icecat (URL absoluta, si
   todavía no se han bajado). Anteponer el dominio a ciegas producía
   "https://okstation.mxhttps://images.icecat.biz/…", lo que dejaba sin miniatura
   al compartir en WhatsApp/Facebook y hacía que Google descartara la imagen del
   bloque Product — justo lo que esta página existe para lograr. */
function abs_url(string $path): string {
    global $siteUrl;
    return preg_match('~^https?://~i', $path) ? $path : $siteUrl . $path;
}

$ogImage  = abs_url($images ? $images[0] : '/assets/img/hero-okstation.webp');

function e(?string $s): string { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
function mxn(float $n): string { return '$' . number_format($n, 2); }

/* ── schema.org Product: es lo que permite que Google muestre precio y existencia ── */
$ld = [
    '@context'    => 'https://schema.org',
    '@type'       => 'Product',
    'name'        => $name,
    'sku'         => $sku !== '' ? $sku : (string) $row['id'],
    'description' => $metaDesc,
    'url'         => $canonUrl,
    'image'       => array_map('abs_url', $images ?: ['/assets/img/hero-okstation.webp']),
    'offers'      => [
        '@type'         => 'Offer',
        'url'           => $canonUrl,
        'priceCurrency' => 'MXN',
        'price'         => number_format($price, 2, '.', ''),
        'availability'  => $stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        'itemCondition' => 'https://schema.org/NewCondition',
        'seller'        => ['@type' => 'Organization', 'name' => 'Ok.station'],
    ],
];
if ($brand !== '') $ld['brand'] = ['@type' => 'Brand', 'name' => $brand];
if ($cat !== '')   $ld['category'] = $cat . ($sub !== '' ? " > $sub" : '');

$crumbs = [['Inicio', $siteUrl . '/'], ['Tienda', $siteUrl . '/tienda']];
if ($cat !== '') $crumbs[] = [$cat, $siteUrl . '/tienda#store'];
$crumbs[] = [$name, $canonUrl];
$ldCrumbs = [
    '@context'        => 'https://schema.org',
    '@type'           => 'BreadcrumbList',
    'itemListElement' => array_map(fn($c, $i) => [
        '@type' => 'ListItem', 'position' => $i + 1, 'name' => $c[0], 'item' => $c[1],
    ], $crumbs, array_keys($crumbs)),
];
?>
<!DOCTYPE html>
<!-- Ok.station — Ficha de producto. Se arma en el servidor por SEO (ver comentario arriba). -->
<html lang="es-MX">
<head>
  <meta charset="UTF-8">
  <script src="/assets/site-guard.js?v=20260720a"></script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">

  <title><?= e($title) ?></title>
  <meta name="description" content="<?= e($metaDesc) ?>">
  <meta name="author" content="Ok.station — OK Dock">
  <meta name="robots" content="<?= $stock > 0 ? 'index, follow, max-image-preview:large' : 'noindex, follow' ?>">
  <meta name="theme-color" content="#066CFF">
  <link rel="canonical" href="<?= e($canonUrl) ?>">

  <meta property="og:type" content="product">
  <meta property="og:site_name" content="Ok.station">
  <meta property="og:locale" content="es_MX">
  <meta property="og:title" content="<?= e($name) ?>">
  <meta property="og:description" content="<?= e($metaDesc) ?>">
  <meta property="og:url" content="<?= e($canonUrl) ?>">
  <meta property="og:image" content="<?= e($ogImage) ?>">
  <meta property="product:price:amount" content="<?= e(number_format($price, 2, '.', '')) ?>">
  <meta property="product:price:currency" content="MXN">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="<?= e($name) ?>">
  <meta name="twitter:description" content="<?= e($metaDesc) ?>">
  <meta name="twitter:image" content="<?= e($ogImage) ?>">

  <link rel="icon" href="/assets/img/OKD-Isotipo-Azul-96.png?v=20260710" type="image/png" sizes="96x96">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap"></noscript>
  <!-- Tema (claro/oscuro): antes de la hoja para pintar ya con el tema elegido -->
  <script src="/assets/theme.js?v=20260721a"></script>
  <link rel="stylesheet" href="/styles.css?v=20260716b">
  <link rel="stylesheet" href="/assets/shop-header.css?v=20260717f">
  <link rel="stylesheet" href="/assets/producto.css?v=20260716b">
  <link rel="stylesheet" href="/assets/oki.css?v=20260716d">
  <?php if ($images): ?><link rel="preload" as="image" href="<?= e($images[0]) ?>" fetchpriority="high"><?php endif; ?>

  <script type="application/ld+json"><?= json_encode($ld, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?></script>
  <script type="application/ld+json"><?= json_encode($ldCrumbs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?></script>
  <link rel="stylesheet" href="/assets/oknav.css">
</head>

<body id="top">
<a class="skip-link" href="#main">Saltar al contenido principal</a>

<!-- Barra del e-commerce: la MISMA de la tienda (ver assets/shop-header.css/js). En la
     ficha las acciones son de NAVEGACIÓN — el buscador sugiere y enlaza a fichas, el
     carrito/favoritos leen el mismo localStorage y las categorías llevan a la tienda. -->
<!-- ─────────────────────────────────────────────────────────────────────────
     Ok.station — NAVBAR UNIFICADO · marcado canónico
     Esta es la COPIA MAESTRA. Va pegada tal cual en cada página (no se inyecta
     por JavaScript a propósito: los enlaces de navegación deben venir en el HTML
     para que Google los siga, que es justo por lo que la ficha se arma en el
     servidor).
     Necesita:  <link rel="stylesheet" href="/assets/oknav.css">
                <script src="/assets/oknav.js" defer></script>
     Todos los <svg> llevan width/height propios: sin tamaño intrínseco un icono
     se pinta gigante mientras el CSS va en camino (ya pasó con el del correo).
     ───────────────────────────────────────────────────────────────────────── -->
<header class="oknav" id="oknav">

  <!-- ══ CINTURILLO · lo mismo que traía .header-bar del sitio ═══════════════
       Enlaces a la izquierda, lema al centro y redes a la derecha. En celular
       se oculta entero: sus enlaces ya están en el cajón ☰ y aquí solo haría
       más alta una barra que ya es pegajosa. -->
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

  <!-- ══ FILA 1 · logo · buscador · ubicación · cuenta · deseados · carrito ══ -->
  <div class="oknav__row oknav__row--main">
    <div class="oknav__wrap">

      <button type="button" class="oknav__burger" id="oknavBurger"
              aria-label="Abrir menú" aria-expanded="false" aria-controls="oknavDrawer">
        <span></span><span></span><span></span>
      </button>

      <a class="oknav__logo" href="/" aria-label="Ok.station — Ir al inicio">
        <img src="/assets/img/okstation-logo.webp" alt="Ok.station" width="158" height="24">
      </a>

      <div class="oknav__search">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
        </svg>
        <!-- Sin botón de buscar: se envía con Enter, igual que el buscador del
             resto del sitio (.shopbar__search). Con botón quedaban DOS lupas
             en el mismo campo. -->
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

  <!-- ══ FILA 2 · tienda ┃ servicios ······ WhatsApp ══════════════════════ -->
  <div class="oknav__row oknav__row--nav">
    <div class="oknav__wrap">

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

  <!-- Desplegable de categorías (lo llena oknav.js con las de la BD) -->
  <div class="oknav__catsmenu" id="oknavCatsMenu" hidden></div>
</header>

<!-- ══ Cajón ☰ (celular y tablet) ═══════════════════════════════════════════
     Aquí viven las cosas que NO merecen una fila propia en el encabezado:
     los servicios, "¿Quiénes somos?/Contacto" y las redes sociales. -->
<div class="oknav__scrim" id="oknavScrim" hidden></div>
<aside class="oknav__drawer" id="oknavDrawer" aria-label="Menú" hidden>
  <div class="oknav__dhead">
    <img src="/assets/img/okstation-logo.webp" alt="Ok.station" width="132" height="20">
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
    <!-- En celular el botón de tema no cabe en la barra (se iba a un tercer
         renglón), así que vive aquí. Lo mueve OKTheme, el mismo de theme.js. -->
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

<main id="main" class="pdp">
  <div class="wrap">
    <nav class="breadcrumb" aria-label="Ruta de navegación">
      <ol>
        <li><a href="/">Inicio</a></li>
        <li><a href="/tienda#store">Tienda</a></li>
        <?php if ($cat !== ''): ?><li><a href="/tienda#store" data-ir-cat="<?= e($cat) ?>"><?= e($cat) ?></a></li><?php endif; ?>
        <li><span aria-current="page"><?= e($name) ?></span></li>
      </ol>
    </nav>

    <div class="pdp__grid">
      <!-- ── Galería ── -->
      <section class="pdp__gallery" aria-label="Imágenes del producto">
        <?php if ($off > 0): ?><span class="pdp__off">−<?= $off ?>%</span><?php endif; ?>
        <?php if ($images): ?>
          <!-- El zoom se activa solo si el puntero es un mouse: con el dedo estorba.
               pdpLens = recuadro que marca QUÉ se está viendo; pdpZoom = panel al lado
               con esa zona ampliada. Los pinta el JS al entrar el cursor y los quita al
               salir, así que arrancan ocultos y sin ocupar lugar. -->
          <div class="pdp__stage" id="pdpStage">
            <img id="pdpMain" src="<?= e($images[0]) ?>" alt="<?= e($name) ?>" width="600" height="600" fetchpriority="high" decoding="async">
            <div class="pdp__lens" id="pdpLens" hidden aria-hidden="true"></div>
          </div>
          <div class="pdp__zoom" id="pdpZoom" hidden aria-hidden="true">
            <span class="pdp__zoomhint" id="pdpZoomHint"></span>
          </div>
          <?php if (count($images) > 1): ?>
          <div class="pdp__thumbs" role="tablist" aria-label="Más imágenes">
            <?php foreach ($images as $i => $src): ?>
              <button type="button" role="tab" class="pdp__thumb<?= $i === 0 ? ' on' : '' ?>" aria-selected="<?= $i === 0 ? 'true' : 'false' ?>" data-src="<?= e($src) ?>" aria-label="Imagen <?= $i + 1 ?>">
                <img src="<?= e($src) ?>" alt="" loading="lazy" width="72" height="72" decoding="async">
              </button>
            <?php endforeach; ?>
          </div>
          <?php endif; ?>
        <?php else: ?>
          <!-- Sin foto: wordmark Ok.station sobre fondo transparente (no un 📦 genérico). -->
          <div class="pdp__stage pdp__stage--empty"><img class="ph-logo" src="/assets/img/placeholder-producto.svg" alt="Producto sin imagen" width="280" height="280" loading="lazy"></div>
        <?php endif; ?>
      </section>

      <!-- ── Buy box ── -->
      <section class="pdp__buy" aria-label="Comprar">
        <div class="pdp__meta">
          <?php if ($brand !== ''): ?><a class="pdp__brand" href="/tienda#store" data-ir-brand="<?= e($brand) ?>" title="Ver todo lo de <?= e($brand) ?> en la tienda"><?= e($brand) ?></a><?php endif; ?>
          <?php if ($sku !== ''): ?><span>SKU <?= e($sku) ?></span><?php endif; ?>
          <?php if ($sub !== ''): ?><span><?= e($sub) ?></span><?php endif; ?>
        </div>
        <h1 class="pdp__title"><?= e($name) ?></h1>

        <div class="pdp__price">
          <span class="pdp__now"><?= mxn($price) ?></span>
          <?php if ($old): ?>
            <s class="pdp__was"><?= mxn($old) ?></s>
            <span class="pdp__save">Ahorras <?= mxn($old - $price) ?></span>
          <?php endif; ?>
        </div>
        <p class="pdp__iva">Precio con IVA incluido · El IVA final se ajusta según tu estado al pagar.</p>

        <p class="pdp__stock<?= $stock <= 5 ? ' is-low' : '' ?>">
          <?php if ($stock <= 0): ?>Agotado por ahora
          <?php elseif ($stock <= 5): ?>🔥 ¡Últimas <?= $stock ?> piezas!
          <?php else: ?>✓ <?= $stock ?> disponibles<?php endif; ?>
        </p>

        <?php if ($stock > 0): ?>
        <div class="pdp__actions">
          <div class="pdp__qty" role="group" aria-label="Cantidad">
            <button type="button" id="pdpMinus" aria-label="Quitar uno">−</button>
            <input id="pdpQty" type="number" value="1" min="1" max="<?= $stock ?>" inputmode="numeric" aria-label="Cantidad">
            <button type="button" id="pdpPlus" aria-label="Agregar uno">+</button>
          </div>
          <button type="button" class="pdp__add" id="pdpAdd"
                  data-id="<?= (int) $row['id'] ?>" data-stock="<?= $stock ?>">Agregar al carrito</button>
          <button type="button" class="pdp__wish" id="pdpWish" aria-label="Guardar en favoritos" aria-pressed="false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>
          </button>
        </div>
        <?php else: ?>
          <!-- Agotado: el SISTEMA avisa por correo cuando el sync de Exel le devuelva
               existencia (stock_alerts + exel-sync). Ya no depende de WhatsApp manual. -->
          <button type="button" class="pdp__add pdp__add--wa" id="pdpAlert" data-id="<?= (int) $row['id'] ?>"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:5px"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>Avísame por correo cuando llegue</button>
          <div id="pdpAlertBox" hidden style="margin-top:10px;padding:14px;border:1.5px solid #e3e6ee;border-radius:14px;background:#fff">
            <p style="margin:0 0 8px;font-size:.86rem;font-weight:700">¿A qué correo te avisamos?</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
              <button type="button" class="pdp-alert-opt" id="paMio" style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:8px 14px;border:1.5px solid #066CFF;border-radius:999px;background:#eef5ff;color:#066CFF;font:inherit;font-size:.83rem;font-weight:600;cursor:pointer"></button>
              <button type="button" class="pdp-alert-opt" id="paOtro" style="padding:8px 14px;border:1.5px solid #e3e6ee;border-radius:999px;background:#fff;font:inherit;font-size:.83rem;font-weight:600;cursor:pointer">Otro correo</button>
            </div>
            <input id="paEmail" type="email" maxlength="190" placeholder="correo@ejemplo.com" hidden style="width:100%;padding:9px 12px;border:1.5px solid #e3e6ee;border-radius:10px;font:inherit;font-size:.86rem;margin-bottom:8px">
            <button type="button" id="paGo" style="width:100%;padding:11px;border:0;border-radius:999px;background:#066CFF;color:#fff;font:inherit;font-weight:700;cursor:pointer">Avisarme</button>
            <p id="paMsg" style="margin:8px 0 0;font-size:.8rem" hidden></p>
          </div>
        <?php endif; ?>

        <ul class="pdp__perks">
          <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;color:var(--brand-blue,#066CFF);margin-top:1px"><path d="M3 9l1-5h16l1 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/></svg> <b>Recoge GRATIS</b> en OK.station, Centro Comercial Otay</li>
          <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;color:var(--brand-blue,#066CFF);margin-top:1px"><rect x="1" y="4" width="15" height="12" rx="1.5"/><path d="M16 8h3.6L23 11.4V16h-7z"/><circle cx="5.5" cy="18.5" r="1.8"/><circle cx="18.5" cy="18.5" r="1.8"/></svg> Envío a domicilio en todo México</li>
          <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;color:var(--brand-blue,#066CFF);margin-top:1px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Pago seguro con Mercado Pago</li>
          <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;color:var(--brand-blue,#066CFF);margin-top:1px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg> Facturamos: pídelo por WhatsApp</li>
        </ul>

        <?php
        /* ── Medios de pago ──
           Solo lo que de verdad se acepta: Visa, Mastercard y American Express
           (crédito y débito), cobrados a través de Mercado Pago.
           Los logotipos son marcas registradas y no se dibujan a mano: se apunta al
           archivo oficial y, mientras no esté subido, el onerror deja una etiqueta de
           texto con el nombre. Así la sección se ve bien HOY y se actualiza sola en
           cuanto los .svg existan, sin tocar este archivo. */
        $pagos = [
            ['visa',       'Visa'],
            ['mastercard', 'Mastercard'],
            ['amex',       'American Express'],
        ];
        ?>
        <section class="pdp__pay" aria-label="Medios de pago">
          <h2 class="pdp__pay-title">Medios de pago</h2>

          <p class="pdp__pay-sub">Tarjetas de crédito y débito</p>
          <ul class="pdp__pay-list">
            <?php foreach ($pagos as [$slug, $label]): ?>
              <li class="pdp__pay-item">
                <img src="/assets/img/pay/<?= e($slug) ?>.svg" alt="<?= e($label) ?>"
                     width="52" height="32" loading="lazy" decoding="async"
                     onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'pdp__pay-txt',textContent:this.alt}))">
              </li>
            <?php endforeach; ?>
          </ul>

          <p class="pdp__pay-sub">Procesado por</p>
          <ul class="pdp__pay-list">
            <li class="pdp__pay-item">
              <img src="/assets/img/pay/mercadopago.svg" alt="Mercado Pago"
                   width="86" height="32" loading="lazy" decoding="async"
                   onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'pdp__pay-txt',textContent:this.alt}))">
            </li>
          </ul>

          <p class="pdp__pay-note">Tus datos viajan cifrados: la tarjeta la cobra Mercado Pago, nosotros no la guardamos.</p>
        </section>

        <!-- Innovación: la ficha del producto ya está aquí; OKi puede responder sobre ELLA. -->
        <button type="button" class="pdp__oki" id="pdpOki">
          <span class="pdp__oki-ico" aria-hidden="true">🚀</span>
          <span><b>¿Dudas de este producto?</b><small>Pregúntale a OKi: para qué sirve, con qué es compatible…</small></span>
        </button>
      </section>
    </div>

    <!-- ── Descripción y ficha ── -->
    <div class="pdp__info">
      <?php if ($desc !== ''): ?>
      <section class="pdp__card" id="descripcion">
        <h2>Descripción</h2>
        <div class="pdp__desc" id="pdpDesc"><p><?= e($desc) ?></p></div>
        <?php if (mb_strlen($desc) > 420): ?>
          <button type="button" class="pdp__more" id="pdpDescMore" aria-expanded="false" aria-controls="pdpDesc">Leer más</button>
        <?php endif; ?>
      </section>
      <?php endif; ?>

      <?php if ($specs): ?>
      <section class="pdp__card" id="ficha">
        <h2>Ficha técnica</h2>
        <dl class="pdp__specs" id="pdpSpecs">
          <?php foreach ($specs as $i => $s):
            $sn = trim((string) ($s['name'] ?? ''));
            $sv = trim((string) ($s['value'] ?? ''));
            if ($sn === '' || $sv === '') continue; ?>
            <div class="pdp__spec<?= $i >= 8 ? ' is-extra' : '' ?>">
              <dt><?= e($sn) ?></dt><dd><?= e($sv) ?></dd>
            </div>
          <?php endforeach; ?>
        </dl>
        <?php if (count($specs) > 8): ?>
          <button type="button" class="pdp__more" id="pdpSpecsMore" aria-expanded="false" aria-controls="pdpSpecs">Ver ficha completa (<?= count($specs) ?>)</button>
        <?php endif; ?>
      </section>
      <?php endif; ?>

      <?php if ($desc === '' && !$specs): ?>
      <section class="pdp__card">
        <h2>Descripción</h2>
        <p class="pdp__empty">Todavía no tenemos la ficha de este producto. Escríbenos por WhatsApp al 664 719 4117 y te contamos todo lo que necesites saber.</p>
      </section>
      <?php endif; ?>
    </div>

    <!-- ── Relacionados ── -->
    <?php if ($related): ?>
    <section class="pdp__related" aria-label="Productos relacionados">
      <div class="pdp__related-head">
        <h2>También de <?= e($cat !== '' ? $cat : 'la tienda') ?></h2>
        <a href="/tienda#store" class="pdp__seeall">Ver toda la tienda →</a>
      </div>
      <div class="pdp__rel-grid">
        <?php foreach ($related as $r): ?>
          <a class="pdp__rel" href="<?= e($r['url']) ?>">
            <?php if ($r['old']): ?><span class="pdp__rel-off">−<?= (int) round((1 - $r['price'] / $r['old']) * 100) ?>%</span><?php endif; ?>
            <div class="pdp__rel-img">
              <?php if ($r['image']): ?><img src="<?= e($r['image']) ?>" alt="" loading="lazy" width="120" height="120" decoding="async">
              <?php else: /* Sin foto (Icecat/Exel no la traen) → logo de Ok.station centrado. */ ?><img class="ph-logo" src="/assets/img/placeholder-producto.svg" alt="" loading="lazy" width="120" height="120" decoding="async"><?php endif; ?>
            </div>
            <h3><?= e($r['name']) ?></h3>
            <div class="pdp__rel-price"><?= mxn($r['price']) ?><?php if ($r['old']): ?> <s><?= mxn($r['old']) ?></s><?php endif; ?></div>
          </a>
        <?php endforeach; ?>
      </div>
    </section>
    <?php endif; ?>
  </div>
</main>

<div class="pdp__toast" id="pdpToast" role="status" aria-live="polite"></div>

<!-- Barra de compra pegada abajo en móvil: en la ficha, el botón de comprar no puede
     quedarse arriba y perderse al hacer scroll. -->
<?php if ($stock > 0): ?>
<div class="pdp__bar" id="pdpBar">
  <div class="pdp__bar-price"><b><?= mxn($price) ?></b><?php if ($old): ?><s><?= mxn($old) ?></s><?php endif; ?></div>
  <button type="button" class="pdp__add" id="pdpAddBar" data-id="<?= (int) $row['id'] ?>" data-stock="<?= $stock ?>">Agregar al carrito</button>
</div>
<?php endif; ?>

<script>
  /* Datos del producto para el carrito del NAVEGADOR (mismo localStorage que la
     tienda) y para que OKi sepa de qué producto estás preguntando.
     JSON_HEX_TAG/AMP/APOS/QUOT: blinda el script inline por si un nombre del catálogo
     (Exel/Icecat) trae la cadena de cierre de etiqueta u otros caracteres que lo
     romperían. (OJO: NO escribir esa cadena literal ni en los comentarios: el parser
     de HTML cerraría el script ahí mismo — fue justo el bug que rompió esta página.) */
  window.OK_PDP = <?= json_encode([
      'id'    => (int) $row['id'],
      'name'  => $name,
      'price' => $price,
      'old'   => $old,
      'stock' => $stock,
      'image' => $images[0] ?? null,
      'brand' => $brand,
      'cat'   => $cat,
      'sub'   => $sub,
      'sku'   => $sku,
      'url'   => $canonPath,
  ], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
  /* Los relacionados de ESTA ficha, para que el puente del carrito (shop-cart.js) los
     conozca sin pedirlos de nuevo, y OKi pueda recomendarlos con datos reales. */
  window.OK_PDP_RELATED = <?= json_encode(array_map(function ($r) {
      return ['id' => $r['id'], 'name' => $r['name'], 'price' => $r['price'], 'old' => $r['old'],
              'stock' => $r['stock'], 'image' => $r['image'], 'brand' => $r['brand'], 'url' => $r['url']];
  }, $related), JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
</script>
<!-- shop-cart.js va ANTES de oki.js: define window.OKtienda (el puente del carrito con
     datos REALES) para que OKi muestre la MISMA lista que el e-commerce, no el respaldo. -->
<script src="/assets/shop-cart.js?v=20260717c" defer></script>
<script src="/assets/shop-header.js?v=20260717f" defer></script>
<script src="/assets/producto.js?v=20260717a" defer></script>
<script src="/assets/session-nav.js?v=20260717a" defer></script>
<script src="/assets/address-book.js?v=20260717a" defer></script>
<script src="/assets/catalogo.js?v=20260716a" defer></script>
<script src="/assets/ok-anim.js?v=20260722a" defer></script>
<script src="/assets/oki.js?v=20260717d" defer></script>
  <script src="/assets/oknav.js" defer></script>
</body>
</html>
