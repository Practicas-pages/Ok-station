<?php
/**
 * Diagnóstico de instalación (TEMPORAL).
 * Uso:  https://okstation.mx/backend/api/health.php?key=TU_SETUP_TOKEN
 * Define SETUP_TOKEN en backend/.env. Cuando termines, déjalo VACÍO (esto se deshabilita).
 * No expone secretos: solo estados (true/false) y nombres de tablas faltantes.
 */
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/lib/env.php';
load_env(__DIR__ . '/../.env');

$setup = (string) env('SETUP_TOKEN', '');
$key   = (string) ($_GET['key'] ?? '');
if ($setup === '' || !hash_equals($setup, $key)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Diagnóstico deshabilitado. Define SETUP_TOKEN en .env y úsalo como ?key=.']);
    exit;
}

$c = [];

// PHP y extensiones
$c['php_version'] = PHP_VERSION;
foreach (['pdo_mysql', 'fileinfo', 'openssl', 'json', 'mbstring'] as $e) {
    $c['ext_' . $e] = extension_loaded($e);
}

// Config
$c['app_env']        = env('APP_ENV', '');
$c['db_name']        = env('DATABASE_NAME', '');
$c['jwt_secret_ok']  = strlen((string) env('JWT_SECRET', '')) >= 32;
$c['admin_emails_set'] = trim((string) env('ADMIN_EMAILS', '')) !== '';
$c['smtp_set']       = trim((string) env('SMTP_HOST', '')) !== '';

// Conexión a la BD
$db = null;
try {
    $db = new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', env('DATABASE_HOST', '127.0.0.1'), (int) env('DATABASE_PORT', 3306), env('DATABASE_NAME', '')),
        env('DATABASE_USER', ''), env('DATABASE_PASSWORD', ''),
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    $c['db_connect'] = true;
} catch (Throwable $e) {
    $c['db_connect'] = false;
    $c['db_hint'] = 'No conecta: revisa DATABASE_NAME (okstationv2), DATABASE_USER y DATABASE_PASSWORD.';
}

// Tablas / migraciones
if ($db) {
    $expected = ['users','roles','permissions','role_permissions','user_roles','password_resets',
        'categories','services','orders','order_items','uploaded_files','reviews','review_replies',
        'notifications','settings','activity_logs','login_attempts','schema_migrations'];
    $have = $db->query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()")->fetchAll(PDO::FETCH_COLUMN);
    $c['tables_count']   = count($have);
    $c['tables_missing'] = array_values(array_diff($expected, $have));
    $c['migrations_ok']  = in_array('schema_migrations', $have, true) && empty($c['tables_missing']);
    $c['old_schema_detected'] = in_array('order_files', $have, true); // si true: importaste el schema VIEJO
    try { $c['roles_seeded'] = (int) $db->query("SELECT COUNT(*) FROM roles")->fetchColumn() >= 3; } catch (Throwable $e) { $c['roles_seeded'] = false; }
}

// Storage
$sp = (string) env('STORAGE_PATH', __DIR__ . '/../storage');
$c['storage_path']     = $sp;
$c['storage_writable'] = is_dir($sp) ? is_writable($sp) : @mkdir($sp, 0775, true);

$ready = !empty($c['db_connect']) && !empty($c['migrations_ok']) && empty($c['old_schema_detected'])
    && !empty($c['jwt_secret_ok']) && !empty($c['storage_writable']) && !empty($c['ext_pdo_mysql']);

echo json_encode(['ok' => true, 'ready_for_production' => $ready, 'checks' => $c], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
