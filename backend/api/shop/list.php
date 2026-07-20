<?php
/** GET /backend/api/shop/list.php — historial de compras de tienda del usuario. Requiere sesión. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = current_user();

$st = db()->prepare(
    'SELECT s.id, s.code, s.status, s.ship_mode, s.subtotal, s.tax, s.ship_cost, s.total,
            s.payment_status, s.payment_amount, s.payment_date, s.created_at,
            (SELECT COUNT(*) FROM shop_order_items i WHERE i.shop_order_id = s.id) AS items_count
     FROM shop_orders s WHERE s.user_id = ? ORDER BY s.created_at DESC'
);
$st->execute([(int) $user['id']]);
respond(['ok' => true, 'orders' => $st->fetchAll()]);
