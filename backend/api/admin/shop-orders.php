<?php
/**
 * Endpoint ADMIN de pedidos de la TIENDA (e-commerce).
 * GET /backend/api/admin/shop-orders.php?status=recibido&payment=pagado&q=TDA...
 * Requiere el permiso 'shop.view'. Los montos/referencia SOLO los ven administrador/directivo.
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = require_permission('shop.view');
$canSeeMoney = user_has_role((int) $user['id'], ['administrador', 'directivo']);

$status   = $_GET['status'] ?? null;
$payment  = $_GET['payment'] ?? null;
$q        = trim((string) ($_GET['q'] ?? ''));
$valid    = ['recibido', 'en_preparacion', 'listo', 'entregado', 'cancelado'];
$validPay = ['pendiente', 'procesando', 'pagado', 'error', 'reembolsado'];

$moneyCols = $canSeeMoney
    ? ', s.subtotal, s.tax, s.ship_cost, s.payment_provider, s.payment_reference, s.payment_amount, s.payment_date, s.payment_transaction_id'
    : '';

$sql = "SELECT s.id, s.user_id, s.code, s.status, s.payment_status, s.ship_mode, s.total, s.contact_phone,
               DATE(s.created_at) AS date, u.full_name AS client, u.email AS client_email,
               (SELECT COUNT(*) FROM shop_order_items i WHERE i.shop_order_id = s.id) AS items
               $moneyCols
        FROM shop_orders s JOIN users u ON u.id = s.user_id";
$where = []; $params = [];
if ($status && in_array($status, $valid, true))    { $where[] = "s.status = ?";         $params[] = $status; }
if ($payment && in_array($payment, $validPay, true)) { $where[] = "s.payment_status = ?"; $params[] = $payment; }
if ($q !== '') {
    $like = '%' . $q . '%';
    $where[] = "(s.code LIKE ? OR s.payment_reference LIKE ? OR u.full_name LIKE ?)";
    array_push($params, $like, $like, $like);
}
if ($where) $sql .= " WHERE " . implode(' AND ', $where);
$sql .= " ORDER BY s.created_at DESC LIMIT 200";

$st = db()->prepare($sql);
$st->execute($params);
$orders = $st->fetchAll();

log_activity((int) $user['id'], 'shop.view', 'shop_orders', null, ['status' => $status, 'payment' => $payment]);
respond(['ok' => true, 'orders' => $orders, 'count' => count($orders), 'can_see_money' => $canSeeMoney, 'payments_enabled' => true]);
