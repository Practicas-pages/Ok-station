<?php
/**
 * POST /backend/api/admin/shop-order-payment.php — el trabajador confirma (o corrige) el
 * ESTADO DE PAGO de una compra de tienda (efectivo/transferencia o si el webhook no llegó).
 * Body: { id, status }  — status: 'pagado' (por defecto) | 'error'
 * Requiere 'shop.update_status'. Queda auditado en payment_logs (source=admin).
 * Al marcar 'pagado', Payments::finalize envía el correo de confirmación al cliente.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Payments.php';
only_method('POST');

$user   = require_permission('shop.update_status');
$b      = body();
$id     = (int) ($b['id'] ?? 0);
$status = (string) ($b['status'] ?? 'pagado');

if (!in_array($status, ['pagado', 'error'], true)) fail('Estado de pago inválido.');

$o = ShopOrder::find($id);
if (!$o) fail('Pedido no encontrado.', 404);
if (($o['payment_status'] ?? 'pendiente') === 'pagado') {
    respond(['ok' => true, 'payment_status' => 'pagado', 'already' => true]);
}
if ($status === 'pagado' && round((float) ($o['total'] ?? 0), 2) <= 0) {
    fail('Este pedido no tiene un total para registrar como pagado.', 409);
}

$txn = 'ADMIN-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
$ok  = Payments::finalize($id, $status, $txn, 'admin', (int) $user['id'], 'shop');
if (!$ok) fail('No se pudo actualizar el pago.', 500);

log_activity((int) $user['id'], 'shop.payment_set', 'shop_orders', $id, ['status' => $status]);
respond(['ok' => true, 'payment_status' => $status]);
