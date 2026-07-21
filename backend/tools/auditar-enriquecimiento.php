<?php
/**
 * Ok.station — Auditoría de enriquecimiento del catálogo (CLI, SOLO LECTURA)
 * -----------------------------------------------------------------------------
 * ¿Cuántos productos activos NO tienen imagen, descripción o ficha técnica, y dónde
 * se concentra el hueco (por categoría y por marca)? Recuerda el orden de negocio:
 * las imágenes/descripciones/fichas vienen PRIMERO de Exel del Norte y solo se
 * complementan con Icecat.
 *
 * NO escribe nada. Uso (terminal del sitio):
 *     php backend/tools/auditar-enriquecimiento.php
 *
 * Lee: products (is_active, description, specs_json, enriched_at) + product_images.
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
    $pdo = new PDO(
        "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
        $d['user'], $d['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (Throwable $e) {
    fwrite(STDERR, "✗ No se pudo conectar a la BD. Revisa DATABASE_* en backend/.env\n  {$e->getMessage()}\n");
    exit(1);
}

/* Expresiones reutilizadas: "le falta X". product_images cubre TODAS las fuentes
   (source='exel' o 'icecat'); specs_json es la ficha (Icecat casi siempre). */
$SIN_IMG   = "NOT EXISTS(SELECT 1 FROM product_images i WHERE i.product_id = p.id)";
$SIN_DESC  = "COALESCE(p.description, '') = ''";
$SIN_FICHA = "p.specs_json IS NULL";
$SIN_TRY   = "p.enriched_at IS NULL";   // aún NO se le ha preguntado a Icecat

echo "════════════════════════════════════════════════════════════════════\n";
echo "  Auditoría de enriquecimiento — " . date('Y-m-d H:i:s') . "\n";
echo "════════════════════════════════════════════════════════════════════\n\n";

/* ── Totales ── */
$t = $pdo->query("
    SELECT COUNT(*) act,
           SUM($SIN_IMG)   sin_img,
           SUM($SIN_DESC)  sin_desc,
           SUM($SIN_FICHA) sin_ficha,
           SUM($SIN_TRY)   sin_intentar
      FROM products p WHERE p.is_active = 1")->fetch();
$act = max(1, (int) $t['act']);
$pct = fn($n) => str_pad(round($n * 100 / $act) . '%', 4, ' ', STR_PAD_LEFT);
printf("  Productos activos:        %d\n", $t['act']);
printf("  SIN imagen:               %-6d (%s)\n", $t['sin_img'],   $pct((int) $t['sin_img']));
printf("  SIN descripción:          %-6d (%s)\n", $t['sin_desc'],  $pct((int) $t['sin_desc']));
printf("  SIN ficha técnica:        %-6d (%s)\n", $t['sin_ficha'], $pct((int) $t['sin_ficha']));
printf("  Nunca consultados Icecat: %-6d (%s)  ← lo que icecat-enrich.php aún puede vestir\n",
    $t['sin_intentar'], $pct((int) $t['sin_intentar']));

/* ── Por categoría (dónde se concentra el hueco de FICHA) ── */
$cats = $pdo->query("
    SELECT p.category cat, COUNT(*) act,
           SUM($SIN_IMG) sin_img, SUM($SIN_DESC) sin_desc, SUM($SIN_FICHA) sin_ficha
      FROM products p WHERE p.is_active = 1 AND p.category <> ''
      GROUP BY p.category ORDER BY sin_ficha DESC")->fetchAll();
echo "\n── Por categoría (ordenado por 'sin ficha') ──\n";
printf("  %-34s %6s %8s %8s %9s\n", 'Categoría', 'activos', 'sin img', 'sin desc', 'sin ficha');
foreach ($cats as $c) {
    printf("  %-34s %6d %8d %8d %9d\n",
        mb_strimwidth((string) $c['cat'], 0, 34), $c['act'], $c['sin_img'], $c['sin_desc'], $c['sin_ficha']);
}

/* ── Marcas con más productos SIN IMAGEN (las que más urge cubrir) ── */
$brands = $pdo->query("
    SELECT COALESCE(NULLIF(p.brand, ''), '(sin marca)') marca, COUNT(*) act,
           SUM($SIN_IMG) sin_img, SUM($SIN_FICHA) sin_ficha
      FROM products p WHERE p.is_active = 1
      GROUP BY marca HAVING sin_img > 0 ORDER BY sin_img DESC LIMIT 25")->fetchAll();
echo "\n── Top 25 marcas con productos SIN IMAGEN ──\n";
echo "   (si la marca NO está en Open Icecat —BIC, Stabilo, Pilot, Sharpie, Casio, Fellowes,\n";
echo "    Post-it/Scotch, Avery, Maped, Pritt…— su imagen solo puede venir de Exel /imagenes)\n";
printf("  %-26s %6s %8s %9s\n", 'Marca', 'activos', 'sin img', 'sin ficha');
foreach ($brands as $b) {
    printf("  %-26s %6d %8d %9d\n",
        mb_strimwidth((string) $b['marca'], 0, 26), $b['act'], $b['sin_img'], $b['sin_ficha']);
}

echo "\n── Cómo cerrar el hueco ──\n";
echo "  · Imágenes/fichas SIN INTENTAR: corre el enriquecedor nocturno con tope alto:\n";
echo "        php backend/tools/icecat-enrich.php 2000\n";
echo "  · Imágenes que Exel SÍ tiene pero no se guardaron: corre el sync completo, o el\n";
echo "    nuevo runner de solo-imágenes-faltantes:\n";
echo "        php backend/tools/exel-imagenes.php\n";
echo "  · Lo que quede sin ficha tras varias noches suele ser marca fuera de Open Icecat:\n";
echo "    esos NO tienen ficha disponible gratis (se muestran con los datos de Exel).\n\n";
