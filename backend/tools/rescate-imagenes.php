<?php
/**
 * Tercera pasada del catálogo: rescata imágenes oficiales que pueden comprobarse.
 *
 * Uso: php backend/tools/rescate-imagenes.php 100
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Solo CLI.\n"); }

require __DIR__ . '/../api/lib/env.php';
load_env(__DIR__ . '/../.env');

$cfgFile = __DIR__ . '/../api/config.php';
$CONFIG = is_file($cfgFile) ? require $cfgFile : ['db' => [
    'host' => env('DATABASE_HOST', '127.0.0.1'), 'port' => (int) env('DATABASE_PORT', 3306),
    'name' => env('DATABASE_NAME', 'okstation'), 'user' => env('DATABASE_USER', 'root'),
    'pass' => env('DATABASE_PASSWORD', ''), 'charset' => 'utf8mb4',
]];
$GLOBALS['CONFIG'] = $CONFIG;

require __DIR__ . '/../api/lib/CatalogoAlcance.php';
require __DIR__ . '/../api/lib/Nextep.php';
require __DIR__ . '/../api/lib/BuscadorMarca.php';
require __DIR__ . '/../api/lib/ImagenSegura.php';
require __DIR__ . '/../api/lib/EnrichLog.php';
require __DIR__ . '/../api/lib/RescateImagenes.php';

$d = $CONFIG['db'];
try {
    $pdo = new PDO(
        "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
        $d['user'], $d['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (Throwable $e) {
    fwrite(STDERR, "No se pudo conectar a la base de datos.\n");
    exit(1);
}

$limit = max(1, min(500, (int) ($argv[1] ?? 250)));
$hechos = 0;
$total = ['procesados' => 0, 'rescatados' => 0, 'revision' => 0, 'sin_datos' => 0, 'errores' => 0, 'imagenes' => 0];

echo "Rescate automático de imágenes — tope {$limit}\n";
while ($hechos < $limit) {
    $lote = RescateImagenes::procesar($pdo, min(25, $limit - $hechos));
    foreach (array_keys($total) as $k) $total[$k] += (int) ($lote[$k] ?? 0);
    $hechos += (int) $lote['procesados'];
    printf(
        "  procesados %d · rescatados %d · revisión %d · errores %d · pendientes %d\n",
        $total['procesados'], $total['rescatados'], $total['revision'],
        $total['errores'], (int) $lote['pendientes']
    );
    if ((int) $lote['procesados'] === 0 || (int) $lote['pendientes'] === 0) break;
}

printf(
    "Listo. %d producto(s) rescatados, %d imagen(es) locales; %d quedaron para revisión.\n",
    $total['rescatados'], $total['imagenes'], $total['revision']
);
exit($total['errores'] > 0 ? 1 : 0);
