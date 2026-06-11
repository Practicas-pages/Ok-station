<?php
/** POST /backend/api/orders/repeat.php — duplica un pedido propio en uno nuevo. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('POST');

$user = current_user();
$id   = (int) (body()['id'] ?? 0);

$o = Order::find($id);
if (!$o) fail('Pedido no encontrado.', 404);
if ((int) $o['user_id'] !== (int) $user['id']) fail('No autorizado.', 403);

$items = Order::items($id);
if (!count($items)) fail('El pedido no tiene ítems para repetir.');

$pdo = db();
$pdo->beginTransaction();
try {
    $pdo->prepare('INSERT INTO orders (user_id, code, comments, subtotal, tax, total) VALUES (?,?,?,0,0,0)')
        ->execute([(int) $user['id'], 'TMP', $o['comments']]);
    $newId = (int) $pdo->lastInsertId();
    $code  = 'OKS-' . date('Y') . '-' . str_pad((string) $newId, 6, '0', STR_PAD_LEFT);

    $ins = $pdo->prepare(
        'INSERT INTO order_items (order_id, service_id, uploaded_file_id, config_json, qty, unit_price, line_total) VALUES (?,?,?,?,?,?,?)'
    );
    $subtotal = 0.0;
    foreach ($items as $it) {
        $subtotal += (float) $it['line_total'];
        $ins->execute([
            $newId, $it['service_id'], $it['uploaded_file_id'], $it['config_json'],
            (int) $it['qty'], (float) $it['unit_price'], (float) $it['line_total'],
        ]);
    }
    // Recalcula el IVA con la misma tasa efectiva del pedido original.
    $taxRate = (float) $o['subtotal'] > 0 ? ((float) $o['tax'] / (float) $o['subtotal']) : 0.16;
    $tax   = round($subtotal * $taxRate, 2);
    $total = round($subtotal + $tax, 2);
    $pdo->prepare('UPDATE orders SET code=?, subtotal=?, tax=?, total=? WHERE id=?')
        ->execute([$code, $subtotal, $tax, $total, $newId]);
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    fail('No se pudo repetir el pedido.', 500);
}

log_activity((int) $user['id'], 'order.repeat', 'orders', $newId, ['from' => $id]);
$order = Order::find($newId);
$order['items'] = Order::items($newId);
respond(['ok' => true, 'order' => $order], 201);
