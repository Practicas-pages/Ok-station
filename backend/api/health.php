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
    $c['db_hint'] = 'No conecta: revisa DATABASE_NAME (okstation), DATABASE_USER y DATABASE_PASSWORD.';
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

/* ── IP real detrás de Cloudflare ─────────────────────────────────────────────
   Prueba empírica de si nginx está restaurando la IP real (deploy/cloudflare-real-ip.conf).
   En producción, ábrelo desde tu navegador (que pasa por Cloudflare) con ?key=…:
     - real_ip_working = true  → REMOTE_ADDR ya es tu IP real. El arreglo funciona.
     - "detras_de_cloudflare_SIN_real_ip" → REMOTE_ADDR es una IP de Cloudflare:
        falta pegar/activar el .conf. RATE-LIMIT ROTO (todos comparten esa IP).
     - "detras_de_proxy_SIN_real_ip" → REMOTE_ADDR es loopback/privada (Varnish):
        falta aplicar real_ip en el server que ejecuta PHP.
   En local (php -S, sin nginx ni Cloudflare) verás 127.0.0.1 → "local_sin_proxy". */
$remote = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
$cfip   = (string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? '');
$ipInCidr = function (string $ip, string $cidr): bool {
    if (strpos($cidr, '/') === false) return false;
    // IPv4 mapeada en IPv6 (::ffff:a.b.c.d): nginx dual-stack puede emitirla.
    // Se normaliza a IPv4 para que compare contra los rangos IPv4 de Cloudflare.
    if (preg_match('/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i', $ip, $mm)) $ip = $mm[1];
    [$net, $bits] = explode('/', $cidr, 2);
    $ipB = @inet_pton($ip); $netB = @inet_pton($net);
    if ($ipB === false || $netB === false || strlen($ipB) !== strlen($netB)) return false; // familias distintas
    $bits = (int) $bits;
    if ($bits < 0 || $bits > strlen($ipB) * 8) return false;   // prefijo fuera de rango → no arriesgar lectura
    $full = intdiv($bits, 8); $rem = $bits % 8;
    if ($full > 0 && strncmp($ipB, $netB, $full) !== 0) return false;
    if ($rem === 0) return true;
    $mask = chr((0xFF << (8 - $rem)) & 0xFF);
    return (ord($ipB[$full]) & ord($mask)) === (ord($netB[$full]) & ord($mask));
};
/* Rangos de Cloudflare: se leen del .conf desplegado para no duplicar la lista,
   con una copia de RESPALDO embebida por si deploy/ no se publica en producción
   (si no, cf_ranges_loaded=0 daría un veredicto ambiguo). Mantener en sync con
   deploy/cloudflare-real-ip.conf (el cron los actualiza allí). */
$cfFallback = [
    '173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18',
    '108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17',
    '162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22',
    '2400:cb00::/32','2606:4700::/32','2803:f800::/32','2405:b500::/32','2405:8100::/32',
    '2a06:98c0::/29','2c0f:f248::/32',
];
$cfRanges = [];
$cfSource = 'embebida';
$confFile = __DIR__ . '/../../deploy/cloudflare-real-ip.conf';
if (is_file($confFile)
    && preg_match_all('/^\s*set_real_ip_from\s+([^;\s]+)\s*;/m', (string) file_get_contents($confFile), $m)) {
    // Anclado a inicio de línea: solo las directivas reales, no la palabra en comentarios.
    $cfRanges = array_map('trim', $m[1]);
    $cfSource = 'deploy/cloudflare-real-ip.conf';
}
if (!$cfRanges) $cfRanges = $cfFallback;   // el .conf no está desplegado → usar respaldo

$isLoopbackOrPrivate = $remote === '' || $remote === '::1'
    || filter_var($remote, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
$remoteIsCf = false;
foreach ($cfRanges as $r) { if ($ipInCidr($remote, $r)) { $remoteIsCf = true; break; } }

/* Orden de decisión: la coincidencia CF-Connecting-IP === REMOTE_ADDR gana PRIMERO.
   Si son iguales, nginx real_ip actuó (o quien prueba usa Cloudflare WARP y su IP
   real cae en rango CF); en ambos casos es "activo", no "roto". OJO: si el origen
   sigue ABIERTO (falta Paso B), un atacante con el token podría falsificar
   CF-Connecting-IP y forzar este verde — el veredicto solo es de fiar una vez
   cerrado el origen. La presencia de cf_ray ayuda a distinguir tráfico real de CF. */
if ($cfip !== '' && $cfip === $remote) {
    $verdict = 'ok_real_ip_activo';
} elseif ($remoteIsCf) {
    $verdict = 'detras_de_cloudflare_SIN_real_ip';   // REMOTE_ADDR es de Cloudflare → rate-limit roto
} elseif ($isLoopbackOrPrivate) {
    $verdict = $cfip !== '' ? 'detras_de_proxy_SIN_real_ip' : 'local_sin_proxy';
} elseif ($cfip !== '') {
    $verdict = 'revisar_remote_no_coincide_con_cf'; // hay CF header pero REMOTE_ADDR no cuadra
} else {
    $verdict = 'sin_cloudflare_ip_publica_directa';  // IP pública directa, sin pasar por CF
}
$c['ip'] = [
    'remote_addr'        => $remote,
    'cf_connecting_ip'   => $cfip,
    'x_forwarded_for'    => (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''),
    'cf_ipcountry'       => (string) ($_SERVER['HTTP_CF_IPCOUNTRY'] ?? ''),
    'cf_region'          => (string) ($_SERVER['HTTP_CF_REGION'] ?? $_SERVER['HTTP_CF_REGION_CODE'] ?? ''),
    'cf_ray'             => (string) ($_SERVER['HTTP_CF_RAY'] ?? ''),   // vacío = la petición no pasó por Cloudflare
    'cf_ranges_source'   => $cfSource,
    'cf_ranges_loaded'   => count($cfRanges),
    'real_ip_working'    => $verdict === 'ok_real_ip_activo',
    'verdict'            => $verdict,
];

$ready = !empty($c['db_connect']) && !empty($c['migrations_ok']) && empty($c['old_schema_detected'])
    && !empty($c['jwt_secret_ok']) && !empty($c['storage_writable']) && !empty($c['ext_pdo_mysql']);

echo json_encode(['ok' => true, 'ready_for_production' => $ready, 'checks' => $c], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
