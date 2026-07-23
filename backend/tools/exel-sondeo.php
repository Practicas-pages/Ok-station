<?php
/**
 * Sondeo de la API de Exel del Norte — SOLO LECTURA
 * =============================================================================
 * No escribe en la base de datos ni toca archivos. Existe para contestar con
 * datos, y no de memoria, tres preguntas que hoy están abiertas:
 *
 *   1. ¿El feed de Exel trae información de ALMACÉN?
 *      Hoy `EXEL_WAREHOUSE=4` se escribe en products.warehouse_id pero NUNCA se
 *      le manda a Exel: GET /productos va sin parámetros. O sea, la columna dice
 *      "almacén 4" mientras el stock que guardamos es el que Exel mande, venga
 *      de donde venga. Si resulta que ese stock es global, la tienda puede estar
 *      vendiendo piezas que no están en Tijuana. Este sondeo lista TODAS las
 *      claves que aparecen en el feed para ver si alguna habla de almacenes.
 *
 *   2. ¿Cuántos productos quedan si nos limitamos a "Oficina y Escolar"?
 *      Cambiar la lista blanca es de una línea; lo que importa es cuánto encoge
 *      el catálogo, porque de eso depende si vale la pena todo lo demás.
 *
 *   3. De esos, ¿cuántos están completos? (imagen, descripción, código de barras)
 *      Las imágenes viven en otro endpoint (GET /imagenes), así que se cruzan
 *      por `referencia`.
 *
 * Uso:
 *   php backend/tools/exel-sondeo.php                  # sondeo completo
 *   php backend/tools/exel-sondeo.php --file=ruta.json # contra un feed guardado
 *   php backend/tools/exel-sondeo.php --sin-imagenes   # se salta GET /imagenes
 *   php backend/tools/exel-sondeo.php --cat="Papel"    # otra categoría
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Solo CLI.\n");
}

/* config.php es quien dispara load_env(): requerir env.php a secas deja el .env
   sin leer y EXEL_API_KEY sale vacía. Mismo arranque que exel-sync.php. */
require __DIR__ . '/../api/config.php';

$args        = array_slice($argv, 1);
$file        = '';
$catObjetivo = 'Oficina y Escolar';
$sinImagenes = in_array('--sin-imagenes', $args, true);
foreach ($args as $a) {
    if (str_starts_with($a, '--file=')) $file        = substr($a, 7);
    if (str_starts_with($a, '--cat='))  $catObjetivo = substr($a, 6);
}

/** Mismo criterio de comparación que usa exel-sync.php (trim + minúsculas). */
function nrm(string $s): string { return mb_strtolower(trim($s), 'UTF-8'); }

/** Mismo contrato que fetch_from_api() del sync: {resultado, mensaje, datos:[…]}. */
function traer_productos(string $file): array
{
    if ($file !== '') {
        $j = json_decode((string) file_get_contents($file), true);
        return $j['datos'] ?? $j ?? [];
    }
    $base = rtrim((string) env('EXEL_API_BASE', 'https://api01.exeldelnorte.com.mx'), '/');
    $key  = (string) env('EXEL_API_KEY', '');
    if ($key === '') { fwrite(STDERR, "✗ Falta EXEL_API_KEY en backend/.env.\n"); exit(1); }

    $ch = curl_init("$base/productos");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 120,
        CURLOPT_HTTPHEADER     => ['Authorization: ' . $key],
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $code !== 200) { fwrite(STDERR, "✗ Exel respondió HTTP {$code}.\n"); exit(1); }
    $json = json_decode($resp, true);
    return $json['datos'] ?? [];
}

/** GET /imagenes → ['referencia' => n_imagenes]. Exel responde 201, no 200. */
function traer_imagenes(): array
{
    $base = rtrim((string) env('EXEL_API_BASE', 'https://api01.exeldelnorte.com.mx'), '/');
    $key  = (string) env('EXEL_API_KEY', '');
    $ch = curl_init("$base/imagenes");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 180,
        CURLOPT_HTTPHEADER     => ['Authorization: ' . $key],
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $code < 200 || $code >= 300) {
        fwrite(STDERR, "  (aviso) GET /imagenes respondió HTTP {$code}; se omite ese cruce.\n");
        return [];
    }
    $json  = json_decode($resp, true);
    $filas = $json['DATA'] ?? $json['datos'] ?? $json['data'] ?? [];
    $out = [];
    foreach ($filas as $f) {
        $ref = (string) ($f['referencia'] ?? '');
        if ($ref !== '') $out[$ref] = count($f['imagenes'] ?? []);
    }
    return $out;
}

echo "══ Sondeo de la API de Exel (solo lectura) ══\n\n";
$productos = traer_productos($file);
$total     = count($productos);
if ($total === 0) { fwrite(STDERR, "✗ El feed vino vacío.\n"); exit(1); }
echo "Productos en el feed: {$total}\n\n";

/* ── 1. ¿Hay algo de almacenes en el feed? ─────────────────────────────────
   Se recorre TODO el feed, no solo el primer producto: Exel omite claves
   cuando vienen vacías, así que mirar una sola fila da un inventario falso. */
$claves = [];
foreach ($productos as $p) {
    foreach (array_keys($p) as $k) { $claves[$k] = ($claves[$k] ?? 0) + 1; }
}
ksort($claves);
echo "── 1. Claves presentes en el feed (clave: en cuántos productos aparece)\n";
foreach ($claves as $k => $n) {
    printf("   %-32s %6d  (%d%%)\n", $k, $n, (int) round($n * 100 / $total));
}
$pistas = array_values(array_filter(array_keys($claves), function ($k) {
    return preg_match('/almac|bodeg|sucursal|warehouse|existenc|dispon/i', $k);
}));
echo "\n   ➤ Claves que suenan a almacén/existencias: "
   . ($pistas ? implode(', ', $pistas) : "NINGUNA") . "\n";
if (!$pistas) {
    echo "     Es decir: el feed NO distingue almacenes. Para limitar al almacén 4\n"
       . "     hace falta el endpoint 'productos por almacenes' que el roadmap\n"
       . "     menciona pero nadie implementó — necesitamos su documentación.\n";
}

/* ── 2. Reparto por categoría ────────────────────────────────────────────── */
echo "\n── 2. Productos por categoría (categoria_nombre)\n";
$porCat = [];
foreach ($productos as $p) {
    $c = trim((string) ($p['categoria_nombre'] ?? '(sin categoría)'));
    $porCat[$c] = ($porCat[$c] ?? 0) + 1;
}
arsort($porCat);
foreach ($porCat as $c => $n) { printf("   %-42s %6d\n", $c, $n); }

/* ── 3. Radiografía de la categoría objetivo ─────────────────────────────── */
$objetivo = array_values(array_filter($productos, function ($p) use ($catObjetivo) {
    return nrm((string) ($p['categoria_nombre'] ?? '')) === nrm($catObjetivo);
}));
$nObj = count($objetivo);
echo "\n── 3. Radiografía de «{$catObjetivo}»: {$nObj} productos"
   . ($total ? sprintf(" (%d%% del feed)", (int) round($nObj * 100 / $total)) : '') . "\n";
if ($nObj === 0) {
    echo "   ✗ Ninguno. Revisa el nombre exacto en la lista de arriba.\n";
    exit(0);
}

$imgs = $sinImagenes ? [] : traer_imagenes();

$conDesc = $conBarcode = $conStock = $conImagen = 0;
$porMarca = [];
foreach ($objetivo as $p) {
    if (trim((string) ($p['descripcion_extendida'] ?? '')) !== '') $conDesc++;
    $bc = preg_replace('/\D+/', '', (string) ($p['codigo_barras'] ?? ''));
    if (in_array(strlen($bc), [8, 12, 13, 14], true)) $conBarcode++;
    if ((int) ($p['stock'] ?? 0) > 0) $conStock++;
    $ref = (string) ($p['referencia'] ?? '');
    if ($imgs && ($imgs[$ref] ?? 0) > 0) $conImagen++;

    $m = trim((string) ($p['marca_nombre'] ?? '(sin marca)'));
    if (!isset($porMarca[$m])) $porMarca[$m] = ['n' => 0, 'sin_img' => 0];
    $porMarca[$m]['n']++;
    if ($imgs && ($imgs[$ref] ?? 0) === 0) $porMarca[$m]['sin_img']++;
}
$pc = function (int $x) use ($nObj) { return sprintf("%d (%d%%)", $x, (int) round($x * 100 / $nObj)); };

echo "   Con descripción de Exel : " . $pc($conDesc)    . "\n";
echo "   Con código de barras    : " . $pc($conBarcode) . "   ← sin esto Icecat no puede buscar por GTIN\n";
echo "   Con existencias (>0)    : " . $pc($conStock)   . "\n";
if ($imgs) {
    echo "   Con imagen de Exel      : " . $pc($conImagen) . "\n";
    echo "   SIN imagen (el hueco)   : " . $pc($nObj - $conImagen) . "\n";
} else {
    echo "   Imágenes                : (no consultadas)\n";
}

/* Las marcas mandan: Icecat gratis solo cubre marcas patrocinadas (HP, Canon,
   Epson, Brother, Xerox, 3M). Si el hueco de imágenes se concentra en marcas de
   papelería que Icecat no tiene, ningún ajuste de Icecat lo va a cerrar. */
echo "\n── 4. Marcas de «{$catObjetivo}» (las 20 con más productos)\n";
uasort($porMarca, function ($a, $b) { return $b['n'] <=> $a['n']; });
$i = 0;
$PATROCINADAS = ['hp', 'canon', 'epson', 'brother', 'xerox', '3m'];
foreach ($porMarca as $m => $d) {
    if (++$i > 20) break;
    $icecat = in_array(nrm($m), $PATROCINADAS, true) ? 'sí' : 'no';
    printf("   %-26s %5d productos   sin imagen: %-5d   ¿en Icecat gratis? %s\n",
        $m, $d['n'], $d['sin_img'], $icecat);
}

echo "\n✔ Sondeo terminado. No se escribió nada.\n";
