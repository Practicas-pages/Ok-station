<?php
/** GET /backend/api/orders/list.php — historial de pedidos del usuario. Requiere sesión. */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = current_user();

/* Resiliente: si aún no se aplicó la migración de pago (0008_payments.sql), las
   columnas payment_* no existen. En ese caso las omitimos y sintetizamos un estado
   por defecto, para que "Mis pedidos" SIEMPRE cargue. */
$hasPay  = table_has_column('orders', 'payment_status');
$payCols = $hasPay
    ? 'o.payment_status, o.payment_reference, o.payment_amount, o.payment_date,'
    : '';
/* Marca "por cotizar": solo si la migración 0022 ya creó la columna (resiliente).
   quoted_at distingue "por cotizar y aún sin precio" de "ya cotizado" (mixtos). */
$hasQuote  = table_has_column('orders', 'needs_quote');
$quoteCols = $hasQuote ? 'o.needs_quote, o.quoted_at,' : '';

$st = db()->prepare(
    'SELECT o.id, o.code, o.status, o.subtotal, o.tax, o.total, o.created_at, ' . $payCols . $quoteCols . '
            (o.ticket_path IS NOT NULL AND o.ticket_path <> "") AS has_ticket,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count
     FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC'
);
$st->execute([(int) $user['id']]);
$orders = $st->fetchAll();

if (!$hasPay) {
    foreach ($orders as &$o) { $o['payment_status'] = 'pendiente'; }
    unset($o);
}
if (!$hasQuote) {
    foreach ($orders as &$o) { $o['needs_quote'] = 0; $o['quoted_at'] = null; }
    unset($o);
}

respond(['ok' => true, 'orders' => $orders, 'payments_enabled' => $hasPay]);
