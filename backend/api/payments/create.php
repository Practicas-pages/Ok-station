<?php
/**
 * POST /backend/api/payments/create.php — inicia el pago de un PEDIDO o el
 * ANTICIPO de una CITA.
 * Body: { order_id }  ó  { appointment_id }
 * Requiere sesión. Solo el dueño de la entidad puede pagarla.
 *
 * SEGURIDAD:
 *  - El monto se toma de la BD (orders.total / appointments.amount_total), jamás del cliente.
 *  - No se reabre algo ya 'pagado' (evita cobros duplicados).
 *  - Se registra el intento en la bitácora (payment_logs).
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Payments.php';
only_method('POST');

$user = current_user();
$b    = body();
$orderId = (int) ($b['order_id'] ?? 0);
$apptId  = (int) ($b['appointment_id'] ?? 0);
/* mode: 'api' (por defecto) = Checkout API (tarjeta en el sitio); 'pro' = Checkout
   Pro (redirección a Mercado Pago). Solo afecta al proveedor mercadopago. */
$mode = (($b['mode'] ?? 'api') === 'pro') ? 'pro' : 'api';

/* ── Resolver la entidad cobrable (pedido o cita) ── */
if ($apptId > 0) {
    $kind   = 'appointment';
    $entity = Appointment::find($apptId);
    $id     = $apptId;
    $noun   = 'cita';
    $auditTable = 'appointments';
    if (!$entity) fail('Cita no encontrada.', 404);
    if ((int) ($entity['user_id'] ?? 0) !== (int) $user['id']) {
        fail('Esta cita no está asociada a tu cuenta. Inicia sesión con la cuenta que la agendó.', 403);
    }
    if (($entity['status'] ?? '') === 'cancelada') fail('Esta cita está cancelada y no se puede pagar.', 409);
    /* Cita "por cotizar" y aún sin precio fijado: no se puede cobrar todavía (espejo
       del guard de pedidos). Se libera cuando el trabajador fija el precio (quoted_at). */
    if (!empty($entity['needs_quote']) && empty($entity['quoted_at'])) {
        fail('Esta cita está en cotización. Te avisaremos por correo cuando tengas el precio final para pagar.', 409);
    }
    if (round((float) ($entity['amount_total'] ?? 0), 2) <= 0) {
        fail('Este trámite se cotiza; el pago se coordina por WhatsApp.', 409);
    }
} elseif ($orderId > 0) {
    $kind   = 'order';
    $entity = Order::find($orderId);
    $id     = $orderId;
    $noun   = 'pedido';
    $auditTable = 'orders';
    if (!$entity) fail('Pedido no encontrado.', 404);
    if ((int) $entity['user_id'] !== (int) $user['id']) fail('No autorizado.', 403);
    if ($entity['status'] === 'cancelado') fail('Este pedido está cancelado y no se puede pagar.', 409);
    /* Pedido "por cotizar" y aún sin precio fijado: no se puede cobrar todavía
       (aunque tenga un total parcial de otros ítems). Se libera cuando la
       trabajadora fija el precio final (quoted_at) desde el panel. */
    if (!empty($entity['needs_quote']) && empty($entity['quoted_at'])) {
        fail('Este pedido está en cotización. Te avisaremos por correo cuando tengas el precio final para pagar.', 409);
    }
    if (round((float) $entity['total'], 2) <= 0) {
        fail('Este pedido aún no tiene un total para cobrar. Te confirmaremos el monto al revisar tus archivos.', 409);
    }
} else {
    fail('No se especificó qué pagar.');
}

if (($entity['payment_status'] ?? 'pendiente') === 'pagado') {
    fail('Este ' . $noun . ' ya está pagado.', 409, ['payment_status' => 'pagado']);
}

/* Anti doble cobro: si ya hay un pago en curso RECIENTE con una transacción real de
   Mercado Pago (Checkout Pro redirigido o tarjeta en 3DS), no abrimos otra intención
   sobre la misma entidad. Tras ~20 min se considera abandonado y se permite reintentar. */
if (Payments::hasRecentInFlight($entity, $kind)) {
    fail('Ya tienes un pago en proceso para este ' . $noun . '. Espera a que se confirme o inténtalo de nuevo en unos minutos.', 409, ['payment_status' => 'procesando']);
}

$amountCol = ($kind === 'appointment') ? 'amount_total' : 'total';

try {
    $session = Payments::createSession($entity, $user, $kind, $mode);
} catch (Throwable $e) {
    Payments::log($id, $entity['payment_status'] ?? null, 'error', Payments::provider(), null, null,
        round((float) $entity[$amountCol], 2), 'cliente', (int) $user['id'], ['msg' => $e->getMessage()], $kind);
    fail('No se pudo iniciar el pago. Inténtalo de nuevo en un momento.', 502);
}

Payments::startIntent($entity, $session, (int) $user['id'], 'cliente', $kind);
log_activity((int) $user['id'], 'payment.start', $auditTable, $id, ['reference' => $session['reference']]);

respond([
    'ok'             => true,
    'checkout_url'   => $session['checkout_url'],
    'reference'      => $session['reference'],
    'provider'       => $session['provider'],
    'mode'           => $session['mode'] ?? 'api',
    'public_key'     => $session['public_key'] ?? null,   // solo Checkout API (mercadopago)
    'payment_status' => 'procesando',
    'amount'         => $session['amount'],
], 201);
