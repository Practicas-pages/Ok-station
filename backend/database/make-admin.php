<?php
/**
 * Ok.station — Dar rol de Administrador a un usuario por correo (CLI).
 * ------------------------------------------------------------------
 * Uso:
 *     php backend/database/make-admin.php correo@ejemplo.com
 *     php backend/database/make-admin.php correo@ejemplo.com directivo
 *
 * El usuario debe EXISTIR (regístralo primero en la página, en "Cuenta").
 * Idempotente: correrlo de nuevo no duplica nada. Lee la conexión de backend/.env.
 */
declare(strict_types=1);

require __DIR__ . '/../api/lib/env.php';
load_env(__DIR__ . '/../.env');

$email = trim((string) ($argv[1] ?? ''));
$slug  = trim((string) ($argv[2] ?? 'administrador'));   // administrador | directivo | empleado | cliente
if ($email === '') {
    fwrite(STDERR, "Uso: php make-admin.php <correo> [rol]\n  rol: administrador (predeterminado) | directivo | empleado | cliente\n");
    exit(1);
}

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
    exit(1);
}

$u = $pdo->prepare("SELECT id, full_name FROM users WHERE email = ?");
$u->execute([$email]);
$user = $u->fetch(PDO::FETCH_ASSOC);
if (!$user) {
    fwrite(STDERR, "✗ No existe un usuario con el correo {$email}.\n  Regístralo primero en la página (sección \"Cuenta\") y vuelve a correr esto.\n");
    exit(1);
}

$r = $pdo->prepare("SELECT id, name FROM roles WHERE slug = ?");
$r->execute([$slug]);
$role = $r->fetch(PDO::FETCH_ASSOC);
if (!$role) {
    fwrite(STDERR, "✗ No existe el rol '{$slug}'. Roles válidos: administrador, directivo, empleado, cliente.\n");
    exit(1);
}

$pdo->prepare("INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)")
    ->execute([$user['id'], $role['id']]);

echo "✓ {$user['full_name']} ({$email}) ahora tiene el rol: {$role['name']}.\n";
