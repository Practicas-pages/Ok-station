<?php
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/lib/authz.php';
only_method('POST');

$b        = body();
$name     = field($b, 'full_name');
$email    = strtolower(field($b, 'email'));
$pass     = (string) ($b['password'] ?? '');
$pass2    = (string) ($b['password_confirm'] ?? '');
$phone    = field($b, 'phone');
$address  = field($b, 'address');

if ($name === '' || mb_strlen($name) < 3)   fail('Ingresa tu nombre completo.');
if (!valid_email($email))                    fail('El correo electrónico no es válido.');
if (!valid_password($pass))                  fail('La contraseña debe tener mínimo 8 caracteres, con letras y números.');
if ($pass !== $pass2)                        fail('Las contraseñas no coinciden.');
if ($phone === '')                           fail('Ingresa tu teléfono.');

$pdo = db();
$st  = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$st->execute([$email]);
if ($st->fetch()) fail('Ese correo ya está registrado.', 409);

$hash = password_hash($pass, PASSWORD_DEFAULT);
$st   = $pdo->prepare('INSERT INTO users (full_name, email, password_hash, phone, address) VALUES (?,?,?,?,?)');
$st->execute([$name, $email, $hash, $phone, $address !== '' ? $address : null]);

$uid = (int) $pdo->lastInsertId();

// Asigna rol 'cliente' (y 'administrador' si el correo está en ADMIN_EMAILS del .env).
ensure_roles_for_new_user($uid, $email);
log_activity($uid, 'auth.register', 'users', $uid);

$token = jwt_make(['sub' => $uid, 'email' => $email, 'name' => $name]);

respond([
    'ok'    => true,
    'token' => $token,
    'user'  => user_public($uid),
], 201);
