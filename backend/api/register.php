<?php
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/lib/authz.php';
require __DIR__ . '/lib/RateLimit.php';
only_method('POST');

/* Límite por IP: máx. 5 cuentas nuevas cada 15 min desde una misma dirección.
   Frena a un bot que crea cuentas en masa (cada intento usa un correo distinto, así
   que se limita por IP, no por correo). '@register' es un "bucket" propio para no
   chocar con el contador de login del mismo IP. */
$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
RateLimit::guard($ip, '@register');

$b        = body();
$name     = field($b, 'full_name');
$email    = strtolower(field($b, 'email'));
$pass     = (string) ($b['password'] ?? '');
$pass2    = (string) ($b['password_confirm'] ?? '');
$phone    = field($b, 'phone');
$address  = field($b, 'address');

if ($name === '' || mb_strlen($name) < 3)   fail('Ingresa tu nombre completo.');
if (!valid_email($email))                    fail('El correo electrónico no es válido.');
if (!valid_password($pass))                  fail('La contraseña debe tener entre 8 y 64 caracteres y no ser una contraseña común (como "12345678" o "password").');
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

RateLimit::hit($ip, '@register');   // cuenta esta cuenta creada contra el límite del IP

// Asigna rol 'cliente' (y 'administrador' si el correo está en ADMIN_EMAILS del .env).
ensure_roles_for_new_user($uid, $email);
log_activity($uid, 'auth.register', 'users', $uid);

$token = jwt_make(['sub' => $uid, 'email' => $email, 'name' => $name]);

respond([
    'ok'    => true,
    'token' => $token,
    'user'  => user_public($uid),
], 201);
