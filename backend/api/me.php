<?php
require __DIR__ . '/_bootstrap.php';

$claims = require_auth();
$uid    = (int) $claims['sub'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $u = user_public($uid);
    if (!$u) fail('Usuario no encontrado.', 404);
    respond(['ok' => true, 'user' => $u]);
}

if ($method === 'PUT') {
    $b       = body();
    $name    = field($b, 'full_name');
    $phone   = field($b, 'phone');
    $address = field($b, 'address');

    if ($name === '' || mb_strlen($name) < 3) fail('Ingresa tu nombre completo.');
    if ($phone === '')                        fail('Ingresa tu teléfono.');

    $st = db()->prepare('UPDATE users SET full_name = ?, phone = ?, address = ? WHERE id = ?');
    $st->execute([$name, $phone, $address !== '' ? $address : null, $uid]);

    respond(['ok' => true, 'user' => user_public($uid)]);
}

fail('Método no permitido.', 405);
