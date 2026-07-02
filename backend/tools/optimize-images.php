<?php
/**
 * Ok.station — Optimizador de imágenes (CLI). Corre en el servidor (CloudPanel),
 * que es donde hay PHP+GD. Reduce el PESO de las fotos: las que están más anchas
 * de lo necesario se redimensionan y recomprimen en WebP.
 *
 * Uso:
 *     php backend/tools/optimize-images.php [maxAncho] [calidad]
 *   maxAncho por defecto 1000 px · calidad por defecto 80 (1–100)
 *
 * SEGURO: NO toca tus originales. Escribe los resultados en
 *   assets/img/optimized/  (mismos nombres). Revísalos y, si te gustan,
 *   reemplaza los originales (al conservar el mismo nombre, NO cambia HTML
 *   ni SEO ni URLs).
 *
 * Requiere PHP con GD y soporte WebP. Si no lo tiene, te lo dice y no hace nada.
 */
declare(strict_types=1);

$ROOT   = realpath(__DIR__ . '/../../');
$SRCDIR = $ROOT . '/assets/img';
$OUTDIR = $SRCDIR . '/optimized';
$maxW   = isset($argv[1]) ? max(200, (int) $argv[1]) : 1000;
$q      = isset($argv[2]) ? min(100, max(40, (int) $argv[2])) : 80;

if (!function_exists('imagecreatefromwebp') || empty(gd_info()['WebP Support'])) {
    fwrite(STDERR, "✗ Este PHP no tiene GD con soporte WebP.\n");
    fwrite(STDERR, "  Alternativa sin servidor: usa https://squoosh.app (arrastra la imagen,\n");
    fwrite(STDERR, "  ponla en ~{$maxW}px de ancho y WebP calidad ~75, descárgala y súbela).\n");
    exit(1);
}
if (!is_dir($SRCDIR)) { fwrite(STDERR, "✗ No encuentro la carpeta de imágenes: $SRCDIR\n"); exit(1); }
if (!is_dir($OUTDIR) && !mkdir($OUTDIR, 0775, true)) { fwrite(STDERR, "✗ No pude crear $OUTDIR\n"); exit(1); }

$files = glob($SRCDIR . '/*.webp') ?: [];
echo "Optimizando imágenes en $SRCDIR (maxAncho={$maxW}px, calidad={$q})\n";
echo str_repeat('-', 64) . "\n";

$savedTotal = 0; $count = 0;
foreach ($files as $file) {
    $name = basename($file);
    $dim  = @getimagesize($file);
    if (!$dim) { printf("✗ %-34s no se pudo leer\n", $name); continue; }
    [$w, $h] = $dim;
    $origSize = (int) filesize($file);

    // Si ya es chica y ligera, se deja igual.
    if ($w <= $maxW && $origSize < 200 * 1024) {
        printf("· %-34s %6d KB  (ya está bien)\n", $name, (int) ($origSize / 1024));
        continue;
    }

    $src = @imagecreatefromwebp($file);
    if (!$src) { printf("✗ %-34s no se pudo decodificar\n", $name); continue; }

    $newW = min($w, $maxW);
    $newH = (int) round($h * ($newW / $w));
    $dst  = imagecreatetruecolor($newW, $newH);
    imagealphablending($dst, false);
    imagesavealpha($dst, true);
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $newW, $newH, $w, $h);

    $out = $OUTDIR . '/' . $name;
    imagewebp($dst, $out, $q);
    imagedestroy($src);
    imagedestroy($dst);

    $newSize = (int) filesize($out);
    $savedTotal += ($origSize - $newSize);
    $count++;
    printf("✓ %-34s %6d KB -> %5d KB   (%dpx -> %dpx)\n",
        $name, (int) ($origSize / 1024), (int) ($newSize / 1024), $w, $newW);
}

echo str_repeat('-', 64) . "\n";
printf("Listo: %d optimizada(s). Ahorro total ≈ %d KB.\n", $count, (int) ($savedTotal / 1024));
echo "Revisa $OUTDIR y, si te convence, reemplaza los originales (mismos nombres).\n";
