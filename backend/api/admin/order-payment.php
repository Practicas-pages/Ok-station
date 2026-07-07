<?php
/**
 * POST /backend/api/admin/order-payment.php — el trabajador confirma (o corrige) el
 * ESTADO DE PAGO de un pedido: pago en efectivo/transferencia, o cuando el webhook de
 * Mercado Pago no llegó y el pago ya está aprobado en el panel de MP.
 *
 * Body: { id, status }  — status: 'pagado' (por defecto) | 'error' (no pagó / rechazado)
 * Requiere el permiso 'orders.update_status'. Queda auditado en payment_logs (source=admin).
 *
 * Al marcar 'pagado', Payments::finalize envía el correo de confirmación al cliente
 * (canal principal de aviso) y la notificación in-app. Es idempotente.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Payments.php';
only_method('POST');

$user   = require_permission('orders.update_status');
$b      = body();
$id     = (int) ($b['id'] ?? 0);
$status = (string) ($b['status'] ?? 'pagado');

if (!in_array($status, ['pagado', 'error'], true))        fail('Estado de pago inválido.');
if (!table_has_column('orders', 'payment_status'))        fail('El cobro en línea no está habilitado.', 409);

$o = Order::find($id);
if (!$o) fail('Pedido no encontrado.', 404);
if (($o['payment_status'] ?? 'pendiente') === 'pagado') {
    // Ya está pagado: no se revierte desde aquí (evita deshacer un cobro por error).
    respond(['ok' => true, 'payment_status' => 'pagado', 'already' => true]);
}
if ($status === 'pagado' && round((float) ($o['total'] ?? 0), 2) <= 0) {
    fail('Este pedido no tiene un total para registrar como pagado. Fija el precio primero.', 409);
}

$txn = 'ADMIN-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
$ok  = Payments::finalize($id, $status, $txn, 'admin', (int) $user['id'], 'order');
if (!$ok) fail('No se pudo actualizar el pago.', 500);

log_activity((int) $user['id'], 'payment.admin_set', 'orders', $id, ['status' => $status]);
respond(['ok' => true, 'payment_status' => $status]);
