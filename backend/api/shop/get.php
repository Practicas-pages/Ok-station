<?php
/** GET /backend/api/shop/get.php?id=## — detalle de una compra de tienda.
 *  El dueño ve la suya; el staff con permiso shop.view ve cualquiera. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = current_user();
$id   = (int) ($_GET['id'] ?? 0);

$order = ShopOrder::find($id);
if (!$order) fail('Pedido no encontrado.', 404);

$isOwner = ((int) $order['user_id'] === (int) $user['id']);
$isStaff = user_has_permission((int) $user['id'], 'shop.view');
if (!$isOwner && !$isStaff) fail('No autorizado.', 403);

$order['items'] = ShopOrder::items($id);

/* Solo administrador/directivo (o el dueño) ven importes; a empleado se le ocultan. */
$canSeeMoney = $isOwner || user_has_role((int) $user['id'], ['administrador', 'directivo']);
if (!$canSeeMoney) {
    foreach (['subtotal', 'tax', 'ship_cost', 'total', 'payment_amount'] as $m) { unset($order[$m]); }
    foreach ($order['items'] as &$it) { unset($it['unit_price'], $it['line_total']); }
    unset($it);
}

respond(['ok' => true, 'order' => $order]);
