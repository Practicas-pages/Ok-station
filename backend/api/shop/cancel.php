<?php
/** POST /backend/api/shop/cancel.php — cancela una compra propia (solo si aún no se pagó ni preparó). */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

$user = current_user();
$id   = (int) (body()['id'] ?? 0);

$o = ShopOrder::find($id);
if (!$o) fail('Pedido no encontrado.', 404);
if ((int) $o['user_id'] !== (int) $user['id']) fail('No autorizado.', 403);
if (($o['payment_status'] ?? 'pendiente') === 'pagado') {
    fail('Este pedido ya está pagado. Escríbenos por WhatsApp para gestionar una devolución.');
}
if (!in_array($o['status'], ['recibido'], true)) {
    fail('Este pedido ya está en preparación y no se puede cancelar. Escríbenos por WhatsApp.');
}

ShopOrder::update($id, ['status' => 'cancelado']);
log_activity((int) $user['id'], 'shop.cancel', 'shop_orders', $id);

respond(['ok' => true]);
