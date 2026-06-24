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

/* Resiliente: si la migración de pago (0008_payments.sql) aún no se aplicó, las
   columnas payment_* no existen. Detectamos y, si faltan, omitimos esas columnas/
   filtros para que el panel de Pedidos SIEMPRE cargue. */
$hasPay      = table_has_column('orders', 'payment_status');
$canSeeMoney = $hasPay && user_has_role((int) $user['id'], ['administrador', 'directivo']);

$status   = $_GET['status'] ?? null;
$payment  = $_GET['payment'] ?? null;
$q        = trim((string) ($_GET['q'] ?? ''));
$valid    = ['recibido', 'en_revision', 'en_produccion', 'listo', 'entregado', 'cancelado'];
$validPay = ['pendiente', 'procesando', 'pagado', 'error', 'reembolsado'];

$payCol    = $hasPay ? 'o.payment_status,' : '';
/* Teléfono del cliente: solo si la migración 0012 ya creó la columna (resiliente). */
$phoneCol  = table_has_column('orders', 'contact_phone') ? 'o.contact_phone,' : '';
// Columnas financieras solo para administrador/directivo (y si existen en la BD).
$moneyCols = $canSeeMoney
    ? ', o.payment_provider, o.payment_reference, o.payment_amount, o.payment_date, o.payment_transaction_id'
    : '';

$sql = "SELECT o.id, o.user_id, o.code, o.status, o.total, $payCol $phoneCol DATE(o.created_at) AS date,
               u.full_name AS client, u.email AS client_email,
               (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items
               $moneyCols
        FROM orders o JOIN users u ON u.id = o.user_id";
$where = []; $params = [];
if ($status && in_array($status, $valid, true))               { $where[] = "o.status = ?";         $params[] = $status; }
if ($hasPay && $payment && in_array($payment, $validPay, true)) { $where[] = "o.payment_status = ?"; $params[] = $payment; }
if ($q !== '') {
    // Buscar por folio (+ referencia de pago si existe) o nombre del cliente.
    $like = '%' . $q . '%';
    if ($hasPay) { $where[] = "(o.code LIKE ? OR o.payment_reference LIKE ? OR u.full_name LIKE ?)"; array_push($params, $like, $like, $like); }
    else         { $where[] = "(o.code LIKE ? OR u.full_name LIKE ?)"; array_push($params, $like, $like); }
}
if ($where) $sql .= " WHERE " . implode(' AND ', $where);
$sql .= " ORDER BY o.created_at DESC LIMIT 200";

$st = db()->prepare($sql);
$st->execute($params);
$orders = $st->fetchAll();
if (!$hasPay) { foreach ($orders as &$o) { $o['payment_status'] = 'pendiente'; } unset($o); }

log_activity((int) $user['id'], 'orders.view', 'orders', null, ['status' => $status, 'payment' => $payment]);

respond(['ok' => true, 'orders' => $orders, 'count' => count($orders), 'can_see_money' => $canSeeMoney, 'payments_enabled' => $hasPay]);
