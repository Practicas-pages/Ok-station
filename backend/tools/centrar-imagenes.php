<?php
/**
 * Centra fotografías existentes recortando margen blanco/transparente.
 *
 * Uso:
 *   php backend/tools/centrar-imagenes.php --limit=500
 *
 * Los originales no se borran. Se crea un archivo `-center` y solo entonces se
 * cambia stored_path, por lo que el proceso es recuperable e idempotente.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Solo CLI.\n");
}

require __DIR__ . '/../api/lib/env.php';
require __DIR__ . '/../api/lib/ImagenSegura.php';
load_env(__DIR__ . '/../.env');
if (!ImagenSegura::puedeCentrar()) {
    fwrite(STDERR, "✗ PHP-GD no está disponible; no se modificó ninguna fotografía.\n");
    exit(1);
}
$cfg = require __DIR__ . '/../api/config.php';
$d = $cfg['db'];
$pdo = new PDO(
    "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
    $d['user'], $d['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$limit = 500;
foreach (array_slice($argv, 1) as $arg) {
    if (preg_match('/^--limit=(\d+)$/', $arg, $m)) $limit = max(1, min(5000, (int) $m[1]));
    else { fwrite(STDERR, "Uso: php centrar-imagenes.php [--limit=N]\n"); exit(2); }
}

$st = $pdo->query(
    "SELECT i.id, i.product_id, i.stored_path
       FROM product_images i
       JOIN products p ON p.id = i.product_id
      WHERE p.is_active = 1
        AND i.stored_path IS NOT NULL AND i.stored_path <> ''
        AND i.stored_path NOT LIKE '%-center.%'
      ORDER BY i.is_primary DESC, i.product_id, i.sort_order
      LIMIT {$limit}"
);
$rows = $st->fetchAll();
$webRoot = realpath(__DIR__ . '/../..');
$ok = 0; $sinCambio = 0; $fallos = 0;

foreach ($rows as $r) {
    $rel = (string) $r['stored_path'];
    $ruta = $webRoot . '/' . ltrim($rel, '/');
    $real = realpath($ruta);
    if (!$real || !str_starts_with($real, $webRoot . DIRECTORY_SEPARATOR) || !is_file($real)) {
        $fallos++; continue;
    }
    $data = @file_get_contents($real);
    $info = is_string($data) ? @getimagesizefromstring($data) : false;
    $mime = (string) ($info['mime'] ?? '');
    if (!is_string($data) || !isset(ImagenSegura::MIMES[$mime])) { $fallos++; continue; }
    $centrada = ImagenSegura::centrarProducto($data, $mime);
    $ext = ImagenSegura::MIMES[$mime];
    $nuevo = preg_replace('/\.[A-Za-z0-9]+$/', '-center.' . $ext, $real);
    if (!is_string($nuevo) || file_put_contents($nuevo . '.part', $centrada, LOCK_EX) === false || !@rename($nuevo . '.part', $nuevo)) {
        @unlink((string) $nuevo . '.part'); $fallos++; continue;
    }
    $nuevoRel = str_replace('\\', '/', substr($nuevo, strlen($webRoot)));
    $pdo->prepare('UPDATE product_images SET stored_path = ? WHERE id = ?')->execute([$nuevoRel, $r['id']]);
    if ($centrada === $data) $sinCambio++;
    else $ok++;
}

printf(
    "Centradas: %d · ya correctas: %d · fallidas: %d · revisadas: %d\n",
    $ok, $sinCambio, $fallos, count($rows)
);
if ($fallos > 0 && $ok === 0 && $sinCambio === 0) exit(1);
