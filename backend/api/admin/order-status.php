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

respond(['ok' => true]);
