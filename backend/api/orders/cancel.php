<?php
/** POST /backend/api/orders/cancel.php — cancela un pedido propio (si aún es cancelable). */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

$user = current_user();
$id   = (int) (body()['id'] ?? 0);

$o = Order::find($id);
if (!$o) fail('Pedido no encontrado.', 404);
if ((int) $o['user_id'] !== (int) $user['id']) fail('No autorizado.', 403);
if (!in_array($o['status'], ['recibido', 'en_revision'], true)) {
    fail('Este pedido ya entró a producción y no se puede cancelar. Escríbenos por WhatsApp.');
}

Order::update($id, ['status' => 'cancelado']);
log_activity((int) $user['id'], 'order.cancel', 'orders', $id);

respond(['ok' => true]);
