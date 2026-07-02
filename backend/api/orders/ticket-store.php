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
// Debe ser un PDF real (cabecera %PDF-) y de tamaño razonable; así no se guarda
// contenido arbitrario que luego ticket.php sirve como application/pdf.
if ($bytes === false || strlen($bytes) < 100 || substr($bytes, 0, 5) !== '%PDF-') fail('Ticket inválido.');
if (strlen($bytes) > 5 * 1024 * 1024) fail('Ticket demasiado grande.');

$path = Storage::put('tickets', $o['code'] . '.pdf', $bytes);
Order::update($id, ['ticket_path' => $path]);
log_activity((int) $user['id'], 'order.ticket', 'orders', $id);

/* Correo al cliente con el COMPROBANTE PDF adjunto (best-effort, vía Brevo si
   está configurado; si no, no se adjunta). No rompe la respuesta si falla. */
if (!empty($user['email'])) {
    try {
        require_once __DIR__ . '/../lib/Mail.php';
        require_once __DIR__ . '/../lib/Emails.php';
        $code = (string) $o['code'];
        $html = Emails::comprobanteHtml('pedido', $code, (string) ($user['full_name'] ?? ''));
        Mail::sendHtml(
            $user['email'],
            'Tu comprobante de pedido ' . $code . ' · OK.station',
            $html,
            'Adjuntamos el comprobante (PDF) de tu pedido ' . $code . ' en OK.station.',
            [['name' => 'comprobante-' . $code . '.pdf', 'content' => base64_encode($bytes)]]
        );
    } catch (Throwable $e) { /* correo best-effort */ }
}

respond(['ok' => true, 'ticket_url' => 'orders/ticket.php?id=' . $id]);
