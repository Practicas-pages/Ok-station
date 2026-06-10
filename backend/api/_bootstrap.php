<?php
declare(strict_types=1);
/**
 * OK.station — Bootstrap del API
 * Config, CORS, conexión PDO, JWT (HS256 sin dependencias) y helpers.
 * Incluido al inicio de cada endpoint con: require __DIR__ . '/_bootstrap.php';
 */

$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Falta config.php (copia config.example.php y complétalo).']);
    exit;
}
$CONFIG = require $configFile;

/* ── CORS ── */
$origin = $CONFIG['cors_origin'] ?? '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Vary: Origin');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Content-Type: application/json; charset=utf-8');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/* ── Respuestas JSON ── */
function respond($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(string $msg, int $code = 400, array $extra = []): void {
    respond(array_merge(['ok' => false, 'error' => $msg], $extra), $code);
}
function body(): array {
    $j = json_decode((string) file_get_contents('php://input'), true);
    return is_array($j) ? $j : [];
}
function field(array $src, string $key): string {
    return trim((string) ($src[$key] ?? ''));
}
function only_method(string $method): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) fail('Método no permitido.', 405);
}

/* ── Conexión PDO (singleton) ── */
function db(): PDO {
    static $pdo = null;
    global $CONFIG;
    if ($pdo) return $pdo;
    $d = $CONFIG['db'];
    $dsn = "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}";
    try {
        $pdo = new PDO($dsn, $d['user'], $d['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (Throwable $e) {
        fail('No se pudo conectar a la base de datos.', 500);
    }
    return $pdo;
}

/* ── JWT HS256 (sin librerías externas) ── */
function b64url(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64url_decode(string $s): string { return (string) base64_decode(strtr($s, '-_', '+/')); }

function jwt_make(array $claims): string {
    global $CONFIG;
    $header  = b64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $claims['iat'] = time();
    $claims['exp'] = time() + (int) $CONFIG['jwt_ttl'];
    $payload = b64url(json_encode($claims, JSON_UNESCAPED_UNICODE));
    $sig     = b64url(hash_hmac('sha256', "$header.$payload", $CONFIG['jwt_secret'], true));
    return "$header.$payload.$sig";
}
function jwt_verify(string $token): ?array {
    global $CONFIG;
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$h, $p, $s] = $parts;
    $expected = b64url(hash_hmac('sha256', "$h.$p", $CONFIG['jwt_secret'], true));
    if (!hash_equals($expected, $s)) return null;
    $claims = json_decode(b64url_decode($p), true);
    if (!is_array($claims) || (int) ($claims['exp'] ?? 0) < time()) return null;
    return $claims;
}
function require_auth(): array {
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (!preg_match('/Bearer\s+(.+)/i', $hdr, $m)) fail('No autenticado.', 401);
    $claims = jwt_verify(trim($m[1]));
    if (!$claims) fail('Sesión inválida o expirada. Inicia sesión de nuevo.', 401);
    return $claims;
}

/* ── Validaciones ── */
function valid_email(string $e): bool {
    return (bool) filter_var($e, FILTER_VALIDATE_EMAIL);
}
function valid_password(string $p): bool {
    return strlen($p) >= 8 && preg_match('/[A-Za-z]/', $p) && preg_match('/\d/', $p);
}
/** Devuelve el usuario público (sin hash) por id, con sus roles. */
function user_public(int $id): ?array {
    $st = db()->prepare('SELECT id, full_name, email, phone, address, is_active, created_at FROM users WHERE id = ?');
    $st->execute([$id]);
    $u = $st->fetch();
    if (!$u) return null;
    // Roles (defensivo: si aún no se importó el esquema de roles, devuelve []).
    try {
        $rs = db()->prepare('SELECT r.slug FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?');
        $rs->execute([$id]);
        $u['roles'] = array_column($rs->fetchAll(), 'slug');
    } catch (Throwable $e) {
        $u['roles'] = [];
    }
    return $u;
}
