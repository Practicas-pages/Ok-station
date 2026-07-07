<?php
/**
 * POST /backend/api/admin/appointment-payment.php — el trabajador confirma (o corrige)
 * el ESTADO DE PAGO de una cita (pago en efectivo/transferencia, o cuando el webhook de
 * Mercado Pago no llegó y el pago ya está aprobado en el panel de MP).
 *
 * Body: { id, status }  — status: 'pagado' (por defecto) | 'error'
 * Requiere el permiso 'appointments.update_status'. Auditado en payment_logs (source=admin).
 * Espejo de admin/order-payment.php. Al marcar 'pagado' se envía el correo al cliente.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Payments.php';
only_method('POST');

$user   = require_permission('appointments.update_status');
$b      = body();
$id     = (int) ($b['id'] ?? 0);
$status = (string) ($b['status'] ?? 'pagado');

if (!in_array($status, ['pagado', 'error'], true))            fail('Estado de pago inválido.');
if (!table_has_column('appointments', 'payment_status'))      fail('El cobro en línea no está habilitado.', 409);

$a = Appointment::find($id);
if (!$a) fail('Cita no encontrada.', 404);
if (($a['payment_status'] ?? 'pendiente') === 'pagado') {
    respond(['ok' => true, 'payment_status' => 'pagado', 'already' => true]);
}
if ($status === 'pagado' && round((float) ($a['amount_total'] ?? 0), 2) <= 0) {
    fail('Esta cita no tiene un monto para registrar como pagado. Fija el precio primero.', 409);
}

$txn = 'ADMIN-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
$ok  = Payments::finalize($id, $status, $txn, 'admin', (int) $user['id'], 'appointment');
if (!$ok) fail('No se pudo actualizar el pago.', 500);

log_activity((int) $user['id'], 'payment.admin_set', 'appointments', $id, ['status' => $status]);
respond(['ok' => true, 'payment_status' => $status]);
