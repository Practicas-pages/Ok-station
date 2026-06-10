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
$conds  = ($status && in_array($status, $valid, true)) ? ['status' => $status] : [];

$orders = Order::where($conds, 'created_at DESC');

log_activity((int) $user['id'], 'orders.view', 'orders', null, ['status' => $status]);

respond(['ok' => true, 'orders' => $orders, 'count' => count($orders)]);
