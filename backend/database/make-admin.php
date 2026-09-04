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
 *
 * Solo CLI: da rol de Administrador, así que NO debe poder llamarse por HTTP.
 * El vhost sirve backend/ por PHP-FPM y no bloquea esta carpeta; con
 * register_argc_argv activado, $argv se llena desde el query string.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Solo CLI.\n");
}

require __DIR__ . '/../api/lib/env.php';

$email = trim((string) ($argv[1] ?? ''));
$slug  = trim((string) ($argv[2] ?? 'administrador'));   // administrador | directivo | empleado | cliente
if ($email === '') {
    fwrite(STDERR, "Uso: php make-admin.php <correo> [rol]\n  rol: administrador (predeterminado) | directivo | empleado | cliente\n");
    exit(1);
}

/* Conexión: usa la MISMA fuente que la web (backend/api/config.php); si no existe,
   cae al .env. Evita el "Access denied for user ''" cuando el .env no está
   disponible para el contexto CLI (mismo arreglo que migrate.php). */
$configFile = __DIR__ . '/../api/config.php';
if (is_file($configFile)) {
    $CONFIG = require $configFile;
    $d = ($CONFIG['db'] ?? []) + [
        'host' => '127.0.0.1', 'port' => 3306, 'name' => '',
        'user' => '', 'pass' => '', 'charset' => 'utf8mb4',
    ];
    $dsn    = "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}";
    $dbUser = (string) $d['user'];
    $dbPass = (string) $d['pass'];
} else {
    load_env(__DIR__ . '/../.env');
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        env('DATABASE_HOST', '127.0.0.1'),
        (int) env('DATABASE_PORT', 3306),
        env('DATABASE_NAME', '')
    );
    $dbUser = (string) env('DATABASE_USER', '');
    $dbPass = (string) env('DATABASE_PASSWORD', '');
}
try {
    $pdo = new PDO($dsn, $dbUser, $dbPass, [
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
