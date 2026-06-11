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
$canView = in_array('orders.view', User::permissions((int) $user['id']), true);
if (!$isOwner && !$canView) fail('No autorizado.', 403);

$o['items'] = Order::items($id);
respond(['ok' => true, 'order' => $o]);
