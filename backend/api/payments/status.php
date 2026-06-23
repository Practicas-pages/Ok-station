<?php
/**
 * GET /backend/api/payments/status.php?order_id=## — estado del pago de un pedido.
 * Lo usa el cliente para refrescar tras volver del checkout (auto-actualización).
 * El dueño ve su propio pago; el staff con 'orders.view' puede consultarlo.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user    = current_user();
$orderId = (int) ($_GET['order_id'] ?? 0);
if ($orderId <= 0) fail('Pedido no especificado.');

$order = Order::find($orderId);
if (!$order) fail('Pedido no encontrado.', 404);

$isOwner = ((int) $order['user_id'] === (int) $user['id']);
if (!$isOwner && !user_has_permission((int) $user['id'], 'orders.view')) fail('No autorizado.', 403);

respond([
    'ok'                     => true,
    'order_id'               => (int) $order['id'],
    'payment_status'         => $order['payment_status'] ?? 'pendiente',
    'payment_provider'       => $order['payment_provider'],
    'payment_reference'      => $order['payment_reference'],
    'payment_amount'         => $order['payment_amount'],
    'payment_date'           => $order['payment_date'],
    'payment_transaction_id' => $order['payment_transaction_id'],
    'total'                  => $order['total'],
]);
