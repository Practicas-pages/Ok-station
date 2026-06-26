<?php
/**
 * POST /backend/api/payments/sandbox-confirm.php — confirma un pago en modo SANDBOX.
 * Body: { reference, result? }   result: 'pagado' (por defecto) | 'error'
 *
 * SOLO disponible cuando PAYMENT_PROVIDER=sandbox (demo/desarrollo). En producción
 * con una pasarela real, la confirmación llega por webhook firmado y este endpoint
 * queda deshabilitado. Aun así exige sesión y propiedad del pedido.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Payments.php';
only_method('POST');

if (!Payments::isSandbox()) fail('Confirmación no disponible para este proveedor.', 403);

$user = current_user();
$b    = body();
$ref  = trim((string) ($b['reference'] ?? ''));
$res  = ($b['result'] ?? 'pagado') === 'error' ? 'error' : 'pagado';
if ($ref === '') fail('Referencia no especificada.');

/* La referencia es única; puede pertenecer a un pedido o a una cita. Buscamos en ambos. */
$kind   = 'order';
$entity = Order::findBy('payment_reference', $ref);
if (!$entity) {
    $entity = Appointment::findBy('payment_reference', $ref);
    $kind   = 'appointment';
}
if (!$entity) fail('Pago no encontrado.', 404);
if ((int) ($entity['user_id'] ?? 0) !== (int) $user['id']) fail('No autorizado.', 403);

$ok = Payments::finalize((int) $entity['id'], $res, 'SBX-' . substr(bin2hex(random_bytes(6)), 0, 12), 'cliente', (int) $user['id'], $kind);
if (!$ok) fail('No se pudo confirmar el pago.', 500);

log_activity((int) $user['id'], 'payment.sandbox_confirm', ($kind === 'appointment' ? 'appointments' : 'orders'), (int) $entity['id'], ['result' => $res]);
respond(['ok' => true, 'payment_status' => $res, 'kind' => $kind, 'id' => (int) $entity['id']]);
