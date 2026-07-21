<?php
/** POST /backend/api/shop/stock-alert.php — "Avísame por correo cuando llegue".
 *  Requiere sesión (así sabemos a quién avisar y evitamos spam de anónimos).
 *  Body: { product_id, email? }  ·  email vacío = el de la cuenta.
 *  El aviso lo manda el sync de Exel cuando el producto recupera existencia
 *  (backend/tools/exel-sync.php); aquí solo se registra la suscripción.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

$user = current_user();
$b    = body();
$pid  = (int) ($b['product_id'] ?? 0);
if ($pid <= 0) fail('Falta el producto.');

$email = strtolower(trim((string) ($b['email'] ?? '')));
if ($email === '') $email = strtolower(trim((string) ($user['email'] ?? '')));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Escribe un correo válido.');
if (mb_strlen($email) > 190) fail('El correo es demasiado largo.');

$st = db()->prepare('SELECT id, name, stock FROM products WHERE id = ? LIMIT 1');
$st->execute([$pid]);
$p = $st->fetch();
if (!$p) fail('Producto no encontrado.', 404);
if ((int) $p['stock'] > 0) {
    respond(['ok' => true, 'already_in_stock' => true,
             'message' => '¡Buenas noticias! Este producto ya está disponible.']);
}

/* UPSERT: si ya estaba suscrito, se reactiva (notified_at = NULL) por si el aviso
   anterior ya se mandó y el producto se volvió a agotar. */
db()->prepare('INSERT INTO stock_alerts (product_id, user_id, email)
               VALUES (?,?,?)
               ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), notified_at = NULL')
    ->execute([$pid, (int) $user['id'], $email]);

respond(['ok' => true, 'message' => 'Listo: te avisamos a ' . $email . ' en cuanto llegue.']);
