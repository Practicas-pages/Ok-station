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

/* Devolver las existencias al catálogo. shop/create.php las descuenta al crear la
   compra, así que cancelarla sin devolverlas iría dejando productos "agotados" que
   en realidad sí hay. El sync nocturno lo corregiría, pero mientras tanto se dejan
   de vender cosas que están disponibles.

   Se hace ANTES de marcar cancelado y en una transacción con el cambio de estado:
   si algo falla, no queda ni el stock devuelto sin cancelar ni al revés. Las
   comprobaciones de arriba garantizan que sólo se llega aquí una vez por compra
   (después queda en 'cancelado' y ya no pasa el filtro de estado). */
$pdo = db();
$pdo->beginTransaction();
try {
    $dev = $pdo->prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
    foreach (ShopOrder::items($id) as $it) {
        $pid = (int) ($it['product_id'] ?? 0);
        $qty = (int) ($it['qty'] ?? 0);
        if ($pid > 0 && $qty > 0) $dev->execute([$qty, $pid]);
    }
    ShopOrder::update($id, ['status' => 'cancelado']);
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('[shop.cancel] ' . $e->getMessage());
    fail('No se pudo cancelar el pedido. Inténtalo de nuevo.', 500);
}

log_activity((int) $user['id'], 'shop.cancel', 'shop_orders', $id);

respond(['ok' => true]);
