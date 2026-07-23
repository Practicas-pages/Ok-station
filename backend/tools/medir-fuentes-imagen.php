<?php
/**
 * ¿Qué fuente de imágenes puede cerrar los huecos? — SOLO LECTURA
 * =============================================================================
 * Antes de integrar cualquier API conviene saber si el catálogo tiene lo que esa
 * API necesita. Es la lección de esta semana: se construyó un buscador que leía
 * los sitios de las marcas y resultó que ninguno servía. Medir cuesta minutos;
 * construir a ciegas costó un día.
 *
 * Contesta tres cosas sobre los productos SIN FOTO:
 *
 *   1. ¿Cuántos tienen CÓDIGO DE BARRAS válido?
 *      Es el dato que decide todo. Emparejar por código es exacto: o es ese
 *      producto o no lo es, y nunca se publica la variante equivocada. Sin código
 *      válido, cualquier API por GTIN (Icecat incluida) es inútil para ese
 *      producto. Se valida el DÍGITO VERIFICADOR, no solo el largo: un código mal
 *      copiado tiene 13 dígitos igual que uno bueno.
 *
 *   2. ¿Exel tiene fotos que no hemos guardado?
 *      Es la fuente autorizada y ya está pagada. Si su endpoint /imagenes las
 *      tiene, no hace falta ninguna API externa. Se mira sin escribir nada.
 *
 *   3. De una muestra, ¿cuántos encuentra UPCitemdb?
 *      La única base pública gratuita y sin llave que devuelve fotos por código.
 *      Se prueba con POCOS productos a propósito: su nivel gratuito son ~100
 *      consultas al día y no tiene sentido gastarlas para un diagnóstico.
 *
 * Uso:
 *   php backend/tools/medir-fuentes-imagen.php            # solo cuenta (sin red)
 *   php backend/tools/medir-fuentes-imagen.php --probar   # además prueba la muestra
 *   php backend/tools/medir-fuentes-imagen.php --probar --muestra=20
 */

if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Solo CLI.\n"); }

$CONFIG = require __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/lib/CatalogoAlcance.php';

$args    = array_slice($argv, 1);
$probar  = in_array('--probar', $args, true);
$muestra = 10;
foreach ($args as $a) if (str_starts_with($a, '--muestra=')) $muestra = max(1, min(50, (int) substr($a, 10)));

$d = $CONFIG['db'];
$pdo = new PDO(
    "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
    $d['user'], $d['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

/**
 * ¿Es un GTIN de verdad? Valida el dígito verificador, no solo el largo.
 * Un código mal tecleado tiene 13 dígitos igual que uno bueno, y mandarlo a una
 * API solo gasta cuota para recibir "no existe".
 */
function gtin_valido(string $s): bool
{
    $n = preg_replace('/\D/', '', $s);
    if (!in_array(strlen($n), [8, 12, 13, 14], true)) return false;
    $suma = 0;
    $digitos = array_reverse(str_split($n));
    for ($i = 1; $i < count($digitos); $i++) {
        $suma += (int) $digitos[$i] * (($i % 2) ? 3 : 1);
    }
    return ((10 - ($suma % 10)) % 10) === (int) $digitos[0];
}

$alc = alcance_sql('products');
$st = $pdo->prepare(
    "SELECT id, name, brand, sku, supplier_ref, barcode
       FROM products
      WHERE supplier='exel' AND is_active = 1
        {$alc['sql']}
        AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = products.id)
      ORDER BY brand, name"
);
$st->execute($alc['params']);
$sinFoto = $st->fetchAll();
$total = count($sinFoto);

echo "══ ¿Qué puede cerrar los huecos de imagen? ══\n";
echo "Alcance: " . implode(' · ', categorias_permitidas()) . "\n";
echo "Productos activos SIN NINGUNA foto: {$total}\n\n";
if ($total === 0) { echo "✔ No hay huecos. Nada que medir.\n"; exit(0); }

/* ── 1. Códigos de barras ─────────────────────────────────────────────────── */
$conGtin = $sinGtin = $gtinMalo = 0;
$porMarca = [];
foreach ($sinFoto as $p) {
    $bc = trim((string) ($p['barcode'] ?? ''));
    $ok = $bc !== '' && gtin_valido($bc);
    if ($ok)            $conGtin++;
    elseif ($bc === '') $sinGtin++;
    else                $gtinMalo++;

    $m = trim((string) ($p['brand'] ?? '')) ?: '(sin marca)';
    if (!isset($porMarca[$m])) $porMarca[$m] = ['n' => 0, 'gtin' => 0];
    $porMarca[$m]['n']++;
    if ($ok) $porMarca[$m]['gtin']++;
}
$pc = fn(int $x) => sprintf('%d (%d%%)', $x, (int) round($x * 100 / $total));

echo "── 1. Código de barras (lo que decide si sirve una API por GTIN)\n";
echo "   Con código VÁLIDO       : " . $pc($conGtin)  . "   ← estos se pueden buscar por código\n";
echo "   Sin código              : " . $pc($sinGtin)  . "\n";
echo "   Con código INVÁLIDO     : " . $pc($gtinMalo) . "   (no pasa el dígito verificador)\n";
if ($conGtin === 0) {
    echo "\n   ➤ NINGÚN producto sin foto tiene código válido. Ninguna API por GTIN\n";
    echo "     (Icecat, UPCitemdb, la que sea) puede ayudar aquí. La foto tiene que\n";
    echo "     venir de Exel o ponerse a mano.\n";
}

echo "\n── 2. Marcas con más huecos (y cuántos traen código)\n";
uasort($porMarca, fn($a, $b) => $b['n'] <=> $a['n']);
$i = 0;
foreach ($porMarca as $m => $x) {
    if (++$i > 12) break;
    printf("   %-26s %5d sin foto   %4d con código\n", $m, $x['n'], $x['gtin']);
}

/* ── 3. ¿Exel tiene fotos que no guardamos? ──────────────────────────────── */
echo "\n── 3. ¿Exel del Norte tiene estas fotos? (la fuente autorizada, ya pagada)\n";
$base = rtrim((string) env('EXEL_API_BASE', 'https://api01.exeldelnorte.com.mx'), '/');
$key  = (string) env('EXEL_API_KEY', '');
if ($key === '') {
    echo "   (sin EXEL_API_KEY: no se puede consultar)\n";
} else {
    $ch = curl_init("$base/imagenes");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 180,
                            CURLOPT_HTTPHEADER => ['Authorization: ' . $key]]);
    $resp = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $code < 200 || $code >= 300) {
        $j   = json_decode((string) $resp, true);
        $msg = is_array($j) ? (string) ($j['message'] ?? '') : '';
        echo "   No se pudo consultar (HTTP {$code})" . ($msg !== '' ? ": {$msg}" : '') . "\n";
    } else {
        $j     = json_decode((string) $resp, true);
        $filas = $j['DATA'] ?? $j['datos'] ?? $j['data'] ?? [];
        $mapa  = [];
        foreach ($filas as $f) {
            $ref = (string) ($f['referencia'] ?? '');
            if ($ref !== '') $mapa[$ref] = count($f['imagenes'] ?? []);
        }
        $cubre = 0;
        foreach ($sinFoto as $p) if (($mapa[(string) $p['supplier_ref']] ?? 0) > 0) $cubre++;
        echo "   Exel tiene foto para " . $pc($cubre) . " de los que hoy no la tienen.\n";
        if ($cubre > 0) {
            echo "   ➤ Se traen con:  php backend/tools/exel-imagenes.php\n";
            echo "     Es gratis, es la fuente autorizada y no puede traer la foto equivocada\n";
            echo "     (empareja por NUESTRA referencia). Hazlo ANTES que cualquier API externa.\n";
        }
    }
}

/* ── 4. Muestra contra UPCitemdb ─────────────────────────────────────────── */
if (!$probar) {
    echo "\n── 4. Bases públicas por código de barras\n";
    echo "   (no se probaron; agrega --probar para consultar una muestra)\n";
    exit(0);
}

echo "\n── 4. Muestra contra UPCitemdb (gratis, sin llave, ~100 consultas/día)\n";
$conCodigo = array_values(array_filter($sinFoto, fn($p) => gtin_valido((string) ($p['barcode'] ?? ''))));
if (!$conCodigo) { echo "   No hay productos con código válido que probar.\n"; exit(0); }

$aProbar = array_slice($conCodigo, 0, $muestra);
$hits = 0;
foreach ($aProbar as $p) {
    $bc = preg_replace('/\D/', '', (string) $p['barcode']);
    $ch = curl_init("https://api.upcitemdb.com/prod/trial/lookup?upc=" . urlencode($bc));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
                            CURLOPT_USERAGENT => 'OkStationBot/1.0 (+https://okstation.mx)']);
    $r    = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code === 429) { echo "   (se agotó la cuota diaria de UPCitemdb; se corta la muestra)\n"; break; }
    $j    = json_decode((string) $r, true);
    $item = $j['items'][0] ?? null;
    $imgs = $item ? count($item['images'] ?? []) : 0;
    if ($imgs > 0) $hits++;
    printf("   %-13s %-30s %s\n", $bc, mb_strimwidth((string) $p['name'], 0, 30, '…'),
        $imgs > 0 ? "✓ {$imgs} foto(s)" : ($code === 200 ? '— no lo tiene' : "HTTP {$code}"));
    usleep(400000);   // no atropellar su servicio
}

$n = count($aProbar);
echo "\n   Encontrados: {$hits} de {$n} probados.\n";
echo $hits === 0
    ? "   ➤ Cero. Su base es de productos de Estados Unidos y no cubre papelería\n"
    . "     mexicana. Integrarla sería trabajo sin resultado.\n"
    : "   ➤ Sirve para " . (int) round($hits * 100 / $n) . "% de la muestra. OJO: sus fotos vienen de\n"
    . "     TIENDAS (Walmart, Target…), no del fabricante. Habría que decidir si se\n"
    . "     usan, porque son de terceros y eso es justo lo que se quiso evitar.\n";
