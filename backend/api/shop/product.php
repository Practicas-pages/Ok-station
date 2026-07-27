<?php
/** GET /backend/api/shop/product.php?id=##  (o ?sku=XXX  ·  ?ref=REFERENCIA_EXEL)
 *  Detalle PÚBLICO de un producto. Solo activos. No expone costo/margen ni datos
 *  internos del proveedor.
 *
 *  Lo consume la VISTA PREVIA de la tienda (el panel que abre al tocar un producto),
 *  así que tiene que devolver exactamente lo mismo que la ficha completa
 *  (/producto/<id>-<slug>): si no, el cliente ve dos versiones distintas del mismo
 *  producto según por dónde entre.
 */
require __DIR__ . '/../_bootstrap.php';
/* Este backend NO tiene autoloader: cada entrada requiere sus clases a mano.
   ShopProduct es quien decide la ficha técnica (Icecat si la hay, si no una básica
   con los datos de Exel), y se usa aquí para no tener dos criterios distintos. */
require __DIR__ . '/../lib/ShopProduct.php';
only_method('GET');

$id  = (int) ($_GET['id'] ?? 0);
$sku = trim((string) ($_GET['sku'] ?? ''));
$ref = trim((string) ($_GET['ref'] ?? ''));
if ($id <= 0 && $sku === '' && $ref === '') fail('Falta id, sku o ref.');

function shop_load_product(int $id, string $sku, string $ref): ?array
{
    if ($id > 0)          { $st = db()->prepare('SELECT * FROM products WHERE id = ? AND is_active = 1 LIMIT 1');  $st->execute([$id]); }
    elseif ($sku !== '')  { $st = db()->prepare('SELECT * FROM products WHERE sku = ? AND is_active = 1 LIMIT 1'); $st->execute([$sku]); }
    else                  { $st = db()->prepare("SELECT * FROM products WHERE supplier='exel' AND supplier_ref = ? AND is_active = 1 LIMIT 1"); $st->execute([$ref]); }
    $p = $st->fetch();
    return $p ?: null;
}

$p = shop_load_product($id, $sku, $ref);
if (!$p) fail('Producto no encontrado.', 404);

/* ── El enriquecimiento de Icecat NO se hace aquí, a propósito ──
   Antes se enriquecía en la primera vista de cada producto. Con el catálogo real
   (~5500 productos) eso significaba que el primer cliente en abrir cada ficha
   pagaba una llamada SÍNCRONA a Icecat: hasta 8 s de espera (Icecat::HTTP_TIMEOUT)
   más 5 s de conexión, sin límite de tasa y en una página pública. Un rastreo de
   Google recorriendo el catálogo ocupaba todos los workers de PHP-FPM.

   Quien enriquece es el runner nocturno `backend/tools/icecat-enrich.php`, que hace
   lo mismo por lotes y sin nadie esperando. Mientras un producto no esté enriquecido
   se muestra con lo que mandó Exel (nombre, marca, precio, stock), que es lo que
   importa para vender; la ficha y las fotos llegan esa misma noche. */

/* ── Imágenes (principal primero; copia local si ya se descargó, si no la URL origen) ── */
/* Mismo tope que la ficha completa (ShopProduct::MAX_IMAGENES): la galería muestra
   hasta 5 fotos, y algunos productos de Exel traen más de las que tiene sentido cargar. */
$sti = db()->prepare(
    "SELECT COALESCE(stored_path, url) AS src
       FROM product_images WHERE product_id = ?
      ORDER BY is_primary DESC, sort_order ASC, id ASC
      LIMIT " . ShopProduct::MAX_IMAGENES
);
$sti->execute([(int) $p['id']]);
$images = array_values(array_filter(array_column($sti->fetchAll(), 'src')));

/* ── Ficha técnica ──
   Se delega en ShopProduct::specs(), la MISMA que usa la ficha completa: devuelve la
   de Icecat si existe y, si no, una básica armada con los datos comerciales de Exel
   (marca, tipo y categoría). Los identificadores internos nunca salen en la ficha.

   Antes esto leía `specs_json` por su cuenta, y como Exel no manda especificaciones
   técnicas en ningún campo, la vista previa salía SIN ficha en casi todos los
   productos mientras la página del producto sí la mostraba. */
$specs = ShopProduct::specs($p);

respond(['ok' => true, 'product' => [
    'id'          => (int) $p['id'],
    'sku'         => $p['sku'],
    'name'        => $p['name'],
    'description' => $p['description'],
    'brand'       => $p['brand'],
    'category'    => $p['category'],
    'subcategory' => $p['subcategory'],
    'specs'       => $specs,
    'price'       => round((float) $p['price'] * 1.08, 2),  // lista con IVA 8% incl. (el checkout ajusta por geo)
    // Precio anterior (tachado) → descuento, misma convención que products.php: solo si de verdad es mayor.
    'old'         => ((float) $p['old_price'] > (float) $p['price']) ? round((float) $p['old_price'] * 1.08, 2) : null,
    'stock'       => (int) $p['stock'],
    'available'   => ((int) $p['stock'] > 0),
    'images'      => $images,
    'enriched'    => $p['enriched_at'] !== null,
]]);
