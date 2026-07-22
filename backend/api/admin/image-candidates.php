<?php
/**
 * GET /backend/api/admin/image-candidates.php?product_id=123
 * -----------------------------------------------------------------------------
 * Devuelve fotos CANDIDATAS para un producto, para que el trabajador escoja una en
 * el panel. Es el tercer nivel de enriquecimiento, pero con una diferencia que lo
 * cambia todo: NO publica nada por su cuenta.
 *
 * Por qué así y no automático: el riesgo de este nivel nunca fue técnico, fue
 * publicar la foto equivocada — la variante azul en el producto rojo. El cliente
 * pide, recibe otra cosa y devuelve. Ninguna heurística de coincidencia resuelve
 * eso con la seguridad que da una persona mirando la foto dos segundos. Aquí el
 * buscador propone y el humano dispone, y con eso el riesgo desaparece.
 *
 * Fuentes, en el orden de prioridad que ya rige el catálogo:
 *   1. Exel del Norte  — el proveedor manda; si tiene foto, esa va primero.
 *   2. Icecat          — la que ya se consulta para fichas.
 *   3. (pendiente)     — páginas oficiales de marca, cuando se compruebe cuáles
 *                        lo permiten. Se deja el hueco preparado, no simulado.
 *
 * Nunca devuelve resultados de Amazon, Mercado Libre, Google Imágenes ni tiendas
 * de terceros: no son fuentes autorizadas y traen problemas de derechos.
 *
 * Permiso: shop.view (el mismo de la vista de Catálogo).
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Icecat.php';
require __DIR__ . '/../lib/BuscadorMarca.php';   // antes que ImagenSegura: le aporta sus dominios
require __DIR__ . '/../lib/ImagenSegura.php';
only_method('GET');

$user = require_permission('shop.view');

$productId = (int) ($_GET['product_id'] ?? 0);
if ($productId <= 0) fail('Falta el producto.', 422);

$pdo = db();
/* Se trae también la descripción: el panel la usa para armar una búsqueda de la
   foto. Con productos genéricos ("arillo", "broche") el nombre solo no distingue,
   y la descripción sí dice de qué pieza se trata. */
$st = $pdo->prepare('SELECT id, name, brand, sku, supplier_ref, barcode, category, description FROM products WHERE id = ? LIMIT 1');
$st->execute([$productId]);
$p = $st->fetch(PDO::FETCH_ASSOC);
if (!$p) fail('Ese producto no existe.', 404);

$cands = [];
$notas = [];

/* ── Lo que YA tiene ──────────────────────────────────────────────────────────
   Se devuelve primero para que el trabajador vea de un vistazo si el producto ya
   tenía algo registrado (y por qué no se ve: registrada pero no descargada). */
$act = $pdo->prepare(
    'SELECT id, url, stored_path, source, is_primary FROM product_images
      WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC'
);
$act->execute([$productId]);
foreach ($act as $img) {
    $cands[] = [
        'origen'    => 'actual',
        'fuente'    => $img['source'],
        'url'       => $img['stored_path'] ?: $img['url'],
        'url_real'  => $img['url'],
        'descargada'=> !empty($img['stored_path']),
        'principal' => (int) $img['is_primary'] === 1,
        'nota'      => empty($img['stored_path'])
            ? 'Registrada pero NO descargada: hoy se sirve desde el origen y si ese enlace falla, el producto se queda sin foto.'
            : 'Guardada en nuestro servidor.',
    ];
}

/* ── Icecat ───────────────────────────────────────────────────────────────────
   Se consulta EN VIVO aunque el runner nocturno ya lo haya intentado: aquí hay una
   persona esperando y su catálogo pudo crecer desde la última corrida. Icecat.php
   ya cachea 30 días, así que repetir el clic no vuelve a pegarle a su API. */
if (Icecat::available()) {
    $data = Icecat::fetch([
        'gtin'  => (string) ($p['barcode'] ?? ''),
        'brand' => (string) ($p['brand'] ?? ''),
        'code'  => (string) ($p['sku'] ?? ''),
    ]);
    if ($data && !empty($data['images'])) {
        foreach ($data['images'] as $img) {
            if (empty($img['url'])) continue;
            $cands[] = [
                'origen'    => 'icecat',
                'fuente'    => 'icecat',
                'url'       => $img['url'],
                'principal' => !empty($img['is_primary']),
                'nota'      => 'De Icecat, emparejada por ' . ($p['barcode'] ? 'código de barras' : 'marca + clave') . '.',
            ];
        }
    } else {
        $notas[] = 'Icecat no tiene este producto. Es lo normal en marcas de papelería: '
                 . 'su versión gratuita solo cubre marcas patrocinadas (HP, Canon, Epson, Brother, Xerox, 3M).';
    }
} else {
    $notas[] = 'Icecat no está configurado en este servidor.';
}

/* ── Página oficial de la marca ───────────────────────────────────────────────
   Se busca EN EL SITIO DEL FABRICANTE, no en un buscador de imágenes: Google o
   Bing devuelven fotos de terceros cuyos derechos no tenemos y que muchas veces
   ni siquiera son del producto correcto. La foto del fabricante es suya,
   corresponde a su número de parte, y usarla para vender su producto es el uso
   previsto.

   Se prueba primero con la CLAVE (identifica el producto exacto) y, si no da
   nada, con el nombre (más tolerante pero menos preciso). */
$marca = trim((string) ($p['brand'] ?? ''));
if ($marca !== '' && BuscadorMarca::config($marca)) {
    /* UN solo intento, no una cadena de reintentos. Cada consulta al sitio del
       fabricante tarda ~1.2 s; encadenar clave, referencia y nombre dejaba al
       trabajador esperando 5 segundos ANTES de ver nada, y son ~282 productos de
       corrido. Se usa la clave, que es lo que identifica al producto; si no da
       resultado, el nombre casi nunca lo da tampoco y sale más barato pegar la
       foto que esperar. */
    $termino = trim((string) ($p['sku'] ?? '')) ?: trim((string) ($p['supplier_ref'] ?? '')) ?: $p['name'];

    $r          = BuscadorMarca::buscar($marca, $termino);
    $hallado    = $r['imagenes'];
    $ultimaNota = $r['nota'];
    foreach ($hallado as $img) {
        $cands[] = [
            'origen'    => 'marca',
            'fuente'    => $marca,
            'url'       => $img['url'],
            'pagina'    => $img['pagina'],
            'principal' => false,
            /* Se dice claramente que NADIE comprobó que sea este producto: es lo
               que la persona tiene que hacer al mirarla. */
            'nota'      => 'Encontrada en el sitio de ' . $marca . '. Compruébala antes de usarla.',
        ];
    }
    if (!$hallado && $ultimaNota !== '') $notas[] = $ultimaNota;
} elseif ($marca !== '') {
    $notas[] = 'No hay buscador configurado para ' . $marca . ' todavía. '
             . 'Búscala y pégala aquí con Ctrl+V — es la vía que siempre funciona.';
}

respond([
    'producto' => [
        'id'    => (int) $p['id'],
        'name'  => $p['name'],
        'brand' => $p['brand'],
        'sku'   => $p['sku'],
        'ref'   => $p['supplier_ref'],
        'barcode' => $p['barcode'],
        /* Recortada: el panel solo la usa para armar la búsqueda, no para mostrarla. */
        'description' => mb_strimwidth(trim((string) ($p['description'] ?? '')), 0, 300, ''),
    ],
    'candidatas' => $cands,
    'notas'      => $notas,
    /* Se le dicen al panel las reglas para que pueda avisar ANTES de subir, en vez
       de que el trabajador escoja una foto y el servidor se la rechace después. */
    'reglas' => [
        'min_lado'  => ImagenSegura::MIN_LADO,
        'max_mb'    => (int) (ImagenSegura::MAX_BYTES / 1024 / 1024),
        'formatos'  => array_values(ImagenSegura::MIMES),
    ],
]);
