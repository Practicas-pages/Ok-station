<?php
/**
 * POST /backend/api/payments/process.php — Checkout API (cobro con tarjeta tokenizada).
 *
 * El navegador tokeniza la tarjeta contra Mercado Pago (el Brick de MP): los datos
 * de la tarjeta NUNCA llegan a nuestro servidor, solo un TOKEN de un solo uso.
 * Aquí creamos el pago con el Access Token de servidor y dejamos que el webhook lo
 * confirme de forma definitiva.
 *
 * Body: { order_id | appointment_id, reference, token, payment_method_id,
 *         issuer_id?, installments?, payer_email? }
 *
 * SEGURIDAD:
 *  - El monto se toma de la BD (orders.total / appointments.amount_total), jamás del cliente.
 *  - Solo el dueño de la entidad puede pagarla.
 *  - La referencia debe coincidir con la intención abierta (payments/create.php).
 *  - Idempotencia en Payments::mpCreatePayment (referencia + token) evita doble cargo.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Payments.php';
require __DIR__ . '/../lib/RateLimit.php';
only_method('POST');

if (Payments::provider() !== 'mercadopago') fail('El pago con tarjeta no está disponible.', 403);

$user = current_user();
$b    = body();

/* Anti "card testing": limita los intentos de cobro por (IP + usuario). Tras varios
   rechazos seguidos se bloquea unos minutos, evitando que se use el checkout para
   validar tarjetas robadas. Un pago aprobado/pendiente limpia el contador. */
$ip    = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$rlKey = 'pay:' . (int) $user['id'];
RateLimit::guard($ip, $rlKey);

$orderId      = (int) ($b['order_id'] ?? 0);
$apptId       = (int) ($b['appointment_id'] ?? 0);
$reference    = trim((string) ($b['reference'] ?? ''));
$token        = preg_replace('/[^a-zA-Z0-9]/', '', (string) ($b['token'] ?? ''));
$pmId         = preg_replace('/[^a-zA-Z0-9_\-]/', '', (string) ($b['payment_method_id'] ?? ''));
$issuer       = preg_replace('/[^a-zA-Z0-9]/', '', (string) ($b['issuer_id'] ?? ''));
$installments = max(1, (int) ($b['installments'] ?? 1));
$payerEmail   = trim((string) ($b['payer_email'] ?? ''));

if ($token === '')     fail('Falta el token de la tarjeta.');
if ($pmId === '')      fail('Falta el método de pago.');
if ($reference === '') fail('Falta la referencia del pago.');

/* ── Resolver la entidad cobrable (pedido o cita) ── */
if ($apptId > 0) {
    $kind = 'appointment'; $noun = 'cita';
    $entity = Appointment::find($apptId);
    if (!$entity) fail('Cita no encontrada.', 404);
    if ((int) ($entity['user_id'] ?? 0) !== (int) $user['id']) fail('No autorizado.', 403);
    if (($entity['status'] ?? '') === 'cancelada') fail('Esta cita está cancelada y no se puede pagar.', 409);
    $amount = round((float) ($entity['amount_total'] ?? 0), 2);
} elseif ($orderId > 0) {
    $kind = 'order'; $noun = 'pedido';
    $entity = Order::find($orderId);
    if (!$entity) fail('Pedido no encontrado.', 404);
    if ((int) $entity['user_id'] !== (int) $user['id']) fail('No autorizado.', 403);
    if (($entity['status'] ?? '') === 'cancelado') fail('Este pedido está cancelado y no se puede pagar.', 409);
    if (!empty($entity['needs_quote']) && empty($entity['quoted_at'])) {
        fail('Este pedido está en cotización. Te avisaremos por correo cuando tengas el precio final.', 409);
    }
    $amount = round((float) $entity['total'], 2);
} else {
    fail('No se especificó qué pagar.');
}

if (($entity['payment_status'] ?? 'pendiente') === 'pagado') {
    respond(['ok' => true, 'payment_status' => 'pagado', 'message' => 'Este ' . $noun . ' ya está pagado.']);
}
if ($amount <= 0) fail('Este ' . $noun . ' no tiene un monto para cobrar.', 409);

/* La referencia debe coincidir con la intención abierta por payments/create.php. */
if (!hash_equals((string) ($entity['payment_reference'] ?? ''), $reference)) {
    fail('La sesión de pago expiró. Recarga la página e inténtalo de nuevo.', 409);
}

/* Email del pagador: si el Brick no lo mandó, usamos el del cliente en sesión. */
if ($payerEmail === '') $payerEmail = (string) ($user['email'] ?? '');

try {
    $pay = Payments::chargeCard($entity, $amount, $reference, [
        'token'             => $token,
        'payment_method_id' => $pmId,
        'issuer_id'         => $issuer,
        'installments'      => $installments,
        'payer_email'       => $payerEmail,
    ], $kind);
} catch (Throwable $e) {
    Payments::log((int) $entity['id'], $entity['payment_status'] ?? null, 'error', 'mercadopago', $reference, null,
        $amount, 'cliente', (int) $user['id'], ['msg' => $e->getMessage()], $kind);
    fail('No se pudo procesar el pago. Verifica los datos de tu tarjeta e inténtalo de nuevo.', 502);
}

$status = Payments::mpMapStatus($pay['status']);
Payments::finalize((int) $entity['id'], $status, $pay['id'] ?: null, 'cliente', (int) $user['id'], $kind);

/* Un rechazo cuenta como intento fallido (anti card-testing); aprobado/pendiente limpia. */
if ($status === 'error') { RateLimit::hit($ip, $rlKey); }
else                     { RateLimit::reset($ip, $rlKey); }

log_activity((int) $user['id'], 'payment.process', ($kind === 'appointment' ? 'appointments' : 'orders'),
    (int) $entity['id'], ['status' => $status, 'reference' => $reference]);

$messages = [
    'pagado'      => '¡Pago aprobado! Gracias por tu compra.',
    'procesando'  => 'Tu pago quedó en revisión. Te avisaremos en cuanto se confirme.',
    'error'       => 'Tu pago fue rechazado. Prueba con otra tarjeta o método de pago.',
    'reembolsado' => 'El pago fue reembolsado.',
];

respond([
    'ok'             => $status !== 'error',
    'payment_status' => $status,
    'status_detail'  => $pay['status_detail'],
    'message'        => $messages[$status] ?? 'Estado del pago actualizado.',
]);
