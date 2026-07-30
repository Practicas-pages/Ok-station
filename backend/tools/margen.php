<?php
/**
 * Ajuste del margen del catálogo (settings.shop_margin) + recálculo de precios.
 * =============================================================================
 * SOLO CLI. Por defecto NO cambia nada: muestra el estado o una vista previa.
 * 'aplicar' sí modifica precios (los que ven los clientes) — y guarda RESPALDO
 * para poder revertir con un comando.
 *
 * Recordatorio: `price` es el precio de venta SIN IVA = costo × factor. El IVA se
 * agrega solo al mostrar. Un factor 1.30 = 30% sobre el COSTO = ~23% de utilidad
 * sobre la VENTA. Para 30% de utilidad sobre la venta, el factor es 1.4286.
 *
 * Uso:
 *   php backend/tools/margen.php                    ← estado actual (factor y utilidad)
 *   php backend/tools/margen.php 1.4286             ← PREVIEW con ese factor (no cambia nada)
 *   php backend/tools/margen.php 1.4286 aplicar     ← APLICA (con respaldo). Decisión del dueño.
 *   php backend/tools/margen.php revertir <archivo> ← restaura precios y factor desde un respaldo
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Solo CLI.\n"); }

$CONFIG = require __DIR__ . '/../api/config.php';
$d = $CONFIG['db'];
try {
    $pdo = new PDO(
        "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}",
        $d['user'], $d['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (Throwable $e) { exit("No se pudo abrir la base: " . $e->getMessage() . "\n"); }

function utilidadVenta(float $f): string { return $f > 0 ? round(($f - 1) / $f * 100, 1) . '%' : '—'; }
function marginActual(PDO $pdo): float {
    $r = $pdo->query("SELECT `value` FROM settings WHERE `key`='shop_margin'")->fetch(PDO::FETCH_ASSOC);
    return $r ? (float) $r['value'] : 1.30;
}
$backupsDir = __DIR__ . '/backups';

$arg1 = $argv[1] ?? '';
$arg2 = $argv[2] ?? '';

/* ── REVERTIR ─────────────────────────────────────────────────────────────── */
if ($arg1 === 'revertir') {
    $file = $arg2;
    if ($file === '' || !is_file($file)) exit("Falta el archivo de respaldo. Uso: php margen.php revertir <archivo>\n");
    $bak = json_decode((string) file_get_contents($file), true);
    if (!is_array($bak) || empty($bak['precios'])) exit("Respaldo inválido.\n");

    $pdo->beginTransaction();
    try {
        $up = $pdo->prepare("UPDATE products SET price = ? WHERE id = ?");
        foreach ($bak['precios'] as $p) $up->execute([$p['price'], $p['id']]);
        if (isset($bak['margin_anterior'])) {
            $pdo->prepare("UPDATE settings SET `value` = ? WHERE `key`='shop_margin'")->execute([(string) $bak['margin_anterior']]);
        }
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); exit("Error al revertir: " . $e->getMessage() . "\n"); }
    echo "✔ Revertido: " . count($bak['precios']) . " precios restaurados"
       . (isset($bak['margin_anterior']) ? " y factor de vuelta a {$bak['margin_anterior']}." : ".") . "\n";
    exit(0);
}

/* ── Estado / preview / aplicar ───────────────────────────────────────────── */
$actual = marginActual($pdo);
echo "── Margen del catálogo ──\n";
echo "Factor actual (settings.shop_margin): {$actual}  →  markup " . round(($actual - 1) * 100, 1) . "% sobre costo  =  utilidad " . utilidadVenta($actual) . " sobre venta\n";

/* Solo estado. */
if ($arg1 === '') {
    echo "\nPara probar otro factor sin cambiar nada:  php backend/tools/margen.php 1.4286\n";
    echo "(1.4286 = 30% de utilidad sobre la venta)\n";
    exit(0);
}

$nuevo = (float) $arg1;
if ($nuevo < 1.0 || $nuevo > 5.0) exit("\nFactor fuera de rango razonable (1.0–5.0): '{$arg1}'.\n");

/* Impacto sobre el catálogo real (solo con costo > 0). */
$rows = $pdo->query("SELECT id, name, cost, price FROM products WHERE supplier='exel' AND cost > 0")->fetchAll(PDO::FETCH_ASSOC);
$n = count($rows);
if ($n === 0) exit("\nNo hay productos con costo > 0 que recalcular.\n");

$sumViejo = 0.0; $sumNuevo = 0.0; $muestra = [];
foreach ($rows as $i => $r) {
    $viejo = (float) $r['price'];
    $nuevoP = round((float) $r['cost'] * $nuevo, 2);
    $sumViejo += $viejo; $sumNuevo += $nuevoP;
    if ($i < 6) $muestra[] = [$r['name'], (float) $r['cost'], $viejo, $nuevoP];
}
$deltaPct = $sumViejo > 0 ? round(($sumNuevo - $sumViejo) / $sumViejo * 100, 1) : 0;

echo "\n── PREVIEW con factor {$nuevo}  (utilidad " . utilidadVenta($nuevo) . " sobre venta) ──\n";
echo "Productos afectados: {$n}\n";
printf("%-42s %10s %10s %10s\n", 'Producto', 'costo', 'precio hoy', 'precio nuevo');
foreach ($muestra as $m) printf("%-42s %10.2f %10.2f %10.2f\n", mb_strimwidth($m[0], 0, 40, '…'), $m[1], $m[2], $m[3]);
echo str_repeat('─', 74) . "\n";
printf("Cambio promedio en los precios: %+.1f%%\n", $deltaPct);

if ($arg2 !== 'aplicar') {
    echo "\nEsto es solo una VISTA PREVIA — no se cambió nada.\n";
    echo "Para APLICARLO (decisión del dueño):  php backend/tools/margen.php {$nuevo} aplicar\n";
    exit(0);
}

/* ── APLICAR (con respaldo) ───────────────────────────────────────────────── */
if (!is_dir($backupsDir)) @mkdir($backupsDir, 0770, true);
$stamp = date('Ymd-His');
$file  = $backupsDir . "/margen-{$stamp}.json";
$respaldo = ['ts' => $stamp, 'margin_anterior' => $actual, 'factor_nuevo' => $nuevo, 'precios' => array_map(function ($r) {
    return ['id' => (int) $r['id'], 'price' => (float) $r['price']];
}, $rows)];
if (@file_put_contents($file, json_encode($respaldo, JSON_UNESCAPED_UNICODE)) === false) {
    exit("\nNo se pudo escribir el respaldo en {$file}. Abortado (no se cambió nada).\n");
}

$pdo->beginTransaction();
try {
    $pdo->prepare("UPDATE settings SET `value` = ? WHERE `key`='shop_margin'")->execute([(string) $nuevo]);
    // Si la fila no existía, insertarla.
    if ($pdo->query("SELECT COUNT(*) FROM settings WHERE `key`='shop_margin'")->fetchColumn() == 0) {
        $pdo->prepare("INSERT INTO settings (`key`,`value`) VALUES ('shop_margin', ?)")->execute([(string) $nuevo]);
    }
    $pdo->prepare("UPDATE products SET price = ROUND(cost * ?, 2) WHERE supplier='exel' AND cost > 0")->execute([$nuevo]);
    $pdo->commit();
} catch (Throwable $e) { $pdo->rollBack(); exit("\nError al aplicar (no se cambió nada): " . $e->getMessage() . "\n"); }

echo "\n✔ APLICADO. Factor = {$nuevo} (utilidad " . utilidadVenta($nuevo) . " sobre venta). {$n} precios recalculados.\n";
echo "Respaldo guardado en: {$file}\n";
echo "Para revertir:  php backend/tools/margen.php revertir {$file}\n";
