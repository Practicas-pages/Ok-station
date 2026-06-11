<?php
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/lib/RateLimit.php';
only_method('POST');

$b     = body();
$email = strtolower(field($b, 'email'));
$pass  = (string) ($b['password'] ?? '');

if (!valid_email($email) || $pass === '') fail('Correo o contraseña incorrectos.', 401);

$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
RateLimit::guard($ip, $email);   // bloquea tras varios intentos fallidos

$st = db()->prepare('SELECT id, full_name, email, password_hash FROM users WHERE email = ?');
$st->execute([$email]);
$u = $st->fetch();

// Mensaje genérico (no revela si el correo existe).
if (!$u || !password_verify($pass, $u['password_hash'])) {
    RateLimit::hit($ip, $email);
    fail('Correo o contraseña incorrectos.', 401);
}

RateLimit::reset($ip, $email);   // login correcto → limpia contador

$token = jwt_make(['sub' => (int) $u['id'], 'email' => $u['email'], 'name' => $u['full_name']]);

respond([
    'ok'    => true,
    'token' => $token,
    'user'  => user_public((int) $u['id']),
]);
