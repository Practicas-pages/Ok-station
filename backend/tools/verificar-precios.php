<?php
/**
 * Ok.station — Auditoría de PRECIOS de la tienda (CLI, solo lectura).
 * -----------------------------------------------------------------------------
 * Comprueba que el precio que ve el cliente venga de verdad de Exel del Norte y
 * que la cuenta esté bien hecha en cada eslabón:
 *
 *     Exel `precio`  →  products.cost
 *     products.cost  ×  margen (settings.shop_margin)   →  products.price   (sin IVA)
 *     products.price ×  1.08 (IVA frontera)             →  lo que ve el cliente
 *
 * Además busca anomalías que darían un cobro incorrecto: costo 0 o negativo,
 * precio por debajo del costo, productos activos que Exel ya no manda, etc.
 *
 * Uso:
 *     php backend/tools/verificar-precios.php            # muestra 15 ejemplos
 *     php backend/tools/verificar-precios.php 40         # muestra 40 ejemplos
 *
 * NO escribe nada. Se puede correr con la tienda en producción sin riesgo.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Solo CLI.\n");
}

$CONFIG = require __DIR__ . '/../api/config.php';
$d = $CONFIG['db'];
try {
    $PDO = new PDO(
        "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
        $d['user'], $d['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (Throwable $e) {
    fwrite(STDERR, "✗ No se pudo conectar a la BD.\n  {$e->getMessage()}\n");
    exit(1);
}
function db(): PDO { global $PDO; return $PDO; }
require __DIR__ . '/../api/lib/ShopCatalog.php';

$muestras = max(1, min(200, (int) ($argv[1] ?? 15)));
$IVA      = 0.08;                    // frontera (Tijuana), el que aplica products.php
$margen   = ShopCatalog::margin();

echo "── Auditoría de precios ──  margen={$margen}  IVA={$IVA}\n\n";

/* ── 1. Traer el catálogo VIVO de Exel para comparar contra la fuente ──
   --file=ruta.json permite auditar contra un feed guardado (útil para probar la
   herramienta sin gastar una llamada a Exel). */
$archivo = null;
foreach (array_slice($argv, 1) as $a) { if (str_starts_with($a, '--file=')) $archivo = substr($a, 7); }

if ($archivo !== null) {
    if (!is_file($archivo)) { fwrite(STDERR, "✗ No existe el archivo {$archivo}\n"); exit(1); }
    $json = json_decode((string) file_get_contents($archivo), true);
    if (!is_array($json)) { fwrite(STDERR, "✗ El archivo no es JSON válido.\n"); exit(1); }
    $feed = $json['datos'] ?? $json;
    echo "Origen: archivo {$archivo}\n";
} else {
    $base = rtrim((string) env('EXEL_API_BASE', 'https://api01.exeldelnorte.com.mx'), '/');
    $key  = (string) env('EXEL_API_KEY', '');
    if ($key === '') { fwrite(STDERR, "✗ Falta EXEL_API_KEY en backend/.env\n"); exit(1); }

    $ch = curl_init("$base/productos");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 120,
                            CURLOPT_HTTPHEADER => ['Authorization: ' . $key]]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $code !== 200) { fwrite(STDERR, "✗ Exel respondió HTTP {$code}.\n"); exit(1); }
    $json = json_decode((string) $resp, true);
    $feed = $json['datos'] ?? [];
}
if (!$feed) { fwrite(STDERR, "✗ No se obtuvieron productos del origen.\n"); exit(1); }

$porRef = [];
foreach ($feed as $p) {
    $ref = trim((string) ($p['referencia'] ?? ''));
    if ($ref !== '') $porRef[$ref] = $p;
}
echo "Exel manda ahora: " . count($feed) . " productos (" . count($porRef) . " con referencia)\n";

/* ── 2. Comparar TODOS los productos de la tienda contra el feed ── */
$rows = $PDO->query(
    "SELECT id, supplier_ref, sku, name, brand, cost, price, old_price, stock, is_active
       FROM products WHERE supplier = 'exel'"
)->fetchAll();
echo "En la tienda: " . count($rows) . " productos\n\n";

$tol = 0.02;                        // tolerancia por redondeo a centavos
$malCost = $malPrice = $sinFeed = $costoCero = $bajoCosto = $sinPrecio = 0;
$ejemplos = [];
$peor = null;

foreach ($rows as $r) {
    $ref   = (string) $r['supplier_ref'];
    $cost  = (float) $r['cost'];
    $price = (float) $r['price'];

    // a) ¿El costo en la BD es EXACTAMENTE el precio que manda Exel?
    if (isset($porRef[$ref])) {
        $exel = (float) ($porRef[$ref]['precio'] ?? 0);
        $dif  = abs($cost - $exel);
        if ($dif > $tol) {
            $malCost++;
            if ($peor === null || $dif > $peor['dif']) {
                $peor = ['dif' => $dif, 'id' => $r['id'], 'name' => $r['name'], 'bd' => $cost, 'exel' => $exel];
            }
        }
    } else {
        if ((int) $r['is_active'] === 1) $sinFeed++;
    }

    // b) ¿price = cost × margen?
    $esperado = round($cost * $margen, 2);
    if (abs($price - $esperado) > $tol) $malPrice++;

    // c) Anomalías que producirían un cobro incorrecto
    if ($cost <= 0)              $costoCero++;
    if ($price <= 0)             $sinPrecio++;
    if ($cost > 0 && $price < $cost) $bajoCosto++;

    if (count($ejemplos) < $muestras && isset($porRef[$ref]) && $cost > 0) {
        $ejemplos[] = [$r, (float) ($porRef[$ref]['precio'] ?? 0)];
    }
}

/* ── 3. Muestra: la cadena completa, producto por producto ── */
echo "── Ejemplos: de Exel al cliente ──\n";
printf("%-6s %-34s %10s %10s %10s %10s  %s\n", 'ID', 'PRODUCTO', 'EXEL', 'COSTO BD', 'S/IVA', 'CLIENTE', '');
echo str_repeat('-', 104) . "\n";
foreach ($ejemplos as [$r, $exelPrecio]) {
    $cost     = (float) $r['cost'];
    $price    = (float) $r['price'];
    $cliente  = round($price * (1 + $IVA), 2);
    $okCost   = abs($cost - $exelPrecio) <= $tol;
    $okPrice  = abs($price - round($cost * $margen, 2)) <= $tol;
    printf("%-6s %-34s %10.2f %10.2f %10.2f %10.2f  %s\n",
        $r['id'], mb_strimwidth((string) $r['name'], 0, 34, '…'),
        $exelPrecio, $cost, $price, $cliente,
        ($okCost && $okPrice) ? 'ok' : '<<< REVISAR');
}

/* ── 4. Veredicto ── */
echo "\n── Resultado sobre los " . count($rows) . " productos ──\n";
printf("  Costo distinto al de Exel:        %d\n", $malCost);
printf("  price != costo x margen:          %d\n", $malPrice);
printf("  Costo 0 o negativo:               %d\n", $costoCero);
printf("  Precio 0 o negativo:              %d\n", $sinPrecio);
printf("  Precio POR DEBAJO del costo:      %d\n", $bajoCosto);
printf("  Activos que Exel ya no manda:     %d\n", $sinFeed);

if ($peor) {
    printf("\n  Mayor diferencia de costo: #%s %s\n    BD=%.2f  Exel=%.2f  (dif %.2f)\n",
        $peor['id'], mb_strimwidth($peor['name'], 0, 50, '…'), $peor['bd'], $peor['exel'], $peor['dif']);
}

$problemas = $malCost + $malPrice + $costoCero + $sinPrecio + $bajoCosto;
echo "\n";
if ($problemas === 0) {
    echo "✓ TODOS los precios cuadran: el costo es el de Exel y la cuenta\n";
    echo "  costo x {$margen} x " . (1 + $IVA) . " es correcta en cada producto.\n";
    if ($sinFeed > 0) {
        echo "\n  Nota: {$sinFeed} productos activos ya no vienen en el feed de Exel.\n";
        echo "  El próximo sync los va a ocultar solo (is_active = 0).\n";
    }
    exit(0);
}
echo "✗ Hay {$problemas} producto(s) con precio inconsistente. NO deberían venderse así.\n";
exit(1);
