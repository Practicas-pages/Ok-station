<?php
/**
 * Ok.station — Backfill LIGERO de imágenes faltantes de Exel del Norte (CLI)
 * -----------------------------------------------------------------------------
 * Complemento del sync. Baja imágenes SOLO para los productos activos que hoy tienen
 * CERO fotos, con UNA sola llamada a /imagenes de Exel. NO consulta Icecat (eso es el
 * runner nocturno) y NO hace el DELETE+reinsert masivo del sync completo: solo INSERTA
 * lo que falta → idempotente y barato. Pensado para un cron cada 2-3 h, aparte del de
 * precios (que salta las fotos a propósito).
 *
 * Regla de negocio: la imagen viene PRIMERO de Exel; Icecat solo complementa lo que Exel
 * no cubre. Este runner cubre justo el "primero de Exel".
 *
 * Uso:   php backend/tools/exel-imagenes.php
 * Cron:  20 8-20/3 * * * cd /home/okstation/htdocs/okstation.mx && php backend/tools/exel-imagenes.php >> /var/log/okstation-imagenes.log 2>&1
 *        (cada 3 h en horario hábil: 8:20, 11:20, 14:20, 17:20 y 20:20. De noche no
 *         hace falta: el sync completo de las 2:15 ya trae TODAS las fotos de Exel.)
 * Requiere EXEL_API_BASE / EXEL_API_KEY y DATABASE_* en backend/.env.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Solo CLI.\n"); }

require __DIR__ . '/../api/lib/env.php';
load_env(__DIR__ . '/../.env');

$cfgFile = __DIR__ . '/../api/config.php';
if (is_file($cfgFile)) {
    $CONFIG = require $cfgFile;
} else {
    $CONFIG = ['db' => [
        'host' => env('DATABASE_HOST', '127.0.0.1'), 'port' => (int) env('DATABASE_PORT', 3306),
        'name' => env('DATABASE_NAME', 'okstation'), 'user' => env('DATABASE_USER', 'root'),
        'pass' => env('DATABASE_PASSWORD', ''), 'charset' => 'utf8mb4',
    ]];
}
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

echo "── Backfill de imágenes faltantes (Exel) ── " . date('Y-m-d H:i:s') . "\n";

/* Productos activos SIN ninguna imagen. Solo estos nos interesan. */
$sinFoto = $PDO->query(
    "SELECT id, supplier_ref FROM products
      WHERE supplier = 'exel' AND is_active = 1
        AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = products.id)"
)->fetchAll();
if (!$sinFoto) { echo "  ✓ No hay productos activos sin imagen. Nada que hacer.\n"; exit(0); }
echo "  Productos sin imagen: " . count($sinFoto) . "\n";

$porRef = [];
foreach ($sinFoto as $r) { $porRef[(string) $r['supplier_ref']] = (int) $r['id']; }

$mapa = fetch_images_from_api();
echo "  Referencias con foto en Exel: " . count($mapa) . "\n";
if (!$mapa) { echo "  ⚠ Exel no devolvió imágenes esta vez. Sin cambios.\n"; exit(1); }

/* Solo se INSERTA (nunca DELETE): estos productos no tienen filas de imagen, así que no
   hay nada que pisar. La foto primaria es la primera de Exel. */
$filas = [];
$cubiertos = 0;
foreach ($mapa as $ref => $urls) {
    $ref = (string) $ref;
    if (!isset($porRef[$ref])) continue;   // esa referencia no es de un producto sin foto
    $pid = $porRef[$ref];
    $orden = 0;
    foreach ($urls as $u) {
        $u = trim((string) $u);
        if ($u === '' || !preg_match('~^https?://~i', $u)) continue;
        $filas[] = [$pid, $u, null, 'exel', $orden, $orden === 0 ? 1 : 0];
        $orden++;
    }
    if ($orden > 0) $cubiertos++;
}

if (!$filas) { echo "  · Ninguno de los sin-foto tiene imagen disponible en Exel ahora mismo.\n"; exit(0); }

$ph6 = '(?,?,?,?,?,?)';
$total = 0;
$PDO->beginTransaction();
try {
    foreach (array_chunk($filas, 500) as $lote) {
        $sql = "INSERT INTO product_images (product_id, url, stored_path, source, sort_order, is_primary) VALUES "
             . implode(',', array_fill(0, count($lote), $ph6));
        $args = [];
        foreach ($lote as $f) foreach ($f as $v) $args[] = $v;
        $PDO->prepare($sql)->execute($args);
        $total += count($lote);
    }
    $PDO->commit();
} catch (Throwable $e) {
    $PDO->rollBack();
    fwrite(STDERR, "  ✗ Error al insertar imágenes: {$e->getMessage()}\n");
    exit(1);
}

echo "  ✓ Insertadas {$total} imágenes en {$cubiertos} producto(s) que estaban sin foto.\n";
echo "    (Para bajarlas al servidor —opcional— corre download-product-images.php)\n";

/* ── Trae el mapa de imágenes de Exel (misma lógica y rarezas que exel-sync.php) ── */
function fetch_images_from_api(): array {
    $base = rtrim((string) env('EXEL_API_BASE', 'https://api01.exeldelnorte.com.mx'), '/');
    $key  = (string) env('EXEL_API_KEY', '');
    if ($key === '') { fwrite(STDERR, "  ⚠ Falta EXEL_API_KEY en backend/.env.\n"); return []; }

    $ch = curl_init("$base/imagenes");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 120,
        CURLOPT_HTTPHEADER     => ['Authorization: ' . $key],
    ]);
    $resp = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($resp === false)             { fwrite(STDERR, "  ⚠ Sin imágenes: error de red ({$err}).\n"); return []; }
    if ($code < 200 || $code >= 300) { fwrite(STDERR, "  ⚠ Sin imágenes: /imagenes respondió HTTP {$code}.\n"); return []; }

    $json = json_decode((string) $resp, true);
    if (!is_array($json)) { fwrite(STDERR, "  ⚠ Sin imágenes: respuesta no es JSON.\n"); return []; }
    $lista = $json['DATA'] ?? $json['datos'] ?? $json['data'] ?? [];   // Exel usa 'DATA' en MAYÚSCULAS
    if (!is_array($lista)) return [];

    $out = [];
    foreach ($lista as $r) {
        $ref = trim((string) ($r['referencia'] ?? ''));
        if ($ref === '') continue;
        $urls = $r['imagenes'] ?? [];
        if (is_string($urls)) $urls = [$urls];
        if (!is_array($urls) || !$urls) continue;
        $out[$ref] = array_values(array_filter(array_map('strval', $urls), fn($u) => trim($u) !== ''));
    }
    return $out;
}
