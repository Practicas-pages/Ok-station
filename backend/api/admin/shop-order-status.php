<?php
/** POST /backend/api/admin/shop-order-status.php — actualiza estado y/o nota de una compra. Requiere permiso. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

$user = require_permission('shop.update_status');
$b    = body();
$id   = (int) ($b['id'] ?? 0);
$status = (string) ($b['status'] ?? '');
$note   = trim((string) ($b['note'] ?? ''));

$valid = ['recibido', 'en_preparacion', 'listo', 'entregado', 'cancelado'];
if (!in_array($status, $valid, true)) fail('Estado inválido.');

$o = ShopOrder::find($id);
if (!$o) fail('Pedido no encontrado.', 404);

$data = ['status' => $status];
if ($note !== '') {
    $data['staff_notes'] = trim((string) ($o['staff_notes'] ?? '') . "\n" . $note);
}
if ($status === 'entregado' && empty($o['entregado_at'])) {
    $data['entregado_at'] = date('Y-m-d H:i:s');
}
ShopOrder::update($id, $data);

log_activity((int) $user['id'], 'shop.status_changed', 'shop_orders', $id, ['status' => $status]);
try {
    db()->prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)')
        ->execute([(int) $o['user_id'], 'shop', 'Estado actualizado', 'Tu pedido ' . $o['code'] . ' ahora está: ' . str_replace('_', ' ', $status) . '.']);
} catch (Throwable $e) { /* best-effort */ }

/* Aviso por CORREO del cambio de estado (el de 'listo' es el "listo para recoger"). Best-effort. */
try {
    require_once __DIR__ . '/../lib/Mail.php';
    require_once __DIR__ . '/../lib/Emails.php';
    $cu = User::find((int) $o['user_id']);
    $to = trim((string) ($cu['email'] ?? ''));
    if ($to !== '') {
        $html = Emails::tiendaEstadoHtml([
            'name'   => (string) ($cu['full_name'] ?? ''),
            'code'   => (string) $o['code'],
            'status' => $status,
        ]);
        Mail::sendHtml(
            $to,
            'Tu compra ' . $o['code'] . ' — ' . Emails::shopStatusLabel($status) . ' · Ok.station',
            $html,
            'Tu pedido ' . $o['code'] . ' ahora está: ' . str_replace('_', ' ', $status) . '.'
        );
    }
} catch (Throwable $e) { /* best-effort */ }

respond(['ok' => true]);
