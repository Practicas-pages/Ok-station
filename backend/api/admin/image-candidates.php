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
 * Fuentes, en el orden de prioridad que rige el catálogo:
 *   1. Exel del Norte  — el proveedor manda; si tiene foto, esa va primero.
 *   2. Icecat          — la que ya se consulta para fichas.
 *   3. Sitio de marca  — hoy sin marcas activas: se probaron y ninguna sirve
 *                        (ver BuscadorMarca.php, con la evidencia dentro).
 *   4. Buscador de imágenes — por la API oficial de Google, no leyendo su página
 *                        de resultados (su robots.txt lo prohíbe: Disallow /search).
 *
 * Sobre el punto 4: al principio se descartó cualquier buscador porque devuelve
 * imágenes de terceros. Se mantiene el motivo pero cambia la conclusión, y vale
 * la pena explicar por qué. Lo que hacía peligroso a un buscador era que una
 * MÁQUINA eligiera sola: publicaría la variante equivocada sin que nadie lo note.
 * Aquí sus resultados solo se PROPONEN — cada uno con el sitio de donde sale— y
 * quien elige es una persona que ve la foto. Es exactamente lo que ya podía hacer
 * pegando una imagen con Ctrl+V; esto solo le ahorra los clics.
 * Y hay una razón práctica: se midió el catálogo y ni Exel (0%), ni Icecat, ni los
 * sitios de las marcas tienen estas fotos. Sin esto no hay candidatas que mostrar.
 *
 * Permiso: shop.view (el mismo de la vista de Catálogo).
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Icecat.php';
require __DIR__ . '/../lib/BuscadorMarca.php';    // antes que ImagenSegura: le aporta sus dominios
require __DIR__ . '/../lib/BuscadorImagenes.php';
require __DIR__ . '/../lib/Nextep.php';
require __DIR__ . '/../lib/ImagenSegura.php';
only_method('GET');

$user = require_permission('shop.view');

$productId = (int) ($_GET['product_id'] ?? 0);
$consultaManual = mb_substr(trim((string) ($_GET['q'] ?? '')), 0, 160);
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
}

/* ── NEXTEP: el fabricante, directo ───────────────────────────────────────────
   NEXTEP es la marca con más huecos. Su API pública devuelve la foto por clave
   NE-xxx (exacta) y, cuando esa clave no quedó guardada en el feed de Exel, por
   parecido de NOMBRE (aquí sí puede confundir la variante, por eso se PROPONE y
   la persona elige). Va antes que el buscador de Google: es el fabricante, la
   fuente más confiable, y sus fotos deben salir primero. */
if (Nextep::esNextep($marca)) {
    $clave = '';
    foreach ([(string) ($p['sku'] ?? ''), (string) ($p['supplier_ref'] ?? '')] as $c) {
        if (Nextep::claveValida($c)) { $clave = Nextep::normalizarClave($c); break; }
    }
    $porClave = $clave !== '' ? Nextep::porClave($clave) : null;

    if ($porClave && $porClave['imagenes']) {
        /* Match EXACTO por número de parte: primero y sin advertencia de variante. */
        foreach ($porClave['imagenes'] as $u) {
            $cands[] = [
                'origen' => 'nextep', 'fuente' => 'NEXTEP', 'url' => $u, 'principal' => false,
                'nota'   => 'Del fabricante NEXTEP, por clave ' . $clave . ' (coincidencia exacta).',
            ];
        }
    } else {
        /* Sin clave: se proponen las que más se parecen por nombre. La persona
           distingue la variante correcta viéndolas. */
        foreach (Nextep::porNombre((string) $p['name']) as $m) {
            $cands[] = [
                'origen' => 'nextep', 'fuente' => 'NEXTEP · ' . $m['clave'], 'url' => $m['url'],
                'medidas'=> '', 'principal' => false,
                'nota'   => 'Del fabricante NEXTEP, por parecido de nombre (' . round($m['score'] * 100) . '%). '
                          . 'CONFIRMA que sea la variante correcta: «' . mb_strimwidth($m['nombre'], 0, 70, '…') . '».',
            ];
        }
    }
}

/* ── Buscador de imágenes (Google Custom Search) ──────────────────────────────
   La fuente que de verdad propone candidatas para este catálogo. Se llega aquí
   después de haber comprobado que ni Exel, ni Icecat, ni los sitios de las marcas
   tienen estas fotos.

   La consulta se arma como la escribiría una persona: se quita la presentación
   ("C/10" son las piezas por paquete, no el producto) y se antepone la marca solo
   si el nombre no la trae ya. */
$consulta = $consultaManual !== '' ? $consultaManual : buscar_frase((string) $p['name'], $marca);
if (BuscadorImagenes::configurado()) {
    $r = BuscadorImagenes::buscar($consulta);
    foreach ($r['imagenes'] as $img) {
        $cands[] = [
            'origen'    => 'buscador',
            'fuente'    => $img['sitio'] ?: 'web',
            'url'       => $img['url'],
            'miniatura' => $img['miniatura'],
            'pagina'    => $img['pagina'],
            'medidas'   => $img['ancho'] && $img['alto'] ? $img['ancho'] . '×' . $img['alto'] : '',
            'principal' => false,
            'nota'      => 'Encontrada en ' . ($img['sitio'] ?: 'la web') . '. Compruébala antes de usarla.',
        ];
    }
    if (!$r['imagenes'] && $r['nota'] !== '') $notas[] = $r['nota'];
} else {
    /* Sin configurar no se falla: se dicen los pasos exactos. Son cuatro y se
       hacen una sola vez. */
    $notas[] = 'no_configurado';
}

/* Una misma fotografía puede aparecer en Icecat, NEXTEP y otra vez en Google.
   Enseñarla dos o tres veces hace más lenta la revisión y parece que hay más
   alternativas de las que realmente existen. Se conserva la primera aparición
   porque las fuentes ya están ordenadas de mayor a menor confianza. */
$unicas = [];
$vistas = [];
foreach ($cands as $cand) {
    $u = trim((string) ($cand['url_real'] ?? $cand['url'] ?? ''));
    if ($u === '') continue;
    $p = parse_url($u);
    if (is_array($p) && isset($p['scheme'], $p['host'])) {
        $key = strtolower($p['scheme'] . '://' . $p['host'])
             . ($p['path'] ?? '')
             . (isset($p['query']) ? '?' . $p['query'] : '');
    } else {
        $key = $u;
    }
    if (isset($vistas[$key])) continue;
    $vistas[$key] = true;
    $unicas[] = $cand;
}
$cands = $unicas;

/**
 * Convierte el nombre telegráfico de Exel en algo que un buscador entienda.
 * Misma lógica que el panel usa para los enlaces de búsqueda; vive aquí también
 * porque la consulta al buscador se arma en el servidor.
 */
function buscar_frase(string $nombre, string $marca): string
{
    $s = preg_replace('/\bC\s*\/\s*\d+\b/iu', ' ', $nombre);
    $s = preg_replace('/\b(pz|pzas|piezas|paq|paquete)\b\.?/iu', ' ', $s);
    $s = trim(preg_replace('/\s+/u', ' ', $s));

    /* Exel guarda la razón social ("NEXTEP SOLUCIONES", "ACCO BRANDS MEXICO") y
       nadie busca así. */
    $m = preg_replace('/\b(soluciones|brands|mexico|méxico|s\.?a\.?|de|c\.?v\.?|inc\.?|corp\.?|ltd\.?)\b/iu', ' ', $marca);
    $m = trim(preg_replace('/\s+/u', ' ', $m));

    if ($m !== '' && mb_stripos($s, $m) === false) $s = $m . ' ' . $s;
    return trim($s);
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
    'consulta'   => $consulta,   // la frase que se buscó, para poder afinarla desde el panel
    'buscador'   => [
        'configurado' => BuscadorImagenes::configurado(),
        'pasos'       => BuscadorImagenes::configurado() ? [] : BuscadorImagenes::comoConfigurar(),
    ],
    /* Se le dicen al panel las reglas para que pueda avisar ANTES de subir, en vez
       de que el trabajador escoja una foto y el servidor se la rechace después. */
    'reglas' => [
        'min_lado'  => ImagenSegura::MIN_LADO,
        'max_mb'    => (int) (ImagenSegura::MAX_BYTES / 1024 / 1024),
        'formatos'  => array_values(ImagenSegura::MIMES),
    ],
]);
