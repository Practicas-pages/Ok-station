<?php
require __DIR__ . '/_bootstrap.php';
only_method('POST');

$b     = body();
$token = field($b, 'token');
$next  = (string) ($b['new_password'] ?? '');
$next2 = (string) ($b['new_password_confirm'] ?? '');

if ($token === '')           fail('Enlace inválido.');
if (!valid_password($next))  fail('La contraseña debe tener mínimo 8 caracteres, con letras y números.');
if ($next !== $next2)        fail('Las contraseñas no coinciden.');

$tokenHash = hash('sha256', $token);
$pdo = db();

$st = $pdo->prepare(
    'SELECT id, user_id FROM password_resets
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1'
);
$st->execute([$tokenHash]);
$row = $st->fetch();
if (!$row) fail('El enlace es inválido o ya expiró. Solicita uno nuevo.', 400);

$hash = password_hash($next, PASSWORD_DEFAULT);
$pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, (int) $row['user_id']]);
$pdo->prepare('UPDATE password_resets SET used_at = NOW() WHERE id = ?')->execute([(int) $row['id']]);

respond(['ok' => true, 'message' => 'Tu contraseña fue restablecida. Ya puedes iniciar sesión.']);
