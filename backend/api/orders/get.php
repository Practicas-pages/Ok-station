<?php
/** GET /backend/api/orders/get.php?id=## — detalle de un pedido (dueño o staff). */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = current_user();
$id   = (int) ($_GET['id'] ?? 0);

$o = Order::find($id);
if (!$o) fail('Pedido no encontrado.', 404);

$isOwner = ((int) $o['user_id'] === (int) $user['id']);
$canView = user_has_permission((int) $user['id'], 'orders.view');
if (!$isOwner && !$canView) fail('No autorizado.', 403);

$o['items'] = Order::items($id);

// Datos del cliente (útil para el panel administrativo).
$cu = User::find((int) $o['user_id']);
if ($cu) {
    $o['client'] = ['name' => $cu['full_name'], 'email' => $cu['email'], 'phone' => $cu['phone']];
}

// Datos financieros: el dueño ve su propio pago; del staff, solo administrador/directivo.
// El 'empleado' que no es dueño conserva el estado operativo del pago, pero sin montos.
$canSeeMoney = $isOwner || user_has_role((int) $user['id'], ['administrador', 'directivo']);
if (!$canSeeMoney) {
    unset($o['payment_provider'], $o['payment_reference'], $o['payment_amount'], $o['payment_transaction_id']);
}

respond(['ok' => true, 'order' => $o]);
