<?php
/**
 * POST /backend/api/payments/create.php — inicia el pago de un pedido.
 * Body: { order_id }
 * Requiere sesión. Solo el dueño del pedido puede pagarlo.
 *
 * SEGURIDAD:
 *  - El monto se toma de `orders.total` en la BD (jamás del cliente).
 *  - No se reabre un pedido ya 'pagado' (evita cobros duplicados).
 *  - Se registra el intento en la bitácora (payment_logs).
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Payments.php';
only_method('POST');

$user    = current_user();
$b       = body();
$orderId = (int) ($b['order_id'] ?? 0);
if ($orderId <= 0) fail('Pedido no especificado.');

$order = Order::find($orderId);
if (!$order) fail('Pedido no encontrado.', 404);
if ((int) $order['user_id'] !== (int) $user['id']) fail('No autorizado.', 403);

if ($order['status'] === 'cancelado') fail('Este pedido está cancelado y no se puede pagar.', 409);
if (($order['payment_status'] ?? 'pendiente') === 'pagado') {
    fail('Este pedido ya está pagado.', 409, ['payment_status' => 'pagado']);
}
if (round((float) $order['total'], 2) <= 0) {
    fail('Este pedido aún no tiene un total para cobrar. Te confirmaremos el monto al revisar tus archivos.', 409);
}

try {
    $session = Payments::createSession($order, $user);
} catch (Throwable $e) {
    Payments::log($orderId, $order['payment_status'] ?? null, 'error', Payments::provider(), null, null,
        round((float) $order['total'], 2), 'cliente', (int) $user['id'], ['msg' => $e->getMessage()]);
    fail('No se pudo iniciar el pago. Inténtalo de nuevo en un momento.', 502);
}

Payments::startIntent($order, $session, (int) $user['id'], 'cliente');
log_activity((int) $user['id'], 'payment.start', 'orders', $orderId, ['reference' => $session['reference']]);

respond([
    'ok'             => true,
    'checkout_url'   => $session['checkout_url'],
    'reference'      => $session['reference'],
    'provider'       => $session['provider'],
    'payment_status' => 'procesando',
    'amount'         => $session['amount'],
], 201);
