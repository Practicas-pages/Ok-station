<?php
/** Sinónimos y tolerancia de búsqueda para el catálogo de papelería.
 *  Un usuario que escribe "tinta" debe encontrar "cartucho", "hojas" → "papel",
 *  "pluma" → "bolígrafo", etc. También aguanta acentos, mayúsculas y plurales
 *  (el LIKE es por subcadena, así "cartuch" ya pega con "cartucho").
 *
 *  Se usa desde products.php (búsqueda de la tienda, de la ficha y de OKi, que
 *  todos pegan a ese endpoint). No hay autoloader: quien lo use hace require.
 */

if (!function_exists('shop_norm')) {
    /** minúsculas + sin acentos + espacios colapsados (para comparar tokens). */
    function shop_norm(string $s): string {
        $s = function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
        $s = strtr($s, [
            'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u',
            'à' => 'a', 'è' => 'e', 'ì' => 'i', 'ò' => 'o', 'ù' => 'u', 'ñ' => 'n',
        ]);
        return trim(preg_replace('/\s+/', ' ', $s));
    }
}

/** Grupos de términos equivalentes en papelería. Cada grupo se busca como un
 *  conjunto: cualquiera de sus palabras encuentra a las demás. Mantener corto y
 *  específico para no traer productos de más. */
function shop_synonym_groups(): array {
    return [
        ['tinta', 'tintas', 'cartucho', 'cartuchos', 'recarga'],
        ['toner', 'toners'],
        ['papel', 'hoja', 'hojas', 'resma', 'resmas', 'bond', 'opalina'],
        ['pluma', 'plumas', 'boligrafo', 'boligrafos', 'lapicero', 'lapiceros', 'birome'],
        ['lapiz', 'lapices', 'portaminas', 'portamina'],
        ['marcador', 'marcadores', 'plumon', 'plumones', 'rotulador', 'rotuladores', 'sharpie'],
        ['cuaderno', 'cuadernos', 'libreta', 'libretas', 'block', 'blocks', 'blok'],
        ['folder', 'folders', 'carpeta', 'carpetas'],
        ['engrapadora', 'engrapadoras', 'grapadora', 'grapadoras'],
        ['grapas', 'grapa', 'broches'],
        ['pegamento', 'pegamentos', 'adhesivo', 'adhesivos', 'resistol', 'pritt', 'pega'],
        ['cinta', 'cintas', 'diurex', 'durex', 'masking', 'scotch', 'adhesiva'],
        ['tijera', 'tijeras'],
        ['calculadora', 'calculadoras'],
        ['borrador', 'borradores', 'goma', 'gomas'],
        ['sacapuntas', 'tajador', 'tajadores'],
        ['regla', 'reglas', 'escuadra', 'escuadras'],
        ['mochila', 'mochilas', 'backpack'],
        ['clip', 'clips', 'sujetadocumentos'],
        ['postit', 'post-it', 'banderitas', 'banderines', 'notas'],
        ['sobre', 'sobres', 'manila'],
        ['corrector', 'correctores', 'liquidpaper', 'liquid'],
        ['colores', 'crayolas', 'crayones', 'colores'],
        ['pizarron', 'pizarra', 'whiteboard'],
        ['perforadora', 'perforadoras', 'ponchadora'],
        ['etiqueta', 'etiquetas', 'stickers', 'calcomanias'],
        ['impresora', 'impresoras', 'printer'],
        ['engargolado', 'arillo', 'arillos', 'espiral'],
        ['pincel', 'pinceles', 'brocha', 'brochas'],
        ['acuarela', 'acuarelas', 'pintura', 'pinturas', 'tempera', 'temperas'],
    ];
}

/** Índice token→conjunto de equivalentes (normalizados). */
function shop_synonym_index(): array {
    static $idx = null;
    if ($idx !== null) return $idx;
    $idx = [];
    foreach (shop_synonym_groups() as $g) {
        $g = array_map('shop_norm', $g);
        foreach ($g as $t) {
            $idx[$t] = array_values(array_unique(array_merge($idx[$t] ?? [], $g)));
        }
    }
    return $idx;
}

/**
 * Construye el WHERE de búsqueda para $q con sinónimos.
 * Devuelve [sql, params]. Un producto coincide si, para CADA palabra del usuario,
 * su nombre/marca contiene esa palabra O alguno de sus sinónimos. La frase
 * completa y el SKU también se prueban (por si pegan un código).
 * Si $q queda vacío, devuelve ['', []].
 */
function shop_search_clause(string $q): array {
    $qn = shop_norm($q);
    if ($qn === '') return ['', []];

    $idx    = shop_synonym_index();
    $words  = array_values(array_filter(explode(' ', $qn), fn($w) => strlen($w) >= 2));
    $ors    = [];   // sub-clausulas, se unen con AND
    $params = [];

    foreach ($words as $w) {
        $terms = [$w];
        if (isset($idx[$w])) $terms = array_values(array_unique(array_merge($terms, $idx[$w])));
        $sub = [];
        foreach ($terms as $t) {
            $like = '%' . $t . '%';
            $sub[] = 'name LIKE ?';  $params[] = $like;
            $sub[] = 'brand LIKE ?'; $params[] = $like;
        }
        $ors[] = '(' . implode(' OR ', $sub) . ')';
    }

    // Frase completa y SKU: rescatan códigos/nombres exactos que la tokenización partiría.
    $full = '%' . $qn . '%';
    $ors[] = '(name LIKE ? OR sku LIKE ?)';
    $params[] = $full; $params[] = $full;

    // AND entre palabras (todas deben aparecer), salvo el rescate de frase/SKU que va con OR.
    $wordsSql = array_slice($ors, 0, count($words));   // clausulas por palabra
    $rescue   = end($ors);                             // frase completa / sku
    if ($wordsSql) {
        $sql = '((' . implode(' AND ', $wordsSql) . ') OR ' . $rescue . ')';
    } else {
        $sql = $rescue;
    }
    return [$sql, $params];
}
