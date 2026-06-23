<?php
/**
 * Endpoint ADMIN de pedidos.
 * GET /backend/api/admin/orders.php?status=recibido&payment=pagado&q=PAY-OKS...
 * Requiere el permiso 'orders.view' (rol empleado, administrador o directivo).
 *
 * DATOS FINANCIEROS: el estado del pago (operativo) lo ve todo el staff, pero
 * los montos, la referencia y el id de transacción SOLO los ven 'administrador'
 * y 'directivo' (no el 'empleado').
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = require_permission('orders.view');

$canSeeMoney = user_has_role((int) $user['id'], ['administrador', 'directivo']);

$status   = $_GET['status'] ?? null;
$payment  = $_GET['payment'] ?? null;
$q        = trim((string) ($_GET['q'] ?? ''));
$valid    = ['recibido', 'en_revision', 'en_produccion', 'listo', 'entregado', 'cancelado'];
$validPay = ['pendiente', 'procesando', 'pagado', 'error', 'reembolsado'];

// Columnas financieras solo para administrador/directivo.
$moneyCols = $canSeeMoney
    ? ', o.payment_provider, o.payment_reference, o.payment_amount, o.payment_date, o.payment_transaction_id'
    : '';

$sql = "SELECT o.id, o.code, o.status, o.total, o.payment_status, DATE(o.created_at) AS date,
               u.full_name AS client,
               (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items
               $moneyCols
        FROM orders o JOIN users u ON u.id = o.user_id";
$where = []; $params = [];
if ($status && in_array($status, $valid, true))      { $where[] = "o.status = ?";         $params[] = $status; }
if ($payment && in_array($payment, $validPay, true)) { $where[] = "o.payment_status = ?"; $params[] = $payment; }
if ($q !== '') {
    // Buscar por folio, referencia de pago o nombre del cliente.
    $where[] = "(o.code LIKE ? OR o.payment_reference LIKE ? OR u.full_name LIKE ?)";
    $like = '%' . $q . '%';
    array_push($params, $like, $like, $like);
}
if ($where) $sql .= " WHERE " . implode(' AND ', $where);
$sql .= " ORDER BY o.created_at DESC LIMIT 200";

$st = db()->prepare($sql);
$st->execute($params);
$orders = $st->fetchAll();

log_activity((int) $user['id'], 'orders.view', 'orders', null, ['status' => $status, 'payment' => $payment]);

respond(['ok' => true, 'orders' => $orders, 'count' => count($orders), 'can_see_money' => $canSeeMoney]);
