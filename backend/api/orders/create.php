<?php
/** POST /backend/api/orders/create.php — crea un pedido con sus ítems. Requiere sesión.
 *  SEGURIDAD: el precio se recalcula EN EL SERVIDOR; se ignora todo monto del cliente.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
require __DIR__ . '/../lib/Pricing.php';
only_method('POST');

$user  = current_user();
$b     = body();
$items = $b['items'] ?? [];
$comments = trim((string) ($b['comments'] ?? ''));

if (!is_array($items) || count($items) === 0) fail('El pedido no tiene ítems.');
if (count($items) > 50) fail('Demasiados ítems en un solo pedido (máximo 50).');
if (mb_strlen($comments) > 1000) fail('Los comentarios son demasiado largos.');

$taxRate  = Pricing::taxRate();
$pdo      = db();
$fileStmt = $pdo->prepare('SELECT id, pages FROM uploaded_files WHERE id = ? AND user_id = ?');

$pdo->beginTransaction();
try {
    $pdo->prepare('INSERT INTO orders (user_id, code, comments, subtotal, tax, total) VALUES (?,?,?,0,0,0)')
        ->execute([(int) $user['id'], 'TMP', $comments !== '' ? $comments : null]);
    $orderId = (int) $pdo->lastInsertId();
    $code = 'OKS-' . date('Y') . '-' . str_pad((string) $orderId, 6, '0', STR_PAD_LEFT);

    $ins = $pdo->prepare(
        'INSERT INTO order_items (order_id, service_id, uploaded_file_id, config_json, qty, unit_price, line_total) VALUES (?,?,?,?,?,?,?)'
    );
    $subtotal = 0.0;
    foreach ($items as $it) {
        $fileId = (int) ($it['uploaded_file_id'] ?? 0);
        $cfg    = is_array($it['config'] ?? null) ? $it['config'] : [];
        $qty    = max(1, (int) ($it['qty'] ?? 1));

        // El archivo DEBE existir y pertenecer al usuario. Las páginas salen de la BD, no del cliente.
        $fileStmt->execute([$fileId, (int) $user['id']]);
        $file = $fileStmt->fetch();
        if (!$file) { $pdo->rollBack(); fail('Archivo no válido en el pedido.', 422); }
        $pages = (int) $file['pages'];

        // PRECIO RECALCULADO EN EL SERVIDOR (se ignora cualquier monto del navegador).
        $price = Pricing::line($cfg, $pages, $qty);
        $subtotal += $price['line'];

        $ins->execute([
            $orderId,
            isset($it['service_id']) ? (int) $it['service_id'] : null,
            $fileId,
            json_encode($cfg, JSON_UNESCAPED_UNICODE),
            $qty, $price['unit'], $price['line'],
        ]);
    }

    $subtotal = round($subtotal, 2);
    $tax      = round($subtotal * $taxRate, 2);
    $total    = round($subtotal + $tax, 2);
    $pdo->prepare('UPDATE orders SET code=?, subtotal=?, tax=?, total=? WHERE id=?')
        ->execute([$code, $subtotal, $tax, $total, $orderId]);

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo crear el pedido.', 500);
}

log_activity((int) $user['id'], 'order.create', 'orders', $orderId);
db()->prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)')
    ->execute([(int) $user['id'], 'order', 'Pedido recibido', 'Tu pedido ' . $code . ' fue recibido.']);

$order = Order::find($orderId);
$order['items'] = Order::items($orderId);
respond(['ok' => true, 'order' => $order], 201);
