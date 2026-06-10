<?php
require __DIR__ . '/_bootstrap.php';
only_method('POST');

$claims = require_auth();
$uid    = (int) $claims['sub'];

$b       = body();
$current = (string) ($b['current_password'] ?? '');
$next    = (string) ($b['new_password'] ?? '');
$next2   = (string) ($b['new_password_confirm'] ?? '');

if (!valid_password($next))  fail('La nueva contraseña debe tener mínimo 8 caracteres, con letras y números.');
if ($next !== $next2)        fail('Las contraseñas nuevas no coinciden.');

$st = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
$st->execute([$uid]);
$row = $st->fetch();
if (!$row || !password_verify($current, $row['password_hash'])) {
    fail('La contraseña actual no es correcta.', 403);
}

$hash = password_hash($next, PASSWORD_DEFAULT);
db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $uid]);

respond(['ok' => true, 'message' => 'Contraseña actualizada correctamente.']);
