<?php
/** GET /backend/api/orders/list.php — historial de pedidos del usuario. Requiere sesión. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = current_user();
$st = db()->prepare(
    'SELECT o.id, o.code, o.status, o.subtotal, o.tax, o.total, o.created_at,
            o.payment_status, o.payment_reference, o.payment_amount, o.payment_date,
            (o.ticket_path IS NOT NULL AND o.ticket_path <> "") AS has_ticket,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count
     FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC'
);
$st->execute([(int) $user['id']]);

respond(['ok' => true, 'orders' => $st->fetchAll()]);
