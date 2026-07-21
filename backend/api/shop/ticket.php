<?php
/** GET /backend/api/shop/ticket.php?id=## — sirve el recibo PDF de una compra de tienda (dueño o staff). */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = current_user();
$id   = (int) ($_GET['id'] ?? 0);

$o = ShopOrder::find($id);
if (!$o) fail('Compra no encontrada.', 404);
$isOwner = ((int) $o['user_id'] === (int) $user['id']);
$canView = user_has_permission((int) $user['id'], 'shop.view');
if (!$isOwner && !$canView) fail('No autorizado.', 403);
if (empty($o['ticket_path']) || !is_file($o['ticket_path'])) fail('El recibo aún no está disponible.', 404);

// Servimos el PDF (no es JSON): reemplazamos los headers.
header_remove('Content-Type');
header('Content-Type: application/pdf');
header('Content-Disposition: inline; filename="recibo-' . $o['code'] . '.pdf"');
header('Content-Length: ' . filesize($o['ticket_path']));
header('X-Content-Type-Options: nosniff');
readfile($o['ticket_path']);
exit;
