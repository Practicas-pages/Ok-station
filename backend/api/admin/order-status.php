<?php
/** POST /backend/api/admin/order-status.php — actualiza estado y/o nota interna. Requiere permiso. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

$user = require_permission('orders.update_status');
$b    = body();
$id   = (int) ($b['id'] ?? 0);
$status = (string) ($b['status'] ?? '');
$note   = trim((string) ($b['note'] ?? ''));

$valid = ['recibido', 'en_revision', 'en_produccion', 'listo', 'entregado', 'cancelado'];
if (!in_array($status, $valid, true)) fail('Estado inválido.');

$o = Order::find($id);
if (!$o) fail('Pedido no encontrado.', 404);

$data = ['status' => $status];
if ($note !== '') {
    $data['staff_notes'] = trim((string) ($o['staff_notes'] ?? '') . "\n" . $note);
}
Order::update($id, $data);

log_activity((int) $user['id'], 'order.status_changed', 'orders', $id, ['status' => $status]);
db()->prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)')
    ->execute([(int) $o['user_id'], 'order', 'Estado actualizado', 'Tu pedido ' . $o['code'] . ' ahora está: ' . str_replace('_', ' ', $status) . '.']);

// Aviso por correo al cliente con su comprobante PDF adjunto (best-effort: nunca rompe la petición).
try {
    require_once __DIR__ . '/../lib/Mailer.php';
    $cust  = user_public((int) $o['user_id']);
    $email = $cust['email'] ?? '';
    if ($email !== '') {
        $labels = [
            'recibido' => 'Recibido', 'en_revision' => 'En revisión', 'en_produccion' => 'En producción',
            'listo' => 'Listo para recoger', 'entregado' => 'Entregado', 'cancelado' => 'Cancelado',
        ];
        $extra = [
            'en_revision'   => 'Estamos revisando tu pedido y sus archivos.',
            'en_produccion' => 'Ya estamos trabajando en tu pedido.',
            'listo'         => '¡Tu pedido está listo! Pasa a recogerlo en Centro Comercial Otay, Tijuana.',
            'entregado'     => 'Gracias por tu preferencia. ¡Te esperamos pronto!',
            'cancelado'     => 'Tu pedido fue cancelado. Si tienes dudas, contáctanos.',
        ];
        $label = $labels[$status] ?? $status;
        $bodyTxt = 'Hola ' . ($cust['full_name'] ?? '') . ",\n\n" .
            'El estado de tu pedido ' . $o['code'] . ' cambió a: ' . $label . ".\n" .
            (isset($extra[$status]) ? $extra[$status] . "\n" : '') .
            ($note !== '' ? "\nNota: " . $note . "\n" : '') .
            "\nGracias,\nOK.station — Centro Comercial Otay, Tijuana";
        $atts = [];
        if (!empty($o['ticket_path']) && is_file($o['ticket_path'])) {
            $atts[] = ['name' => 'ticket-' . $o['code'] . '.pdf', 'type' => 'application/pdf', 'data' => (string) @file_get_contents($o['ticket_path'])];
        }
        (new Mailer($CONFIG['smtp'] ?? []))->send($email, 'Tu pedido en OK.station — ' . $o['code'], $bodyTxt, $atts);
    }
} catch (Throwable $e) { /* el correo no debe afectar la respuesta */ }

respond(['ok' => true]);
