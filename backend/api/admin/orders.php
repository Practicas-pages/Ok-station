<?php
/**
 * Ejemplo de endpoint ADMIN protegido por permiso.
 * GET /backend/api/admin/orders.php?status=recibido
 * Requiere el permiso 'orders.view' (rol empleado o administrador).
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');

$user = require_permission('orders.view');

$status = $_GET['status'] ?? null;
$valid  = ['recibido', 'en_revision', 'en_produccion', 'listo', 'entregado', 'cancelado'];

$sql = "SELECT o.id, o.code, o.status, o.total, DATE(o.created_at) AS date, u.full_name AS client,
               (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items
        FROM orders o JOIN users u ON u.id = o.user_id";
$params = [];
if ($status && in_array($status, $valid, true)) { $sql .= " WHERE o.status = ?"; $params[] = $status; }
$sql .= " ORDER BY o.created_at DESC LIMIT 200";

$st = db()->prepare($sql);
$st->execute($params);
$orders = $st->fetchAll();

log_activity((int) $user['id'], 'orders.view', 'orders', null, ['status' => $status]);

respond(['ok' => true, 'orders' => $orders, 'count' => count($orders)]);
