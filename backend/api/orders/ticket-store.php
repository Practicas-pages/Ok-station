<?php
/** POST /backend/api/orders/ticket-store.php — guarda el ticket PDF (generado en el cliente) y lo asocia al pedido. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Storage.php';
only_method('POST');

$user = current_user();
$b    = body();
$id   = (int) ($b['order_id'] ?? 0);
$data = (string) ($b['pdf_base64'] ?? '');

$o = Order::find($id);
if (!$o) fail('Pedido no encontrado.', 404);
if ((int) $o['user_id'] !== (int) $user['id']) fail('No autorizado.', 403);

// Acepta "data:application/pdf;base64,...." o base64 puro
if (strpos($data, ',') !== false) $data = substr($data, strpos($data, ',') + 1);
$bytes = base64_decode($data, true);
if ($bytes === false || strlen($bytes) < 100) fail('Ticket inválido.');

$path = Storage::put('tickets', $o['code'] . '.pdf', $bytes);
Order::update($id, ['ticket_path' => $path]);
log_activity((int) $user['id'], 'order.ticket', 'orders', $id);

// Envía el comprobante PDF por correo al cliente (best-effort: nunca rompe la petición).
try {
    require_once __DIR__ . '/../lib/Mailer.php';
    $email = (string) ($user['email'] ?? '');
    if ($email !== '') {
        $bodyTxt = 'Hola ' . ($user['full_name'] ?? '') . ",\n\n" .
            'Adjuntamos el comprobante de tu pedido ' . $o['code'] . ".\n" .
            "Guárdalo y muéstralo al recoger. Te avisaremos por correo cuando tu pedido cambie de estado.\n\n" .
            "Gracias,\nOK.station — Centro Comercial Otay, Tijuana";
        (new Mailer($CONFIG['smtp'] ?? []))->send(
            $email, 'Tu comprobante OK.station — ' . $o['code'], $bodyTxt,
            [['name' => 'ticket-' . $o['code'] . '.pdf', 'type' => 'application/pdf', 'data' => $bytes]]
        );
    }
} catch (Throwable $e) { /* el correo no debe afectar la respuesta */ }

respond(['ok' => true, 'ticket_url' => 'orders/ticket.php?id=' . $id]);
