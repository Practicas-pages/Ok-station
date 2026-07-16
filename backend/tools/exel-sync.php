<?php
/**
 * Ok.station — Runner de catálogo del proveedor EXEL DEL NORTE (CLI, sin dependencias).
 * ---------------------------------------------------------------------------------
 * Baja el catálogo de Exel, filtra SOLO papelería, y hace un UPSERT masivo a la
 * tabla `products`. Segunda parte (Fase 3) la enriquece con Icecat.
 *
 * Uso:
 *   php backend/tools/exel-sync.php                 # jala de la API de Exel (.env)
 *   php backend/tools/exel-sync.php --dry-run       # no escribe, solo reporta
 *   php backend/tools/exel-sync.php --file=feed.json# lee de un archivo local (pruebas)
 *   php backend/tools/exel-sync.php --limit=100     # procesa a lo más N productos
 *
 * Requiere en backend/.env:
 *   EXEL_API_BASE=https://api01.exeldelnorte.com.mx   (opcional; este es el default)
 *   EXEL_API_KEY=...                                  (obligatorio salvo con --file)
 *   EXEL_WAREHOUSE=4                                  (opcional; default 4)
 *   DATABASE_* (las mismas que usa el resto del backend)
 */
declare(strict_types=1);

/* ── Filtro de papelería: lista blanca por categoria_nombre de Exel ──
   Decisión de negocio (junta 2026-07-14): "Papelería + impresión".
   Todas las subcategorías de estas categorías se importan; el resto se descarta.
   La lista es ADITIVA a propósito: agregar una categoría que Exel no tenga no rompe
   nada (simplemente no hace match), y cubre el día que sí la traiga. TODAS deben ser
   de papelería: lo que no esté aquí (cómputo, accesorios…) NO entra a la tienda. */
const PAPELERIA_CATS = [
    'Oficina y Escolar',
    'Papel',
    'Consumibles',
    'Impresión y Multifuncionales',
    'Digitalización de Documentos',
    'Adhesivos y Cintas',
    'Archivo y Carpetas',
    'Engrapado y Perforado',
    'Escritura y Corrección',
    'Cuadernos y Libretas',
    'Etiquetas y Rotulación',
    'Calculadoras',
    'Arte y Manualidades',
];

/* ── Arranque: config + conexión + ShopCatalog (para el margen) ── */
$CONFIG = require __DIR__ . '/../api/config.php';
$d = $CONFIG['db'];
try {
    $PDO = new PDO(
        "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
        $d['user'], $d['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (Throwable $e) {
    fwrite(STDERR, "✗ No se pudo conectar a la BD. Revisa DATABASE_* en backend/.env\n  {$e->getMessage()}\n");
    exit(1);
}
/** Shim de db() para poder reusar ShopCatalog::margin() sin arrastrar _bootstrap. */
function db(): PDO { global $PDO; return $PDO; }
require __DIR__ . '/../api/lib/ShopCatalog.php';

/* ── Args ── */
$args   = array_slice($argv, 1);
$dryRun = in_array('--dry-run', $args, true);
$file   = null;
$limit  = 0;
foreach ($args as $a) {
    if (str_starts_with($a, '--file='))  $file  = substr($a, 7);
    if (str_starts_with($a, '--limit=')) $limit = max(0, (int) substr($a, 8));
}

$warehouse = (string) env('EXEL_WAREHOUSE', '4');
$margin    = ShopCatalog::margin();                 // reusa la lógica del 30% (settings.shop_margin)
$runStamp  = date('Y-m-d H:i:s');

echo "── Exel sync ──  " . ($dryRun ? "[DRY-RUN] " : "") . "almacén={$warehouse}  margen={$margin}\n";

/* ── 1. Obtener el catálogo (API o archivo local) ── */
$raw = $file ? read_feed_file($file) : fetch_from_api();
echo "  Recibidos: " . count($raw) . " productos del origen\n";

/* ── 2. Filtrar SOLO papelería + normalizar ── */
$whitelist = array_map('norm', PAPELERIA_CATS);
$rows = [];
$descartados = 0;
/* Censo de las categorías REALES que manda Exel, para el informe del --dry-run.
   Nuestra lista blanca se escribió a mano SIN ver el catálogo real: si los nombres no
   empatan, esto se importaría vacío y sin saber por qué. Aquí queda a la vista. */
$censo = [];
foreach ($raw as $p) {
    $cat = (string) ($p['categoria_nombre'] ?? '');
    $pasa = in_array(norm($cat), $whitelist, true);
    $k = $cat === '' ? '(sin categoría)' : $cat;
    if (!isset($censo[$k])) $censo[$k] = ['n' => 0, 'pasa' => $pasa, 'subs' => []];
    $censo[$k]['n']++;
    $sub = trim((string) ($p['subcategoria_nombre'] ?? ''));
    if ($sub !== '') $censo[$k]['subs'][$sub] = true;

    if (!$pasa) { $descartados++; continue; }

    $cost = (float) ($p['precio'] ?? 0);
    $rows[] = [
        'supplier'       => 'exel',
        'supplier_ref'   => trim((string) ($p['referencia'] ?? '')),
        'supplier_id'    => (string) ($p['id'] ?? ''),
        'sku'            => trim((string) ($p['sku'] ?? '')),
        'barcode'        => trim((string) ($p['codigo_barras'] ?? '')),
        'sat_code'       => trim((string) ($p['codigo_sat'] ?? '')),
        'name'           => trim((string) ($p['nombre'] ?? '')),
        'description'    => $p['descripcion_extendida'] ?? null,
        'brand'          => trim((string) ($p['marca_nombre'] ?? '')),
        'category'       => trim($cat),
        'subcategory'    => trim((string) ($p['subcategoria_nombre'] ?? '')),
        'currency'       => (string) ($p['moneda'] ?? 'MXN'),
        'cost'           => $cost,
        'price'          => round($cost * $margin, 2),   // = ShopCatalog::baseFor($cost), sin IVA
        'stock'          => (int) ($p['stock'] ?? 0),
        'warehouse_id'   => $warehouse,
        'last_synced_at' => $runStamp,
    ];
    if ($limit && count($rows) >= $limit) break;
}
echo "  Papelería: " . count($rows) . " a importar  ·  descartados (no papelería): {$descartados}\n";

/* El informe va ANTES de rendirse: si la lista blanca no empata con los nombres reales
   de Exel, "no hay nada que importar" no dice NADA. Esto sí dice qué mandó Exel. */
if ($dryRun || !$rows) {
    uasort($censo, fn($a, $b) => $b['n'] <=> $a['n']);
    echo "\n── Categorías que manda EXEL (así se llaman de su lado) ──\n";
    $entran = $fuera = 0;
    foreach ($censo as $nombre => $c) {
        $marca = $c['pasa'] ? '✓ ENTRA ' : '· fuera ';
        $c['pasa'] ? $entran += $c['n'] : $fuera += $c['n'];
        $subs = array_slice(array_keys($c['subs']), 0, 4);
        echo sprintf("  %s %-42s %5d  %s\n", $marca, mb_strimwidth($nombre, 0, 42, '…'), $c['n'],
            $subs ? '(' . implode(', ', $subs) . (count($c['subs']) > 4 ? '…' : '') . ')' : '');
    }
    echo "  ──\n  Entran: {$entran}   ·   Se quedan fuera: {$fuera}   ·   Categorías distintas: " . count($censo) . "\n";
    if (!$rows) {
        echo "\n  ⚠ NO entró NI UN producto. La lista blanca PAPELERIA_CATS (arriba en este\n";
        echo "    archivo) no empata con los nombres de Exel. Copia de la columna de arriba\n";
        echo "    los que SÍ sean de papelería y ponlos en esa lista.\n";
        exit(1);
    }
}
if ($dryRun) {
    echo "\n  [DRY-RUN] No se escribió nada. Ejemplo de fila que se importaría:\n";
    echo "    " . json_encode($rows[0], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n";
    exit(0);
}

/* ── 3. UPSERT masivo (por chunks) ── */
$cols = ['supplier','supplier_ref','supplier_id','sku','barcode','sat_code','name','description',
         'brand','category','subcategory','currency','cost','price','stock','warehouse_id','last_synced_at'];
// prev_cost = cost (el VIEJO, antes de pisarlo) → base para la regla del 3%.
$updates = ['prev_cost = cost'];
foreach ($cols as $c) {
    if ($c === 'supplier' || $c === 'supplier_ref') continue;
    /* `description` NO se pisa con un valor vacío: Exel casi nunca manda
       `descripcion_extendida`, y quien la llena es Icecat (ProductEnricher). Sin esto,
       cada corrida del runner BORRABA la ficha que Icecat ya había traído y la tienda
       se quedaba sin descripción. Si Exel SÍ manda descripción, esa manda. */
    $updates[] = $c === 'description'
        ? "description = IF(VALUES(description) IS NULL OR VALUES(description) = '', description, VALUES(description))"
        : "$c = VALUES($c)";
}
$onDup = implode(",\n  ", $updates);

$ph = '(' . implode(',', array_fill(0, count($cols), '?')) . ')';
$chunkSize = 500;
$total = 0;
foreach (array_chunk($rows, $chunkSize) as $chunk) {
    $sql = 'INSERT INTO products (' . implode(',', $cols) . ") VALUES\n"
         . implode(",\n", array_fill(0, count($chunk), $ph))
         . "\nON DUPLICATE KEY UPDATE\n  " . $onDup;
    $params = [];
    foreach ($chunk as $r) { foreach ($cols as $c) { $params[] = $r[$c]; } }
    $PDO->prepare($sql)->execute($params);
    $total += count($chunk);
    echo "  · upsert " . $total . "/" . count($rows) . "\n";
}

/* ── 4. Visibilidad: publicar con stock, ocultar sin stock y los descontinuados ── */
// En feed y con stock → activo; en feed sin stock → oculto.
$st = $PDO->prepare("UPDATE products SET is_active = IF(stock > 0, 1, 0)
                     WHERE supplier='exel' AND last_synced_at = ?");
$st->execute([$runStamp]);
$tocados = $st->rowCount();
// Ya no vienen en el feed (descontinuados) → ocultar.
$st = $PDO->prepare("UPDATE products SET is_active = 0
                     WHERE supplier='exel' AND (last_synced_at IS NULL OR last_synced_at < ?)");
$st->execute([$runStamp]);
$descont = $st->rowCount();

/* ── 5. Regla del 3%: cuántos costos se movieron > 3% respecto a la corrida anterior ── */
$cambios = (int) $PDO->query(
    "SELECT COUNT(*) FROM products
      WHERE supplier='exel' AND prev_cost > 0 AND ABS(cost - prev_cost) / prev_cost > 0.03"
)->fetchColumn();

echo "── Listo ──\n";
echo "  Upsert:        {$total}\n";
echo "  Con stock:     activos; sin stock ocultos (tocados: {$tocados})\n";
echo "  Descontinuados ocultados: {$descont}\n";
echo "  Costos con cambio > 3%:   {$cambios}\n";

/* ═══════════════════ Helpers ═══════════════════ */

/** Normaliza un nombre de categoría para comparar (trim + minúsculas). */
function norm(string $s): string {
    return mb_strtolower(trim($s), 'UTF-8');
}

/** Trae el catálogo desde la API de Exel. Envelope: {resultado, mensaje, datos:[...]}. */
function fetch_from_api(): array {
    $base = rtrim((string) env('EXEL_API_BASE', 'https://api01.exeldelnorte.com.mx'), '/');
    $key  = (string) env('EXEL_API_KEY', '');
    if ($key === '') {
        fwrite(STDERR, "✗ Falta EXEL_API_KEY en backend/.env (o usa --file para pruebas).\n");
        exit(1);
    }
    $ch = curl_init("$base/productos");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 120,
        CURLOPT_HTTPHEADER     => ['Authorization: ' . $key],
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($resp === false) { fwrite(STDERR, "✗ Error de red con Exel: " . curl_error($ch) . "\n"); exit(1); }
    curl_close($ch);
    if ($code !== 200) { fwrite(STDERR, "✗ Exel respondió HTTP {$code}.\n"); exit(1); }

    $json = json_decode($resp, true);
    if (!is_array($json) || empty($json['resultado'])) {
        fwrite(STDERR, "✗ Respuesta inesperada de Exel: " . substr((string) $resp, 0, 200) . "\n");
        exit(1);
    }
    return $json['datos'] ?? [];
}

/** Lee un feed local: acepta {datos:[...]}, un arreglo JSON, o JSONL (una línea por producto). */
function read_feed_file(string $path): array {
    if (!is_file($path)) { fwrite(STDERR, "✗ No existe el archivo: {$path}\n"); exit(1); }
    $txt = file_get_contents($path);
    $json = json_decode($txt, true);
    if (is_array($json)) {
        if (isset($json['datos']) && is_array($json['datos'])) return $json['datos'];
        if (array_is_list($json)) return $json;
    }
    // JSONL: una línea = un objeto JSON.
    $out = [];
    foreach (preg_split('/\r?\n/', (string) $txt) as $line) {
        $line = trim($line);
        if ($line === '') continue;
        $o = json_decode($line, true);
        if (is_array($o)) $out[] = $o;
    }
    if (!$out) { fwrite(STDERR, "✗ No pude interpretar el feed {$path} (ni JSON ni JSONL).\n"); exit(1); }
    return $out;
}
