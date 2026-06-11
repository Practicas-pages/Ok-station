<?php
/** GET /backend/api/orders/ticket.php?id=## — sirve el ticket PDF del pedido (dueño o staff). */
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
if (empty($o['ticket_path']) || !is_file($o['ticket_path'])) fail('El ticket aún no está disponible.', 404);

// Servimos el PDF (no es JSON): reemplazamos los headers.
header_remove('Content-Type');
header('Content-Type: application/pdf');
header('Content-Disposition: inline; filename="ticket-' . $o['code'] . '.pdf"');
header('Content-Length: ' . filesize($o['ticket_path']));
readfile($o['ticket_path']);
exit;
