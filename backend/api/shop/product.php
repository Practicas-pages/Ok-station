<?php
/** GET /backend/api/shop/product.php?id=##  (o ?sku=XXX  ·  ?ref=REFERENCIA_EXEL)
 *  Detalle PÚBLICO de un producto. Solo activos. No expone costo/margen ni datos
 *  internos del proveedor.
 *
 *  Enriquecimiento PEREZOSO con Icecat: la 1a vista de un producto sin enriquecer
 *  baja de Icecat la ficha técnica e imágenes (complementa a Exel) y las CACHEA en
 *  la BD; las siguientes vistas salen al instante (no se llama a Icecat en cada
 *  visita). Así se muestra "la info del proveedor + la de Icecat" sin costo por vista.
 */
require __DIR__ . '/../_bootstrap.php';
/* Icecat.php y ProductEnricher.php ya NO se cargan aquí: el enriquecimiento pasó al
   runner nocturno (ver más abajo). Cargarlas era trabajo muerto en cada petición. */
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
$sti = db()->prepare(
    "SELECT COALESCE(stored_path, url) AS src
       FROM product_images WHERE product_id = ?
      ORDER BY is_primary DESC, sort_order ASC, id ASC"
);
$sti->execute([(int) $p['id']]);
$images = array_values(array_filter(array_column($sti->fetchAll(), 'src')));

/* ── Ficha técnica: specs_json puede venir como {source,specs:[...]} o como lista ── */
$specs = !empty($p['specs_json']) ? json_decode((string) $p['specs_json'], true) : null;
if (is_array($specs) && isset($specs['specs'])) $specs = $specs['specs'];

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
    'stock'       => (int) $p['stock'],
    'available'   => ((int) $p['stock'] > 0),
    'images'      => $images,
    'enriched'    => $p['enriched_at'] !== null,
]]);
