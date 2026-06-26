<?php
/**
 * GET /backend/api/payments/status.php?order_id=##       — estado del pago de un pedido.
 * GET /backend/api/payments/status.php?appointment_id=##  — estado del anticipo de una cita.
 * Lo usa el cliente para refrescar tras volver del checkout (auto-actualización).
 * El dueño ve su propio pago; el staff con el permiso de vista correspondiente lo consulta.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user    = current_user();
$orderId = (int) ($_GET['order_id'] ?? 0);
$apptId  = (int) ($_GET['appointment_id'] ?? 0);

if ($apptId > 0) {
    $row = Appointment::find($apptId);
    if (!$row) fail('Cita no encontrada.', 404);
    $isOwner = ((int) ($row['user_id'] ?? 0) === (int) $user['id']);
    if (!$isOwner && !user_has_permission((int) $user['id'], 'appointments.view')) fail('No autorizado.', 403);
    respond([
        'ok'                     => true,
        'kind'                   => 'appointment',
        'appointment_id'         => (int) $row['id'],
        'code'                   => $row['code'],
        'payment_status'         => $row['payment_status'] ?? 'pendiente',
        'payment_provider'       => $row['payment_provider'] ?? null,
        'payment_reference'      => $row['payment_reference'] ?? null,
        'payment_amount'         => $row['payment_amount'] ?? null,
        'payment_date'           => $row['payment_date'] ?? null,
        'payment_transaction_id' => $row['payment_transaction_id'] ?? null,
        'total'                  => $row['amount_total'] ?? null,
    ]);
}

if ($orderId <= 0) fail('No se especificó qué consultar.');

$order = Order::find($orderId);
if (!$order) fail('Pedido no encontrado.', 404);

$isOwner = ((int) $order['user_id'] === (int) $user['id']);
if (!$isOwner && !user_has_permission((int) $user['id'], 'orders.view')) fail('No autorizado.', 403);

respond([
    'ok'                     => true,
    'kind'                   => 'order',
    'order_id'               => (int) $order['id'],
    'payment_status'         => $order['payment_status'] ?? 'pendiente',
    'payment_provider'       => $order['payment_provider'],
    'payment_reference'      => $order['payment_reference'],
    'payment_amount'         => $order['payment_amount'],
    'payment_date'           => $order['payment_date'],
    'payment_transaction_id' => $order['payment_transaction_id'],
    'total'                  => $order['total'],
]);
