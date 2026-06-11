<?php
/** GET /backend/api/orders/list.php — historial de pedidos del usuario. Requiere sesión. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = current_user();
$st = db()->prepare(
    'SELECT o.id, o.code, o.status, o.subtotal, o.tax, o.total, o.ticket_path, o.created_at,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count
     FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC'
);
$st->execute([(int) $user['id']]);

respond(['ok' => true, 'orders' => $st->fetchAll()]);
