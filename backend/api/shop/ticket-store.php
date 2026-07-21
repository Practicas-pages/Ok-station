<?php
/** POST /backend/api/shop/ticket-store.php — guarda el recibo PDF de una compra
 *  de la TIENDA (generado en el cliente tras el pago exitoso) y lo envía por
 *  correo al cliente como adjunto. Espejo de orders/ticket-store.php.
 *  Body: { shop_order_id, pdf_base64 }
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Storage.php';
only_method('POST');

$user = current_user();
$b    = body();
$id   = (int) ($b['shop_order_id'] ?? 0);
$data = (string) ($b['pdf_base64'] ?? '');

$o = ShopOrder::find($id);
if (!$o) fail('Compra no encontrada.', 404);
if ((int) $o['user_id'] !== (int) $user['id']) fail('No autorizado.', 403);
/* El recibo es un comprobante de PAGO: solo existe cuando el pago ya se confirmó
   en el servidor. Así nadie puede fabricarse un "recibo pagado" de una compra
   pendiente mandando un PDF por su cuenta. */
if (($o['payment_status'] ?? '') !== 'pagado') fail('El recibo se genera cuando el pago está confirmado.', 409);
if (!table_has_column('shop_orders', 'ticket_path')) fail('Recibos no disponibles todavía (falta aplicar la migración 0033).', 503);

// Acepta "data:application/pdf;base64,...." o base64 puro
if (strpos($data, ',') !== false) $data = substr($data, strpos($data, ',') + 1);
$bytes = base64_decode($data, true);
// Debe ser un PDF real (cabecera %PDF-) y de tamaño razonable; así no se guarda
// contenido arbitrario que luego ticket.php sirve como application/pdf.
if ($bytes === false || strlen($bytes) < 100 || substr($bytes, 0, 5) !== '%PDF-') fail('Recibo inválido.');
if (strlen($bytes) > 5 * 1024 * 1024) fail('Recibo demasiado grande.');

/* Si ya había recibo guardado, esto lo reemplaza (regeneración) pero NO re-envía
   el correo: el cliente ya lo recibió la primera vez. */
$yaTenia = !empty($o['ticket_path']);

$path = Storage::put('tickets', $o['code'] . '.pdf', $bytes);
ShopOrder::update($id, ['ticket_path' => $path]);
log_activity((int) $user['id'], 'shop.ticket', 'shop_orders', $id);

/* Correo al cliente con el RECIBO PDF adjunto (best-effort, vía Brevo si está
   configurado; si no, no se adjunta). No rompe la respuesta si falla. */
if (!$yaTenia && !empty($user['email'])) {
    try {
        require_once __DIR__ . '/../lib/Mail.php';
        require_once __DIR__ . '/../lib/Emails.php';
        $code = (string) $o['code'];
        $html = Emails::comprobanteHtml('compra', $code, (string) ($user['full_name'] ?? ''));
        Mail::sendHtml(
            $user['email'],
            'Tu recibo de compra ' . $code . ' · Ok.station',
            $html,
            'Adjuntamos el recibo (PDF) de tu compra ' . $code . ' en Ok.station.',
            [['name' => 'recibo-' . $code . '.pdf', 'content' => base64_encode($bytes)]]
        );
    } catch (Throwable $e) { /* correo best-effort */ }
}

respond(['ok' => true, 'ticket_url' => 'shop/ticket.php?id=' . $id]);
