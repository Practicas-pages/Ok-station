<?php
/**
 * OK.station — Runner de migraciones (CLI, sin dependencias)
 * Uso en CloudPanel (terminal del sitio):
 *     php backend/database/migrate.php
 *
 * Aplica, en orden, los .sql de migrations/ que aún no se hayan ejecutado,
 * y los registra en la tabla schema_migrations. Idempotente: re-ejecutarlo
 * no repite nada. Lee la conexión desde backend/.env (DATABASE_*).
 */
declare(strict_types=1);

require __DIR__ . '/../api/lib/env.php';
load_env(__DIR__ . '/../.env');

$dsn = sprintf(
    'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
    env('DATABASE_HOST', '127.0.0.1'),
    (int) env('DATABASE_PORT', 3306),
    env('DATABASE_NAME', '')
);

try {
    $pdo = new PDO($dsn, env('DATABASE_USER', ''), env('DATABASE_PASSWORD', ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
} catch (Throwable $e) {
    fwrite(STDERR, "✗ No se pudo conectar a la base de datos.\n  " . $e->getMessage() . "\n");
    fwrite(STDERR, "  Revisa DATABASE_* en backend/.env\n");
    exit(1);
}

$pdo->exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(190) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
);

$applied = $pdo->query("SELECT filename FROM schema_migrations")->fetchAll(PDO::FETCH_COLUMN);

$files = glob(__DIR__ . '/migrations/*.sql');
sort($files);

$ran = 0;
foreach ($files as $file) {
    $name = basename($file);
    if (in_array($name, $applied, true)) {
        continue;
    }
    echo "→ Aplicando {$name} ...\n";
    $sql = file_get_contents($file);
    try {
        $pdo->exec($sql);  // pdo_mysql ejecuta múltiples sentencias
        $pdo->prepare("INSERT INTO schema_migrations (filename) VALUES (?)")->execute([$name]);
        $ran++;
        echo "  ✓ OK\n";
    } catch (Throwable $e) {
        fwrite(STDERR, "  ✗ Error en {$name}: " . $e->getMessage() . "\n");
        exit(1);
    }
}

echo $ran
    ? "✓ Listo: {$ran} migración(es) aplicada(s).\n"
    : "✓ La base de datos ya está al día (nada que aplicar).\n";
