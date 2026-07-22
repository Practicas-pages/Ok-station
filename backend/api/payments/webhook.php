<?php
/**
 * POST /backend/api/payments/webhook.php — confirmación del proveedor de pago.
 *
 * Punto de entrada server-to-server. NO usa la sesión del navegador: la
 * autenticidad se valida con la FIRMA/secreto del proveedor (Payments::verifyWebhook).
 * El estado del pedido se decide aquí, en el servidor; nunca se confía en el cliente.
 *
 * Configurar la URL en el panel del proveedor:
 *   https://okstation.mx/backend/api/payments/webhook.php
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/Payments.php';
only_method('POST');

$raw     = (string) file_get_contents('php://input');
$headers = function_exists('getallheaders') ? (getallheaders() ?: []) : [];
// Fallback de cabeceras (algunas configs no exponen getallheaders en CLI/FPM).
if (!$headers) {
    foreach ($_SERVER as $k => $v) {
        if (strpos($k, 'HTTP_') === 0) {
            $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($k, 5)))));
            $headers[$name] = $v;
        }
    }
}

$event = Payments::verifyWebhook($raw, $headers);
if (!$event) {
    // No revelar detalles: respuesta genérica para firmas inválidas.
    respond(['ok' => false], 400);
}

/* La referencia identifica un pedido o una cita; buscamos en ambas tablas. */
$ref    = (string) $event['order_ref'];
$kind   = 'order';
$entity = Order::findBy('payment_reference', $ref);
if (!$entity) {
    $entity = Appointment::findBy('payment_reference', $ref);
    $kind   = 'appointment';
}
if (!$entity) {
    $entity = ShopOrder::findBy('payment_reference', $ref);   // pedido de la tienda
    $kind   = 'shop';
}
if (!$entity) {
    // 200 para que el proveedor no reintente indefinidamente una referencia inexistente.
    respond(['ok' => true, 'ignored' => 'reference_not_found']);
}

$ok = Payments::finalize(
    (int) $entity['id'],
    (string) $event['status'],
    $event['transaction_id'] ?? null,
    'webhook',
    null,
    $kind,
    // Importe realmente cobrado según el proveedor: finalize() no da por pagado
    // un pedido si no cuadra con lo que se pidió cobrar.
    isset($event['amount']) ? $event['amount'] : null
);

respond(['ok' => (bool) $ok]);
