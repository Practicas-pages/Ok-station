<?php
require __DIR__ . '/_bootstrap.php';
only_method('POST');

$b     = body();
$email = strtolower(field($b, 'email'));

// Respuesta SIEMPRE genérica para no filtrar qué correos existen.
$generic = ['ok' => true, 'message' => 'Si el correo está registrado, te enviaremos un enlace para restablecer tu contraseña.'];

if (!valid_email($email)) respond($generic);

$st = db()->prepare('SELECT id FROM users WHERE email = ?');
$st->execute([$email]);
$u = $st->fetch();

if ($u) {
    $token     = bin2hex(random_bytes(32));            // token en claro (va al usuario)
    $tokenHash = hash('sha256', $token);               // guardamos solo el hash
    $expires   = date('Y-m-d H:i:s', time() + 3600);   // 1 hora

    db()->prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?,?)')
        ->execute([(int) $u['id'], $tokenHash, $expires]);

    $link = rtrim($CONFIG['app_url'], '/') . '/restablecer.html?token=' . $token;

    // Intento de envío por correo (CloudPanel: configura SMTP o usa PHPMailer).
    @mail(
        $email,
        'Restablece tu contraseña — OK.station',
        "Hola,\n\nPara restablecer tu contraseña entra aquí (válido 1 hora):\n$link\n\nSi no lo solicitaste, ignora este mensaje.\n\nOK.station",
        "From: no-reply@okstation.mx\r\nContent-Type: text/plain; charset=utf-8"
    );

    // En desarrollo devolvemos el enlace para poder probar sin correo configurado.
    if (!empty($CONFIG['dev_mode'])) {
        $generic['dev_reset_link'] = $link;
    }
}

respond($generic);
