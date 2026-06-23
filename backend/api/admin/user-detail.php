<?php
/**
 * GET /backend/api/admin/user-detail.php?id=123 — Historial completo de un usuario.
 * Devuelve datos del usuario + sus pedidos, citas, servicios de impresión tomados
 * y sus movimientos (bitácora). Para el panel (staff/directivo).
 *
 * Requiere el permiso 'users.view' (empleado lo tiene; administrador y directivo, todo).
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');
require_permission('users.view');

$id = (int) ($_GET['id'] ?? 0);
if ($id <= 0) fail('Falta el id del usuario.', 422);

$pdo = db();

$st = $pdo->prepare("SELECT id, full_name AS name, email, phone, address, is_active AS active, DATE(created_at) AS joined, last_login_at FROM users WHERE id = ?");
$st->execute([$id]);
$user = $st->fetch();
if (!$user) fail('Usuario no encontrado.', 404);

/* ── Pedidos del usuario ── */
$st = $pdo->prepare(
    "SELECT o.code, o.status, o.total, DATE(o.created_at) AS date,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items
     FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 200"
);
$st->execute([$id]);
$orders = $st->fetchAll();

$ordersCount = count($orders);
$salesTotal  = 0.0;
foreach ($orders as $o) if ($o['status'] !== 'cancelado') $salesTotal += (float) $o['total'];

/* ── Servicios de impresión tomados (tamaños desde la config de cada ítem) ── */
$services = [];
try {
    $st = $pdo->prepare(
        "SELECT JSON_UNQUOTE(JSON_EXTRACT(oi.config_json,'$.size')) name, COUNT(*) count
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.user_id = ? AND oi.config_json IS NOT NULL
         GROUP BY name ORDER BY count DESC LIMIT 20"
    );
    $st->execute([$id]);
    foreach ($st->fetchAll() as $r) {
        if ($r['name'] === null) continue;
        $services[] = ['name' => $r['name'], 'count' => (int) $r['count']];
    }
} catch (Throwable $e) { /* JSON no soportado */ }

/* ── Citas del usuario ── */
$appointments = [];
try {
    $st = $pdo->prepare(
        "SELECT code, tramite, passport_subtype, party_size, appt_date AS date, appt_time AS time, status
         FROM appointments WHERE user_id = ? ORDER BY appt_date DESC, appt_time DESC LIMIT 200"
    );
    $st->execute([$id]);
    $appointments = $st->fetchAll();
} catch (Throwable $e) { /* sin tabla de citas */ }

/* ── Movimientos (bitácora) ── */
$movements = [];
try {
    $st = $pdo->prepare(
        "SELECT action, entity, entity_id, DATE_FORMAT(created_at,'%Y-%m-%d %H:%i') AS at
         FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100"
    );
    $st->execute([$id]);
    $movements = $st->fetchAll();
} catch (Throwable $e) { /* sin bitácora */ }

respond([
    'ok'           => true,
    'user'         => $user,
    'summary'      => ['orders' => $ordersCount, 'sales' => round($salesTotal, 2), 'appointments' => count($appointments)],
    'orders'       => $orders,
    'services'     => $services,
    'appointments' => $appointments,
    'movements'    => $movements,
]);
