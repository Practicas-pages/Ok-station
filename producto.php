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
  <script src="/assets/site-guard.js?v=20260625m"></script>
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
  <link rel="stylesheet" href="/styles.css?v=20260716b">
  <link rel="stylesheet" href="/assets/shop-header.css?v=20260717f">
  <link rel="stylesheet" href="/assets/producto.css?v=20260716b">
  <link rel="stylesheet" href="/assets/oki.css?v=20260716d">
  <?php if ($images): ?><link rel="preload" as="image" href="<?= e($images[0]) ?>" fetchpriority="high"><?php endif; ?>

  <script type="application/ld+json"><?= json_encode($ld, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?></script>
  <script type="application/ld+json"><?= json_encode($ldCrumbs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?></script>
</head>

<body id="top">
<a class="skip-link" href="#main">Saltar al contenido principal</a>

<!-- Barra del e-commerce: la MISMA de la tienda (ver assets/shop-header.css/js). En la
     ficha las acciones son de NAVEGACIÓN — el buscador sugiere y enlaza a fichas, el
     carrito/favoritos leen el mismo localStorage y las categorías llevan a la tienda. -->
<header class="shopbar">
  <!-- session-nav.js necesita #acct para arrancar; aquí vive OCULTO, solo para hospedar
       el menú de sesión. El chip visible es .tb-cuenta (session-nav lo convierte en avatar).
       OJO: NADA de class="acct" — esa clase trae display:inline-flex y le gana a [hidden],
       así que el chip se colaba VISIBLE encima de la barra. display:none en línea gana. -->
  <div id="acct" style="display:none">
    <a href="/cuenta" id="acct-login" aria-label="Iniciar sesión">Cuenta</a>
  </div>

  <div class="shopbar__top">
    <button class="shopbar__hamb" id="sbHamb" aria-label="Categorías"><span></span><span></span><span></span></button>
    <a class="shopbar__logo" href="/" aria-label="Ok.station — Ir al inicio"><img src="/assets/img/okstation-logo.webp" alt="Ok.station" width="158" height="24"></a>
    <div class="shopbar__search">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input id="sbSearch" type="search" placeholder="Busca tinta, tóner, papel, carpetas y más…" autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-label="Buscar productos">
      <div class="shopbar__ac" id="sbAc" role="listbox"></div>
    </div>
    <div class="shopbar__actions">
      <a class="tb-loc" href="/tienda#ubicacion" aria-label="Ubicación de entrega" title="Elige tu ubicación de entrega"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg><span class="tb-loc__txt"><small>Entrega en</small><b>Elige tu ubicación</b></span></a>
      <a class="tb-cuenta" href="/cuenta?next=/tienda%23store" aria-label="Cuenta"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span class="tb-name">Cuenta</span></a>
      <a class="tb-wa" href="https://wa.me/526647194117?text=Hola,%20quiero%20solicitar%20informaci%C3%B3n" target="_blank" rel="noopener" aria-label="WhatsApp" title="WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.040zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.017-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.29.173-1.414z"/></svg></a>
      <a class="tb-fav" href="/tienda#store" aria-label="Favoritos" title="Favoritos"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg><span class="ct" id="sbWishCount" style="display:none">0</span></a>
      <a class="tb-cart" href="/tienda#store" aria-label="Ver carrito"><span class="ct" id="sbCartCount">0</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6"/></svg><span id="sbCartTotal">$0.00</span></a>
    </div>
  </div>

  <div class="shopbar__cats" id="sbCats">
    <a class="shopbar__back" href="/tienda#store"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>Volver a la tienda</a>
    <span class="shopbar__catlabel">Categorías</span>
    <nav class="shopbar__rail" id="sbRail" aria-label="Categorías de la tienda"></nav>
    <div class="shopbar__railnavs">
      <button type="button" class="shopbar__railnav" id="sbRailPrev" aria-label="Ver categorías anteriores"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
      <button type="button" class="shopbar__railnav" id="sbRailNext" aria-label="Ver más categorías"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
    </div>
  </div>
</header>

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
          <!-- El zoom se activa solo si el puntero es un mouse: con el dedo estorba. -->
          <div class="pdp__stage" id="pdpStage">
            <img id="pdpMain" src="<?= e($images[0]) ?>" alt="<?= e($name) ?>" width="600" height="600" fetchpriority="high" decoding="async">
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
          <div class="pdp__stage pdp__stage--empty"><span>📦</span></div>
        <?php endif; ?>
      </section>

      <!-- ── Buy box ── -->
      <section class="pdp__buy" aria-label="Comprar">
        <div class="pdp__meta">
          <?php if ($brand !== ''): ?><b><?= e($brand) ?></b><?php endif; ?>
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
          <a class="pdp__add pdp__add--wa" href="https://wa.me/526647194117?text=<?= rawurlencode('Hola, ¿cuándo tendrán ' . $name . '?') ?>" target="_blank" rel="noopener">Avísame por WhatsApp cuando llegue</a>
        <?php endif; ?>

        <ul class="pdp__perks">
          <li><span aria-hidden="true">🏪</span> <b>Recoge GRATIS</b> en OK.station, Centro Comercial Otay</li>
          <li><span aria-hidden="true">🚚</span> Envío a domicilio en todo México</li>
          <li><span aria-hidden="true">🔒</span> Pago seguro con Mercado Pago</li>
          <li><span aria-hidden="true">🧾</span> Facturamos: pídelo por WhatsApp</li>
        </ul>

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
              <?php else: ?><span aria-hidden="true">📦</span><?php endif; ?>
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
<script src="/assets/oki.js?v=20260717d" defer></script>
</body>
</html>
