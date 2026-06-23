<?php
/**
 * GET /backend/api/admin/reports.php — Reporte de corte (ventas + pedidos + citas).
 * Sirve a empleados y directivos para el corte de caja y el control del negocio.
 *
 * Parámetros:
 *   period = day | week | month   (default: day)
 *   date   = YYYY-MM-DD            (ancla del periodo; default: hoy)
 *
 * Requiere el permiso 'stats.view' (lo tienen empleado, administrador y directivo).
 */
require __DIR__ . '/../_bootstrap.php';
require __DIR__ . '/../lib/authz.php';
only_method('GET');
require_permission('stats.view');

$period = strtolower(trim((string) ($_GET['period'] ?? 'day')));
if (!in_array($period, ['day', 'week', 'month'], true)) $period = 'day';

$dateStr = trim((string) ($_GET['date'] ?? ''));
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateStr)) $dateStr = date('Y-m-d');
$anchor = strtotime($dateStr);
if ($anchor === false) { $anchor = time(); $dateStr = date('Y-m-d'); }

/* Rango [start, end) — end es exclusivo (primer día fuera del periodo). */
if ($period === 'day') {
    $start = date('Y-m-d', $anchor);
    $end   = date('Y-m-d', strtotime('+1 day', $anchor));
    $label = $start;
} elseif ($period === 'week') {
    $dow   = (int) date('N', $anchor);                 // 1 (lun) … 7 (dom)
    $monTs = strtotime('-' . ($dow - 1) . ' day', $anchor);
    $start = date('Y-m-d', $monTs);
    $end   = date('Y-m-d', strtotime('+7 day', $monTs));
    $label = $start . ' al ' . date('Y-m-d', strtotime('+6 day', $monTs));
} else { // month
    $start = date('Y-m-01', $anchor);
    $end   = date('Y-m-01', strtotime('+1 month', strtotime($start)));
    $label = date('Y-m', $anchor);
}

$pdo = db();

/* ── Pedidos en el periodo (por estado: cantidad y monto) ── */
$STATUS = ['recibido', 'en_revision', 'en_produccion', 'listo', 'entregado', 'cancelado'];
$ordersByStatus = [];
foreach ($STATUS as $s) $ordersByStatus[$s] = ['count' => 0, 'sales' => 0.0];

$ordersCount = 0;
$salesTotal  = 0.0;   // ventas reales = todo lo no cancelado
$st = $pdo->prepare("SELECT status, COUNT(*) c, COALESCE(SUM(total),0) v FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY status");
$st->execute([$start . ' 00:00:00', $end . ' 00:00:00']);
foreach ($st->fetchAll() as $r) {
    $s = $r['status'];
    if (!isset($ordersByStatus[$s])) $ordersByStatus[$s] = ['count' => 0, 'sales' => 0.0];
    $ordersByStatus[$s]['count'] = (int) $r['c'];
    $ordersByStatus[$s]['sales'] = (float) $r['v'];
    $ordersCount += (int) $r['c'];
    if ($s !== 'cancelado') $salesTotal += (float) $r['v'];
}

/* ── Citas en el periodo (por estado y por trámite) ── */
$apptCount     = 0;
$apptByStatus  = [];
$apptByTramite = [];
try {
    $st = $pdo->prepare("SELECT status, COUNT(*) c FROM appointments WHERE appt_date >= ? AND appt_date < ? GROUP BY status");
    $st->execute([$start, $end]);
    foreach ($st->fetchAll() as $r) {
        $apptByStatus[$r['status']] = (int) $r['c'];
        $apptCount += (int) $r['c'];
    }
    $st = $pdo->prepare("SELECT tramite, COUNT(*) c FROM appointments WHERE appt_date >= ? AND appt_date < ? GROUP BY tramite");
    $st->execute([$start, $end]);
    foreach ($st->fetchAll() as $r) {
        $apptByTramite[$r['tramite']] = (int) $r['c'];
    }
} catch (Throwable $e) { /* sin tabla de citas todavía */ }

respond([
    'ok'        => true,
    'period'    => $period,
    'date'      => $dateStr,
    'range'     => ['start' => $start, 'end' => $end, 'label' => $label],
    'generated' => date('Y-m-d H:i'),
    'orders'    => [
        'count'    => $ordersCount,
        'sales'    => round($salesTotal, 2),
        'byStatus' => $ordersByStatus,
    ],
    'appointments' => [
        'count'     => $apptCount,
        'byStatus'  => $apptByStatus,
        'byTramite' => $apptByTramite,
    ],
]);
